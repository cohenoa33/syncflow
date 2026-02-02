/**
 * Demo Mode Routes - Tenant-Scoped Demo Data Management
 *
 * Behavior:
 * - Dev mode (AUTH_MODE=dev): No demo token required
 * - Strict mode (AUTH_MODE=strict): Requires demo token
 *   - If TENANTS_JSON configured: X-Demo-Token: ${DEMO_MODE_TOKEN}
 *   - If TENANTS_JSON empty: Authorization: Bearer ${DEMO_MODE_TOKEN}
 * - All operations are tenant-scoped (use req.tenantId from auth middleware)
 * - Demo events marked with source: "demo" (preserves real data)
 * - Demo apps named: demo-${tenantId}-app, demo-app-${tenantId}
 * - Socket broadcasts to tenant room only: tenant:${tenantId}
 */
import type { Express, Request } from "express";
import type { Server } from "socket.io";
import { EventModel } from "../models";
import { eventsBuffer } from "../state";
import { generateDemoTraces } from "../demo/seed";
import { getAuthConfig } from "../tenants";

const DEMO_SOURCE = "demo";

function extractBearerToken(req: Request): string {
  const auth = String(req.headers.authorization ?? "").trim();
  if (!auth.toLowerCase().startsWith("bearer ")) return "";
  return auth.slice("bearer ".length).trim();
}

function isTenantsConfigured(): boolean {
  const raw = String(process.env.TENANTS_JSON ?? "").trim();
  if (!raw) return false;

  try {
    const parsed = JSON.parse(raw);
    return (
      !!parsed && typeof parsed === "object" && Object.keys(parsed).length > 0
    );
  } catch {
    // If invalid JSON is set, treat as configured (fail closed)
    return true;
  }
}

/**
 * Check if demo mode is enabled based on config rules:
 * - DEMO_MODE_ENABLED must be "true"
 * - In dev mode: enabled if DEMO_MODE_ENABLED=true
 * - In strict mode: enabled only if DEMO_MODE_TOKEN is configured (non-empty)
 */
function isDemoAvailable(): boolean {
  if (process.env.DEMO_MODE_ENABLED !== "true") return false;

  const { authMode } = getAuthConfig();
  if (authMode === "dev") return true;

  const demoToken = String(process.env.DEMO_MODE_TOKEN ?? "").trim();
  return authMode === "strict" && demoToken.length > 0;
}

/**
 * Validate demo token based on auth mode:
 * - Dev mode: no token required
 * - Strict mode:
 *   - If TENANTS_JSON configured: requires X-Demo-Token header
 *   - If TENANTS_JSON empty: requires Authorization Bearer token
 */
function validateDemoToken(req: Request): boolean {
  const { authMode } = getAuthConfig();
  if (authMode === "dev") return true;

  const expected = String(process.env.DEMO_MODE_TOKEN ?? "").trim();
  if (!expected) return false;

  if (isTenantsConfigured()) {
    const provided = String(req.headers["x-demo-token"] ?? "").trim();
    return provided === expected;
  }

  const bearer = extractBearerToken(req);
  return bearer === expected;
}

export function registerDemoRoutes(app: Express, io: Server) {
  app.post("/api/demo-seed", async (req, res) => {
    try {
      if (!isDemoAvailable()) {
        return res.status(403).json({
          ok: false,
          error: "DEMO_MODE_DISABLED",
          message: "Demo mode is not enabled on this server."
        });
      }

      if (!validateDemoToken(req)) {
        return res.status(401).json({
          ok: false,
          error: "UNAUTHORIZED",
          message: "Missing or invalid demo token"
        });
      }

      const tenantId = (req as any).tenantId as string | undefined;
      if (!tenantId) {
        return res.status(500).json({
          ok: false,
          error: "BUG",
          message: "tenantId not attached by auth middleware"
        });
      }

      const demoApps = [`demo-${tenantId}-app`, `demo-app-${tenantId}`];

      const requested: string[] =
        Array.isArray((req as any).body?.apps) && (req as any).body.apps.length
          ? (req as any).body.apps
          : demoApps;

      // Only delete demo-seeded traces for this tenant (do NOT wipe real data)
      await EventModel.deleteMany({ tenantId, source: DEMO_SOURCE });

      const all: any[] = [];
      const traceIdsByApp: Record<string, string[]> = {};

      for (const appName of requested) {
        const seeded = generateDemoTraces(appName).map((e) => ({
          ...e,
          tenantId,
          source: DEMO_SOURCE
        }));

        all.push(...seeded);

        traceIdsByApp[appName] = Array.from(
          new Set(seeded.map((e) => e.traceId).filter(Boolean))
        );
      }

      if (all.length > 0) {
        await EventModel.insertMany(all);

        // keep buffer bounded
        for (const e of all) eventsBuffer.push(e);
        while (eventsBuffer.length > 1000) eventsBuffer.shift();

        const room = `tenant:${tenantId}`;
        for (const e of all) io.to(room).emit("event", e);
      }

      console.log(
        `[Dashboard] Seeded demo traces: ${all.length} events (tenant=${tenantId})`
      );

      return res.json({ ok: true, count: all.length, traceIdsByApp, tenantId });
    } catch (err) {
      console.error("[Dashboard] Failed to seed demo traces", err);
      return res.status(500).json({ ok: false });
    }
  });

  app.delete("/api/demo-seed", async (req, res) => {
    try {
      if (!isDemoAvailable()) {
        return res.status(403).json({
          ok: false,
          error: "DEMO_MODE_DISABLED",
          message: "Demo mode is not enabled on this server."
        });
      }

      if (!validateDemoToken(req)) {
        return res.status(401).json({
          ok: false,
          error: "UNAUTHORIZED",
          message: "Missing or invalid demo token"
        });
      }

      const tenantId = (req as any).tenantId as string | undefined;
      if (!tenantId) {
        return res.status(500).json({
          ok: false,
          error: "BUG",
          message: "tenantId not attached by auth middleware"
        });
      }

      // Only delete demo-seeded events for this tenant
      await EventModel.deleteMany({ tenantId, source: DEMO_SOURCE });

      // remove demo events for this tenant from in-memory buffer
      for (let i = eventsBuffer.length - 1; i >= 0; i--) {
        const ev: any = eventsBuffer[i];
        if (ev?.tenantId === tenantId && ev?.source === DEMO_SOURCE) {
          eventsBuffer.splice(i, 1);
        }
      }

      const room = `tenant:${tenantId}`;
      io.to(room).emit("eventHistory", []);

      console.log(`[Dashboard] Cleared demo traces (tenant=${tenantId})`);

      return res.json({ ok: true, tenantId });
    } catch (err) {
      console.error("[Dashboard] Failed to clear demo traces", err);
      return res.status(500).json({ ok: false });
    }
  });
}
