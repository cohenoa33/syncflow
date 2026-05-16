import cron from "node-cron";
import type { Server } from "socket.io";
import { AlertRuleModel, AlertFireModel } from "../models";
import { computeMetricsSummary } from "../routes/metrics";

export type RuleResult = {
  ruleId: string;
  ruleName: string;
  status: "fired" | "skipped" | "error";
  reason: string;
  value?: number;
};

export function startAlertEvaluator(io: Server): void {
  const cronExpr = process.env.ALERT_EVAL_CRON ?? "*/5 * * * *";

  cron.schedule(cronExpr, async () => {
    console.log("[Alerts] Tick: running evaluation");
    await runEvaluation(io);
  });

  console.log(`[Alerts] Evaluator scheduled: ${cronExpr}`);
}

export async function runEvaluation(io: Server, tenantId?: string): Promise<RuleResult[]> {
  const query: any = { enabled: true };
  if (tenantId) query.tenantId = tenantId;

  let rules: any[];
  try {
    rules = await AlertRuleModel.find(query).lean();
    console.log(`[Alerts] Tick: found ${rules.length} enabled rule(s)${tenantId ? ` for tenant ${tenantId}` : ""}`);
  } catch (err) {
    console.error("[Alerts] Failed to fetch alert rules:", err);
    return [];
  }

  const results: RuleResult[] = [];
  for (const rule of rules) {
    try {
      const result = await evaluateRule(io, rule);
      results.push(result);
      if (result.status === "fired") {
        console.log(`[Alerts] Rule "${rule.name}": FIRED — ${result.reason}`);
      } else {
        console.log(`[Alerts] Rule "${rule.name}": skipped — ${result.reason}`);
      }
    } catch (err) {
      console.error(`[Alerts] Error evaluating rule "${rule.name}" (${rule._id}):`, err);
      results.push({ ruleId: rule._id.toString(), ruleName: rule.name, status: "error", reason: String(err) });
    }
  }

  return results;
}

async function evaluateRule(io: Server, rule: any): Promise<RuleResult> {
  const base = { ruleId: rule._id.toString(), ruleName: rule.name };

  const summary = await computeMetricsSummary(
    rule.tenantId,
    rule.window as "1h" | "24h" | "7d",
    rule.appName ?? null,
    true
  );

  if (summary.totalRequests === 0) {
    return { ...base, status: "skipped", reason: `no real traffic in ${rule.window} window (tip: evaluator excludes demo data)` };
  }

  let metricValue: number;
  switch (rule.metric) {
    case "errorRate":     metricValue = summary.errorRate * 100; break;
    case "p95Latency":   metricValue = summary.p95Latency ?? 0; break;
    case "slowRate":     metricValue = summary.slowRate * 100; break;
    case "requestVolume": metricValue = summary.totalRequests; break;
    default:
      return { ...base, status: "skipped", reason: `unknown metric "${rule.metric}"` };
  }

  if (metricValue <= rule.threshold) {
    return {
      ...base, status: "skipped", value: metricValue,
      reason: `${rule.metric} = ${metricValue.toFixed(2)}, threshold = ${rule.threshold} (not exceeded)`,
    };
  }

  const now = Date.now();
  if (rule.lastFiredAt != null && now - rule.lastFiredAt < rule.cooldownMs) {
    const remainingSec = Math.ceil((rule.cooldownMs - (now - rule.lastFiredAt)) / 1000);
    return {
      ...base, status: "skipped", value: metricValue,
      reason: `cooldown active — ${remainingSec}s remaining`,
    };
  }

  await AlertFireModel.create({
    tenantId: rule.tenantId,
    ruleId: rule._id.toString(),
    ruleName: rule.name,
    metric: rule.metric,
    value: metricValue,
    threshold: rule.threshold,
    window: rule.window,
    appName: rule.appName ?? null,
    firedAt: now,
  });

  io.to("tenant:" + rule.tenantId).emit("alert_fired", {
    ruleId: rule._id.toString(),
    ruleName: rule.name,
    metric: rule.metric,
    value: metricValue,
    threshold: rule.threshold,
    window: rule.window,
    appName: rule.appName ?? null,
    firedAt: now,
  });

  await AlertRuleModel.updateOne({ _id: rule._id }, { lastFiredAt: now });

  return {
    ...base, status: "fired", value: metricValue,
    reason: `${rule.metric} = ${metricValue.toFixed(2)} > threshold ${rule.threshold}`,
  };
}
