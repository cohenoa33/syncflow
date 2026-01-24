// packages/dashboard-web/server/routes/demo.ts
import type { Express } from "express";
import type { Server } from "socket.io";
import { EventModel } from "../models";
import { eventsBuffer } from "../state";
import { generateDemoTraces } from "../demo/seed";
import { getTenantId } from "../tenants";

const DEMO_SOURCE = "demo";

function isDemoModeEnabled(): boolean {
  return process.env.DEMO_MODE_ENABLED === "true";
}

// Optional: keep token gating only if you want “public demo” safety.
// If you don’t need public demo, you can remove this entirely.
function validateDemoTokenIfConfigured(reqAuthHeader: string): boolean {
  const expected = (process.env.DEMO_MODE_TOKEN ?? "").trim();
  if (!expected) return true; // if not configured, don't block
  const token = reqAuthHeader.startsWith("Bearer ")
    ? reqAuthHeader.slice("Bearer ".length)
    : "";
  return token === expected;
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

      // Gate 2 (optional): require demo token ONLY if DEMO_MODE_TOKEN is set
      if (!validateDemoTokenIfConfigured(req.headers.authorization || "")) {
        return res.status(401).json({
          ok: false,
          error: "UNAUTHORIZED",
          message: "Missing or invalid demo token"
        });
      }

      const tenantId = getTenantId(req);

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

      if (!validateDemoTokenIfConfigured(req.headers.authorization || "")) {
        return res.status(401).json({
          ok: false,
          error: "UNAUTHORIZED",
          message: "Missing or invalid demo token"
        });
      }

      const tenantId = getTenantId(req);

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
