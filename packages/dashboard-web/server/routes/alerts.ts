import type { Express } from "express";
import type { Server } from "socket.io";
import { z } from "zod";
import { AlertRuleModel, AlertFireModel } from "../models";
import { runEvaluation } from "../alerts/evaluator";

const AlertRuleSchema = z.object({
  name:       z.string().min(1).max(100),
  metric:     z.enum(["errorRate", "p95Latency", "slowRate", "requestVolume"]),
  threshold:  z.number().min(0),
  window:     z.enum(["1h", "24h", "7d"]).default("1h"),
  appName:    z.string().nullable().default(null),
  enabled:    z.boolean().default(true),
  cooldownMs: z.number().int().positive().default(3_600_000),
});

export function registerAlertsRoutes(app: Express, io: Server): void {
  app.get("/api/alerts/rules", async (req, res) => {
    try {
      const tenantId = (req as any).tenantId;
      if (!tenantId) return res.status(500).json({ ok: false, error: "BUG" });
      const rules = await AlertRuleModel.find({ tenantId }).sort({ createdAt: -1 }).lean();
      res.json({ ok: true, rules });
    } catch (err) {
      console.error("[Alerts] GET /api/alerts/rules failed", err);
      res.status(500).json({ ok: false, error: "INTERNAL_ERROR" });
    }
  });

  app.post("/api/alerts/rules", async (req, res) => {
    try {
      const tenantId = (req as any).tenantId;
      if (!tenantId) return res.status(500).json({ ok: false, error: "BUG" });

      const parsed = AlertRuleSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ ok: false, error: "VALIDATION_ERROR", issues: parsed.error.issues });
      }

      const rule = await AlertRuleModel.create({
        ...parsed.data,
        tenantId,
        createdAt: Date.now(),
      });
      res.status(201).json({ ok: true, rule });
    } catch (err) {
      console.error("[Alerts] POST /api/alerts/rules failed", err);
      res.status(500).json({ ok: false, error: "INTERNAL_ERROR" });
    }
  });

  app.put("/api/alerts/rules/:id", async (req, res) => {
    try {
      const tenantId = (req as any).tenantId;
      if (!tenantId) return res.status(500).json({ ok: false, error: "BUG" });

      const parsed = AlertRuleSchema.partial().safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ ok: false, error: "VALIDATION_ERROR", issues: parsed.error.issues });
      }

      const rule = await AlertRuleModel.findOneAndUpdate(
        { _id: req.params.id, tenantId },
        { $set: parsed.data },
        { new: true }
      ).lean();

      if (!rule) return res.status(404).json({ ok: false, error: "NOT_FOUND" });
      res.json({ ok: true, rule });
    } catch (err) {
      console.error("[Alerts] PUT /api/alerts/rules/:id failed", err);
      res.status(500).json({ ok: false, error: "INTERNAL_ERROR" });
    }
  });

  app.delete("/api/alerts/rules/:id", async (req, res) => {
    try {
      const tenantId = (req as any).tenantId;
      if (!tenantId) return res.status(500).json({ ok: false, error: "BUG" });

      const rule = await AlertRuleModel.findOneAndDelete({ _id: req.params.id, tenantId }).lean();
      if (!rule) return res.status(404).json({ ok: false, error: "NOT_FOUND" });
      res.json({ ok: true });
    } catch (err) {
      console.error("[Alerts] DELETE /api/alerts/rules/:id failed", err);
      res.status(500).json({ ok: false, error: "INTERNAL_ERROR" });
    }
  });

  app.post("/api/alerts/evaluate", async (req, res) => {
    try {
      const tenantId = (req as any).tenantId;
      if (!tenantId) return res.status(500).json({ ok: false, error: "BUG" });
      const results = await runEvaluation(io, tenantId);
      res.json({ ok: true, results });
    } catch (err) {
      console.error("[Alerts] POST /api/alerts/evaluate failed", err);
      res.status(500).json({ ok: false, error: "INTERNAL_ERROR", detail: String(err) });
    }
  });

  app.get("/api/alerts/history", async (req, res) => {
    try {
      const tenantId = (req as any).tenantId;
      if (!tenantId) return res.status(500).json({ ok: false, error: "BUG" });

      const filter: any = { tenantId };
      if (req.query.ruleId) filter.ruleId = req.query.ruleId as string;
      if (req.query.metric) filter.metric = req.query.metric as string;
      if (req.query.q) filter.ruleName = { $regex: req.query.q, $options: "i" };

      const page = Math.max(0, parseInt((req.query.page as string) || "0", 10));
      const pageSize = Math.min(100, Math.max(1, parseInt((req.query.pageSize as string) || "25", 10)));

      const [total, history] = await Promise.all([
        AlertFireModel.countDocuments(filter),
        AlertFireModel.find(filter)
          .sort({ firedAt: -1 })
          .skip(page * pageSize)
          .limit(pageSize)
          .lean(),
      ]);

      res.json({ ok: true, history, total, page, pageSize });
    } catch (err) {
      console.error("[Alerts] GET /api/alerts/history failed", err);
      res.status(500).json({ ok: false, error: "INTERNAL_ERROR" });
    }
  });
}
