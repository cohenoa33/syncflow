import type { Express } from "express";
import { EventModel, InsightModel } from "../models";

import type { Server } from "socket.io";
import { getTenantId } from "../tenants";
import { eventsBuffer } from "../state";

export function registerTracesRoutes(app: Express, io: Server) {
app.get("/api/traces", async (req, res) => {
  const tenantId = getTenantId(req);

  const latest = await EventModel.find({ tenantId })
    .sort({ ts: -1 })
    .limit(1000)
    .lean();

  console.log("[traces]", {
    tenantId,
    header: req.header("x-tenant-id"),
    topApps: Array.from(new Set(latest.map((e: any) => e.appName))).slice(0, 10)
  });

  res.json(latest);
});

  app.delete("/api/traces", async (req, res) => {
    const tenantId = getTenantId(req);

    await EventModel.deleteMany({ tenantId });
    await InsightModel.deleteMany({ tenantId });

    // clear only this tenant from the in-memory buffer
    for (let i = eventsBuffer.length - 1; i >= 0; i--) {
      if ((eventsBuffer[i] as any).tenantId === tenantId)
        eventsBuffer.splice(i, 1);
    }

    // NOTE: this currently clears UI for everyone; we’ll fix this once
    // the UI joins tenant rooms. For now it's OK for local testing.
    io.emit("eventHistory", []);
    console.log("[Dashboard] Cleared traces for tenant:", tenantId);

    res.json({ ok: true });
  });
}
