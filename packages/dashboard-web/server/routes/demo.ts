import type { Express } from "express";
import type { Server } from "socket.io";
import { EventModel } from "../models";
import { eventsBuffer } from "../state";
import { generateDemoTraces } from "../demo/seed";

export function registerDemoRoutes(app: Express, io: Server) {
  app.post("/api/demo-seed", async (req, res) => {
    try {
      const apps =
        Array.isArray(req.body?.apps) && req.body.apps.length > 0
          ? req.body.apps
          : ["mern-sample-app"];

      const all: any[] = [];
      const traceIdsByApp: Record<string, string[]> = {};

      for (const appName of apps) {
        const seeded = generateDemoTraces(appName);
        all.push(...seeded);
        traceIdsByApp[appName] = Array.from(
          new Set(seeded.map((e) => e.traceId).filter(Boolean))
        );
      }

      await EventModel.insertMany(all);

      for (const e of all) eventsBuffer.push(e);
      while (eventsBuffer.length > 1000) eventsBuffer.shift();

      for (const e of all) io.emit("event", e);

      console.log(`[Dashboard] Seeded demo traces: ${all.length} events`);
      res.json({ ok: true, count: all.length, traceIdsByApp });
    } catch (err) {
      console.error("[Dashboard] Failed to seed demo traces", err);
      res.status(500).json({ ok: false });
    }
  });
}
