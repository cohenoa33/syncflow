import type { Express } from "express";
import { EventModel } from "../models";
import { getAuthConfig } from "../tenants";

type MetricsWindow = "1h" | "24h" | "7d";

const WINDOW_CONFIG: Record<MetricsWindow, { ms: number; bucketMs: number }> = {
  "1h":  { ms: 60 * 60 * 1000,           bucketMs: 5  * 60 * 1000 },
  "24h": { ms: 24 * 60 * 60 * 1000,      bucketMs: 60 * 60 * 1000 },
  "7d":  { ms: 7 * 24 * 60 * 60 * 1000,  bucketMs: 6  * 60 * 60 * 1000 },
};

function percentile(sorted: number[], p: number): number | null {
  if (sorted.length === 0) return null;
  const idx = Math.min(Math.floor(sorted.length * p), sorted.length - 1);
  return sorted[idx];
}

const EMPTY_SUMMARY = { totalRequests: 0, errorRate: 0, p95Latency: null as null, slowRate: 0 };

export async function computeMetricsSummary(
  tenantId: string,
  window: "1h" | "24h" | "7d",
  appName: string | null,
  excludeDemo: boolean
): Promise<{ totalRequests: number; errorRate: number; p95Latency: number | null; slowRate: number }> {
  const { ms: windowMs, bucketMs } = WINDOW_CONFIG[window];
  const since = Date.now() - windowMs;
  const appFilter = appName ? { appName } : {};

  let sourceFilter: any;
  if (excludeDemo) {
    // Prefer real traffic; fall back to demo data when no real events exist in the window
    const realCount = await EventModel.countDocuments({
      tenantId, type: "express", ts: { $gte: since }, source: { $ne: "demo" }, ...appFilter,
    });
    sourceFilter = realCount === 0 ? { source: "demo" } : { source: { $ne: "demo" } };
  } else {
    sourceFilter = { source: "demo" };
  }

  const match: any = { tenantId, type: "express", ts: { $gte: since }, ...sourceFilter, ...appFilter };

  const aggResult = await EventModel.aggregate([
    { $match: match },
    {
      $group: {
        _id: { $subtract: ["$ts", { $mod: ["$ts", bucketMs] }] },
        total: { $sum: 1 },
        errors: { $sum: { $cond: [{ $eq: ["$level", "error"] }, 1, 0] } },
        durations: { $push: "$durationMs" },
        slowCount: { $sum: { $cond: [{ $gt: ["$durationMs", 500] }, 1, 0] } },
      },
    },
    { $sort: { _id: 1 } },
  ]);

  const allDurations: number[] = [];
  let totalRequests = 0;
  let totalErrors = 0;
  let totalSlow = 0;

  for (const b of aggResult) {
    const durations: number[] = (b.durations as (number | null | undefined)[])
      .filter((d): d is number => typeof d === "number");
    durations.sort((a, c) => a - c);
    allDurations.push(...durations);
    totalRequests += b.total;
    totalErrors += b.errors;
    totalSlow += b.slowCount;
  }

  allDurations.sort((a, b) => a - b);

  return {
    totalRequests,
    errorRate: totalRequests > 0 ? totalErrors / totalRequests : 0,
    p95Latency: percentile(allDurations, 0.95),
    slowRate: totalRequests > 0 ? totalSlow / totalRequests : 0,
  };
}

export function registerMetricsRoutes(app: Express) {
  app.get("/api/metrics", async (req, res) => {
    try {
      const tenantId = (req as any).tenantId;
      const { hasTenantsConfig } = getAuthConfig();

      if (!hasTenantsConfig) {
        return res.json({ ok: true, window: "24h", buckets: [], summary: EMPTY_SUMMARY, appName: null });
      }

      const windowParam = (req.query.window as string) || "24h";
      const window: MetricsWindow = ["1h", "24h", "7d"].includes(windowParam)
        ? (windowParam as MetricsWindow)
        : "24h";
      const appName = ((req.query.appName as string) || "").trim() || null;
      const demoMode = req.query.demo === "true";

      const { ms: windowMs, bucketMs } = WINDOW_CONFIG[window];
      const since = Date.now() - windowMs;
      const appFilter = appName ? { appName } : {};

      let sourceFilter: any;
      if (demoMode) {
        sourceFilter = { source: "demo" };
      } else {
        // Fall back to demo data only when no real express events exist in the window
        const realCount = await EventModel.countDocuments({
          tenantId, type: "express", ts: { $gte: since }, source: { $ne: "demo" }, ...appFilter,
        });
        sourceFilter = realCount === 0 ? { source: "demo" } : { source: { $ne: "demo" } };
      }

      const match: any = { tenantId, type: "express", ts: { $gte: since }, ...sourceFilter, ...appFilter };

      const aggResult = await EventModel.aggregate([
        { $match: match },
        {
          $group: {
            _id: { $subtract: ["$ts", { $mod: ["$ts", bucketMs] }] },
            total: { $sum: 1 },
            errors: { $sum: { $cond: [{ $eq: ["$level", "error"] }, 1, 0] } },
            durations: { $push: "$durationMs" },
            slowCount: { $sum: { $cond: [{ $gt: ["$durationMs", 500] }, 1, 0] } },
          },
        },
        { $sort: { _id: 1 } },
      ]);

      const allDurations: number[] = [];
      let totalRequests = 0;
      let totalErrors = 0;
      let totalSlow = 0;

      const buckets = aggResult.map((b: any) => {
        const durations: number[] = (b.durations as (number | null | undefined)[])
          .filter((d): d is number => typeof d === "number");
        durations.sort((a, c) => a - c);
        allDurations.push(...durations);
        totalRequests += b.total;
        totalErrors += b.errors;
        totalSlow += b.slowCount;

        return {
          ts: b._id as number,
          total: b.total as number,
          errors: b.errors as number,
          errorRate: b.total > 0 ? b.errors / b.total : 0,
          p50: percentile(durations, 0.5),
          p95: percentile(durations, 0.95),
          p99: percentile(durations, 0.99),
          slowCount: b.slowCount as number,
        };
      });

      allDurations.sort((a, b) => a - b);

      const summary = {
        totalRequests,
        errorRate: totalRequests > 0 ? totalErrors / totalRequests : 0,
        p95Latency: percentile(allDurations, 0.95),
        slowRate: totalRequests > 0 ? totalSlow / totalRequests : 0,
      };

      res.json({ ok: true, window, buckets, summary, appName });
    } catch (err) {
      console.error("[Dashboard] GET /api/metrics failed", err);
      res.status(500).json({ ok: false, error: "INTERNAL_ERROR" });
    }
  });
}
