import type { Express } from "express";
import { EventModel, InsightModel } from "../models";
import type { Server } from "socket.io";
import { eventsBuffer } from "../state";
import { getAuthConfig } from "../tenants";

export function registerTracesRoutes(app: Express, io: Server) {
  app.get("/api/traces", async (req, res) => {
    try {
      const tenantId = (req as any).tenantId;
      const { hasTenantsConfig } = getAuthConfig();

      // If TENANTS_JSON is empty, return empty array (no data to query)
      if (!hasTenantsConfig) {
        console.log(
          `[Dashboard] GET /api/traces: no TENANTS_JSON, returning [] (tenant: ${tenantId})`
        );
        return res.json({ events: [], totalGroups: 0 });
      }

      const page = Math.max(0, parseInt(req.query.page as string) || 0);
      const pageSize = Math.min(200, Math.max(10, parseInt(req.query.pageSize as string) || 25));
      const filter = (req.query.filter as string) || "all";
      const q = ((req.query.q as string) || "").trim();
      const slowOnly = req.query.slowOnly === "true";
      const errorsOnly = req.query.errorsOnly === "true";

      const typeMatch: Record<string, any> | null =
        filter === "express" ? { hasExpress: 1 }
        : filter === "mongoose" ? { hasMongoose: 1 }
        : filter === "error" ? { hasError: 1 }
        : null;

      // Build pre-facet match for search / slow / errorsOnly.
      // Applied after grouping so all four facet counts reflect these filters.
      const preFilters: any[] = [];
      if (q) {
        const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        preFilters.push({
          $or: [
            { appName: { $regex: escaped, $options: "i" } },
            { operations: { $elemMatch: { $regex: escaped, $options: "i" } } }
          ]
        });
      }
      if (slowOnly) preFilters.push({ isSlow: true });
      if (errorsOnly) preFilters.push({ hasError: 1 });

      const query: any = { tenantId };

      // Paginate by trace group: group events by traceId (using the event _id
      // as a fallback key for no-trace events), sort by most-recent group first,
      // then fetch only the events belonging to the requested page of groups.
      const [aggResult] = await EventModel.aggregate([
        { $match: query },
        {
          $addFields: {
            effectiveTraceId: { $ifNull: ["$traceId", { $toString: "$_id" }] }
          }
        },
        {
          $group: {
            _id: "$effectiveTraceId",
            startedAt: { $min: "$ts" },
            eventIds: { $push: "$_id" },
            hasExpress: { $max: { $cond: [{ $eq: ["$type", "express"] }, 1, 0] } },
            hasMongoose: { $max: { $cond: [{ $eq: ["$type", "mongoose"] }, 1, 0] } },
            hasError: { $max: { $cond: [{ $eq: ["$level", "error"] }, 1, 0] } },
            appName: { $first: "$appName" },
            operations: { $addToSet: "$operation" },
            maxExpressDuration: {
              $max: { $cond: [{ $eq: ["$type", "express"] }, { $ifNull: ["$durationMs", 0] }, 0] }
            },
            totalDuration: { $sum: { $ifNull: ["$durationMs", 0] } }
          }
        },
        {
          $addFields: {
            isSlow: {
              $or: [{ $gt: ["$maxExpressDuration", 500] }, { $gt: ["$totalDuration", 800] }]
            }
          }
        },
        { $sort: { startedAt: -1 } },
        ...(preFilters.length ? [{ $match: { $and: preFilters } }] : []),
        {
          $facet: {
            total: [{ $count: "count" }],
            expressCount: [{ $match: { hasExpress: 1 } }, { $count: "count" }],
            mongooseCount: [{ $match: { hasMongoose: 1 } }, { $count: "count" }],
            errorCount: [{ $match: { hasError: 1 } }, { $count: "count" }],
            page: [
              ...(typeMatch ? [{ $match: typeMatch }] : []),
              { $skip: page * pageSize },
              { $limit: pageSize },
              { $project: { eventIds: 1 } }
            ]
          }
        }
      ]);

      const totalGroups: number = aggResult?.total?.[0]?.count ?? 0;
      const expressGroups: number = aggResult?.expressCount?.[0]?.count ?? 0;
      const mongooseGroups: number = aggResult?.mongooseCount?.[0]?.count ?? 0;
      const errorGroups: number = aggResult?.errorCount?.[0]?.count ?? 0;
      const allEventIds = (aggResult?.page ?? []).flatMap((g: any) => g.eventIds);

      const events = allEventIds.length
        ? await EventModel.find({ _id: { $in: allEventIds } }).sort({ ts: 1 }).lean()
        : [];

      res.json({ events, totalGroups, expressGroups, mongooseGroups, errorGroups });
    } catch (err) {
      console.error("[Dashboard] GET /api/traces failed", err);
      res.status(500).json({ ok: false, error: "INTERNAL_ERROR" });
    }
  });

  app.delete("/api/traces", async (req, res) => {
    try {
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
      const kept = eventsBuffer.filter(
        (ev: any) => !(ev.tenantId === tenantId && ev.source !== "demo")
      );
      eventsBuffer.splice(0, eventsBuffer.length, ...kept);

      // Emit eventHistory only to tenant room (room-scoped)
      const room = `tenant:${tenantId}`;
      io.to(room).emit("eventHistory", []);

      console.log("[Dashboard] Cleared real traces for tenant:", tenantId);

      res.json({ ok: true });
    } catch (err) {
      console.error("[Dashboard] DELETE /api/traces failed", err);
      res.status(500).json({ ok: false, error: "INTERNAL_ERROR" });
    }
  });
}
