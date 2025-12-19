import type { Express } from "express";
import { EventModel, InsightModel } from "../models";
import { eventsBuffer } from "../state";
import type { Server } from "socket.io";

export function registerTracesRoutes(app: Express, io: Server) {
  app.get("/api/traces", async (_req, res) => {
    const latest = await EventModel.find().sort({ ts: -1 }).limit(1000).lean();
    res.json(latest);
  });

  app.delete("/api/traces", async (_req, res) => {
    await EventModel.deleteMany({});
    await InsightModel.deleteMany({});
    eventsBuffer.length = 0;

    io.emit("eventHistory", []);
    console.log("[Dashboard] Cleared all traces");
    res.json({ ok: true });
  });
}
