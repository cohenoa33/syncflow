import type { Express } from "express";
import { EventModel, InsightModel } from "../models";
import type { Server } from "socket.io";
import { eventsBuffer } from "../state";
import { getAuthConfig } from "../tenants";

export function registerTracesRoutes(app: Express, io: Server) {
  app.get("/api/traces", async (req, res) => {
    const tenantId = (req as any).tenantId;
    const { hasTenantsConfig } = getAuthConfig();

    // If TENANTS_JSON is empty, return empty array (no data to query)
    if (!hasTenantsConfig) {
      console.log(
        `[Dashboard] GET /api/traces: no TENANTS_JSON, returning [] (tenant: ${tenantId})`
      );
      return res.json([]);
    }

    // Return ALL events for this tenant (both demo and real)
    // Client-side filtering handles demo mode toggle
    const query: any = { tenantId };

    const latest = await EventModel.find(query)
      .sort({ ts: -1 })
      .limit(1000)
      .lean();

    res.json(latest);
  });

  app.delete("/api/traces", async (req, res) => {
    const tenantId = (req as any).tenantId;
    if (!tenantId) {
      return res.status(500).json({
        ok: false,
        error: "BUG",
        message: "tenantId not attached by auth middleware"
      });
    }

    // Only delete real events (not demo-seeded)
    await EventModel.deleteMany({ tenantId, source: { $ne: "demo" } });
    await InsightModel.deleteMany({ tenantId });

    // clear only real events for this tenant from the in-memory buffer
    for (let i = eventsBuffer.length - 1; i >= 0; i--) {
      const ev = eventsBuffer[i] as any;
      if (ev.tenantId === tenantId && ev.source !== "demo") {
        eventsBuffer.splice(i, 1);
      }
    }

    // Emit eventHistory only to tenant room (room-scoped)
    const room = `tenant:${tenantId}`;
    io.to(room).emit("eventHistory", []);

    console.log("[Dashboard] Cleared real traces for tenant:", tenantId);

    res.json({ ok: true });
  });
}
