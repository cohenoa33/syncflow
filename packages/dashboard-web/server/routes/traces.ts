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
            eventIds: { $push: "$_id" }
          }
        },
        { $sort: { startedAt: -1 } },
        {
          $facet: {
            total: [{ $count: "count" }],
            page: [
              { $skip: page * pageSize },
              { $limit: pageSize },
              { $project: { eventIds: 1 } }
            ]
          }
        }
      ]);

      const totalGroups: number = aggResult?.total?.[0]?.count ?? 0;
      const allEventIds = (aggResult?.page ?? []).flatMap((g: any) => g.eventIds);

      const events = allEventIds.length
        ? await EventModel.find({ _id: { $in: allEventIds } }).sort({ ts: 1 }).lean()
        : [];

      res.json({ events, totalGroups });
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
