import type { Express } from "express";
import { EventModel, InsightModel } from "../models";

import type { Server } from "socket.io";
import { eventsBuffer } from "../state";

export function registerTracesRoutes(app: Express, io: Server) {
  app.get("/api/traces", async (req, res) => {
    const tenantId = (req as any).tenantId || "local";

    const latest = await EventModel.find({ tenantId })
      .sort({ ts: -1 })
      .limit(1000)
      .lean();

    res.json(latest);
  });

  app.delete("/api/traces", async (req, res) => {
    const tenantId = (req as any).tenantId || "local";

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
