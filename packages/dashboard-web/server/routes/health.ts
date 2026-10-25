import type { Express } from "express";
import mongoose from "mongoose";

export function registerHealthRoutes(app: Express): void {
  app.get("/healthz", (_req, res) => {
    const ready = mongoose.connection.readyState === 1;
    if (ready) {
      res.status(200).json({ status: "ok", mongo: "ready" });
    } else {
      res.status(503).json({ status: "degraded", mongo: "not_ready" });
    }
  });
}
