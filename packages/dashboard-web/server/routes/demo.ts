/**
 * Demo Mode Routes - Tenant-Scoped Demo Data Management
 *
 * Behavior:
 * - Dev mode (AUTH_MODE=dev): No demo token required
 * - Strict mode (AUTH_MODE=strict): Requires Authorization: Bearer ${DEMO_MODE_TOKEN}
 * - All operations are tenant-scoped (use X-Tenant-Id header)
 * - Demo events marked with source: "demo" (preserves real data)
 * - Demo apps named: demo-${tenantId}-app, demo-app-${tenantId}
 * - Socket broadcasts to tenant room only: tenant:${tenantId}
 */
import type { Express } from "express";
import type { Server } from "socket.io";
import { EventModel } from "../models";
import { eventsBuffer } from "../state";
import { generateDemoTraces } from "../demo/seed";
import type { Request } from "express";

const DEMO_SOURCE = "demo";

function isDemoModeEnabled(): boolean {
  return process.env.DEMO_MODE_ENABLED === "true";
}

function getAuthMode(): "dev" | "strict" {
  const mode = (process.env.AUTH_MODE || "dev").toLowerCase();
  return mode === "strict" ? "strict" : "dev";
}

function validateDemoToken(req: Request): boolean {
  const authMode = getAuthMode();
  const expected = (process.env.DEMO_MODE_TOKEN ?? "").trim();

  // Dev: allow demo without token
  if (authMode === "dev") return true;

  // Strict: must have DEMO_MODE_TOKEN configured AND must match header
  if (!expected) return false;

  const got = (req.headers["x-demo-token"] as string | undefined)?.trim() ?? "";
  return got !== "" && got === expected;
}

export function registerDemoRoutes(app: Express, io: Server) {
  app.post("/api/demo-seed", async (req, res) => {
    try {
      // Gate 1: Demo mode must be enabled
      if (!isDemoModeEnabled()) {
        return res.status(403).json({
          ok: false,
          error: "DEMO_MODE_DISABLED",
          message: "Demo mode is not enabled on this server."
        });
      }

      // Gate 2: In strict mode, require demo token
      if (!validateDemoToken(req)) {
        return res.status(401).json({
          ok: false,
          error: "UNAUTHORIZED",
          message: "Missing or invalid demo token"
        });
      }

      const tenantId = (req as any).tenantId;
      if (!tenantId) {
        return res.status(500).json({
          ok: false,
          error: "BUG",
          message: "tenantId not attached by auth middleware"
        });
      }

      // Generate demo app names for this tenant
      const demoApps = [`demo-${tenantId}-app`, `demo-app-${tenantId}`];

      // Use apps from request body if provided, otherwise use generated demo apps
      const requested =
        Array.isArray(req.body?.apps) && req.body.apps.length > 0
          ? req.body.apps
          : demoApps;

      // ✅ Only delete demo-seeded traces for this tenant (do NOT wipe real data)
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
      if (!isDemoModeEnabled()) {
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

      const tenantId = (req as any).tenantId;
      if (!tenantId) {
        return res.status(500).json({
          ok: false,
          error: "BUG",
          message: "tenantId not attached by auth middleware"
        });
      }

      // ✅ Only delete demo-seeded events for this tenant
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
