import type { Express } from "express";
import { EventModel, InsightModel } from "../models";
import { buildInsightForTrace } from "../insights";
import { checkRateLimit } from "../ai/rateLimit";
import { shouldSampleInsight } from "../ai/sampling";
import { apiError } from "../errors";
import { getTenantId } from "../tenants";

const INSIGHT_TTL_MS = 1000 * 60 * 60;

/**
 * Insight resolution order:
 * 1. Return cached insight if fresh
 * 2. If sampling rules skip → INSIGHT_SAMPLED_OUT
 * 3. If rate-limited → 429
 * 4. Attempt AI insight
 * 5. Fallback to heuristic if allowed
 */
export function registerInsightsRoutes(app: Express) {
  app.get("/api/insights/:traceId", async (req, res) => {
    try {
      const traceId = req.params.traceId;
      const tenantId = getTenantId(req);

      const cached = await InsightModel.findOne({ tenantId, traceId }).lean();
      const fresh =
        cached?.computedAt && Date.now() - cached.computedAt < INSIGHT_TTL_MS;

      if (cached?.insight && fresh) {
        return res.json({
          ok: true,
          tenantId,
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

      // Only apply sampling + rate limit when AI is enabled
      if (enableAI) {
        const hasError = traceEvents.some(
          (e: any) => e.level === "error" || e.type === "error"
        );

        const statusCode =
          traceEvents.find((e: any) => e.type === "express")?.payload
            ?.statusCode ?? undefined;

        const sample = shouldSampleInsight({
          traceId: `${tenantId}:${traceId}`,
          hasError,
          statusCode
        });
        if (!sample.ok) {
          const e = apiError(
            "INSIGHT_SAMPLED_OUT",
            "AI Insights are disabled for this trace (sampling). Try regenerate or adjust sampling settings.",
            { status: 503 }
          );
          return res.status(e.status).json(e.body);
        }

        const key =
          req.ip || req.headers["x-forwarded-for"]?.toString() || "unknown";
        const rl = checkRateLimit(`insight:get:${tenantId}:${key}`);
        res.setHeader("X-RateLimit-Remaining", String(rl.remaining));
        res.setHeader("X-RateLimit-Reset", String(rl.resetAt));

        if (!rl.ok) {
          return res.status(429).json({
            ok: false,
            error: "AI_RATE_LIMITED",
            message: "Too many insight requests. Try again soon."
          });
        }
      }

      const insight = await buildInsightForTrace(traceId, traceEvents as any, {
        allowFallback: true
      });

      const computedAt = Date.now();
      await InsightModel.updateOne(
        { tenantId, traceId },
        { $set: { tenantId, traceId, insight, computedAt } },
        { upsert: true }
      );

      return res.json({
        ok: true,
        insight,
        tenantId,
        cached: false,
        computedAt
      });
    } catch (err) {
      console.error("[Dashboard] Failed to build insight", err);
      res.status(500).json({ ok: false });
    }
  });

  app.post("/api/insights/:traceId/regenerate", async (req, res) => {
    try {
      const traceId = req.params.traceId;
      const tenantId = getTenantId(req);
      console.log("[Dashboard] Regenerating insight for trace", traceId);

      const traceEvents = await EventModel.find({ tenantId, traceId })
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
      if (!enableAI) {
        const e = apiError(
          "AI_DISABLED",
          "AI Insights are disabled on this server.",
          { status: 503 }
        );
        return res.status(e.status).json(e.body);
      }

      const key =
        req.ip || req.headers["x-forwarded-for"]?.toString() || "unknown";
      const rl = checkRateLimit(`insight:regen:${tenantId}:${key}`);
      res.setHeader("X-RateLimit-Remaining", String(rl.remaining));
      res.setHeader("X-RateLimit-Reset", String(rl.resetAt));

      if (!rl.ok) {
        return res.status(429).json({
          ok: false,
          error: "AI_RATE_LIMITED",
          message: "Too many regenerate requests. Try again soon."
        });
      }

      // ✅ regen intentionally bypasses sampling
      const insight = await buildInsightForTrace(traceId, traceEvents as any, {
        allowFallback: false
      });

      const computedAt = Date.now();

      await InsightModel.updateOne(
        { tenantId, traceId },
        { $set: { tenantId, traceId, insight, computedAt } },
        { upsert: true }
      );

      return res.json({
        ok: true,
        insight,
        tenantId,
        cached: false,
        computedAt
      });
    } catch (err: any) {
      if (err?.__apiError) {
        const { code, message, retryAfterMs, status } = err.__apiError;
        const e = apiError(code, message, { retryAfterMs, status });
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
