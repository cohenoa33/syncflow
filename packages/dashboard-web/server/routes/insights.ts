import type { Express } from "express";
import { EventModel, InsightModel } from "../models";
import { buildInsightForTrace } from "../insights";

const INSIGHT_TTL_MS = 1000 * 60 * 60;

export function registerInsightsRoutes(app: Express) {
  app.get("/api/insights/:traceId", async (req, res) => {
    try {
      const traceId = req.params.traceId;

      const cached = await InsightModel.findOne({ traceId }).lean();
      const fresh =
        cached?.computedAt && Date.now() - cached.computedAt < INSIGHT_TTL_MS;

      if (cached?.insight && fresh) {
        return res.json({ ok: true, insight: cached.insight, cached: true });
      }

      const traceEvents = await EventModel.find({ traceId })
        .sort({ ts: 1 })
        .lean();
      if (traceEvents.length === 0) {
        return res.status(404).json({
          ok: false,
          error: "TRACE_NOT_FOUND",
          message: `No events found for traceId=${traceId}`
        });
      }

      const insight = await buildInsightForTrace(traceId, traceEvents as any, {
        allowFallback: true
      });

      await InsightModel.updateOne(
        { traceId },
        { $set: { traceId, insight, computedAt: Date.now() } },
        { upsert: true }
      );

      return res.json({ ok: true, insight, cached: false });
    } catch (err) {
      console.error("[Dashboard] Failed to build insight", err);
      res.status(500).json({ ok: false });
    }
  });

  app.post("/api/insights/:traceId/regenerate", async (req, res) => {
    try {
      const traceId = req.params.traceId;

      const traceEvents = await EventModel.find({ traceId })
        .sort({ ts: 1 })
        .lean();
      if (traceEvents.length === 0) {
        return res.status(404).json({
          ok: false,
          error: "TRACE_NOT_FOUND",
          message: `No events found for traceId=${traceId}`
        });
      }

      const insight = await buildInsightForTrace(traceId, traceEvents as any, {
        allowFallback: false
      });

      await InsightModel.updateOne(
        { traceId },
        { $set: { traceId, insight, computedAt: Date.now() } },
        { upsert: true }
      );

      res.json({ ok: true, insight });
    } catch (err: any) {
      console.error("[Dashboard] Failed to regenerate insight", err);

      res.status(503).json({
        ok: false,
        error: "AI_INSIGHT_FAILED",
        message: err?.message ?? "Failed to regenerate insight"
      });
    }
  });
}
