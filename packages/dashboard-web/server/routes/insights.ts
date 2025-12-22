import type { Express } from "express";
import { EventModel, InsightModel } from "../models";
import { buildInsightForTrace } from "../insights";
import { checkRateLimit } from "../ai/rateLimit";
import { apiError } from "../errors";

const INSIGHT_TTL_MS = 1000 * 60 * 60;

export function registerInsightsRoutes(app: Express) {
  app.get("/api/insights/:traceId", async (req, res) => {
    try {
      const traceId = req.params.traceId;

      const cached = await InsightModel.findOne({ traceId }).lean();
      const fresh =
        cached?.computedAt && Date.now() - cached.computedAt < INSIGHT_TTL_MS;

      if (cached?.insight && fresh) {
        return res.json({
          ok: true,
          insight: cached.insight,
          cached: true,
          computedAt: cached.computedAt
        });
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
        const enableAI = process.env.ENABLE_AI_INSIGHTS === "true";
        if (enableAI) {
          const key =
            req.ip || req.headers["x-forwarded-for"]?.toString() || "unknown";
          const rl = checkRateLimit(`insight:get:${key}`);

          res.setHeader("X-RateLimit-Remaining", String(rl.remaining));
          res.setHeader("X-RateLimit-Reset", String(rl.resetAt));

          if (!rl.ok) {
            return res.status(429).json({
              ok: false,
              error: "RATE_LIMITED",
              message: "Too many insight requests. Try again soon."
            });
          }
        }

      const insight = await buildInsightForTrace(traceId, traceEvents as any, {
        allowFallback: true
      });

      await InsightModel.updateOne(
        { traceId },
        { $set: { traceId, insight, computedAt: Date.now() } },
        { upsert: true }
      );

      return res.json({
        ok: true,
        insight,
        cached: false,
        computedAt: Date.now()
      });
    } catch (err) {
      console.error("[Dashboard] Failed to build insight", err);
      res.status(500).json({ ok: false });
    }
  });

  app.post("/api/insights/:traceId/regenerate", async (req, res) => {
    try {
      const traceId = req.params.traceId;
console.log("[Dashboard] Regenerating insight for trace", traceId);
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
const key = req.ip || req.headers["x-forwarded-for"]?.toString() || "unknown";
const rl = checkRateLimit(`insight:regen:${key}`);

res.setHeader("X-RateLimit-Remaining", String(rl.remaining));
res.setHeader("X-RateLimit-Reset", String(rl.resetAt));

if (!rl.ok) {
  return res.status(429).json({
    ok: false,
    error: "RATE_LIMITED",
    message: "Too many regenerate requests. Try again soon."
  });
}

      const insight = await buildInsightForTrace(traceId, traceEvents as any, {
        allowFallback: false
      });

   const computedAt = Date.now();

   await InsightModel.updateOne(
     { traceId },
     { $set: { traceId, insight, computedAt } },
     { upsert: true }
   );

   return res.json({
     ok: true,
     insight,
     cached: false,
     computedAt,
   });


}catch (err: any) {
  if (err?.__apiError) {
    const { code, message, retryAfterMs, status } = err.__apiError;
    const e = apiError(code, message, {
      retryAfterMs,
      status
    });
    return res.status(e.status).json(e.body);
  }

  console.error("[Dashboard] Unhandled insight error", err);

  const e = apiError(
    "INTERNAL_ERROR",
    "Unexpected error while generating insight."
  );
  return res.status(e.status).json(e.body);
}
  });
}
