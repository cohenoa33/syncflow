// packages/dashboard-web/server/insights.ts

export type Insight = {
  traceId: string;
  appName?: string;
  headerOp?: string;

  summary: string;
  severity: "info" | "warn" | "error";

  rootCause?: string;
  suggestions?: string[];
  signals?: Array<{
    kind: "error" | "slow" | "status" | "db" | "pattern";
    message: string;
  }>;
};

type Event = {
  id: string;
  traceId?: string;
  appName: string;
  type: "express" | "mongoose" | "error";
  operation: string;
  ts: number;
  durationMs?: number;
  level: "info" | "warn" | "error";
  payload: Record<string, any>;
};

export function buildHeuristicInsightForTrace(
  traceId: string,
  events: Event[]
): Insight {
  const ordered = [...events].sort((a, b) => a.ts - b.ts);

  const expressEvt = ordered.find((e) => e.type === "express");
  const appName = expressEvt?.appName ?? ordered[0]?.appName;
  const headerOp = expressEvt?.operation ?? ordered[0]?.operation ?? "Trace";

  const statusCode: number | undefined =
    expressEvt?.payload?.response?.statusCode ??
    expressEvt?.payload?.response?.status;

  const ok =
    expressEvt?.payload?.response?.ok ??
    (typeof statusCode === "number" ? statusCode < 400 : undefined);

  const totalMs =
    expressEvt?.durationMs ??
    ordered.reduce((acc, e) => acc + (e.durationMs ?? 0), 0);

  const hasAnyError =
    ordered.some((e) => e.level === "error") ||
    (typeof ok === "boolean" ? !ok : false) ||
    (typeof statusCode === "number" ? statusCode >= 400 : false);

  const isSlow = totalMs > 800 || (expressEvt?.durationMs ?? 0) > 500;

  const signals: Insight["signals"] = [];

  if (typeof statusCode === "number") {
    signals.push({
      kind: "status",
      message: `HTTP ${statusCode}${ok === false ? " (failed)" : ""}`
    });
  }

  if (isSlow) {
    signals.push({
      kind: "slow",
      message: `Slow trace: ~${totalMs}ms (threshold ~800ms total / 500ms express)`
    });
  }

  // Look for common Mongo duplicate key
  const mongoDup = ordered.find((e) => {
    const err = e.payload?.error || e.payload?.payload?.error;
    const msg = typeof err === "string" ? err : "";
    return msg.includes("E11000 duplicate key");
  });

  // If mongoose error exists, grab it
  const mongooseError = ordered.find(
    (e) => e.type === "mongoose" && e.level === "error"
  );

  // Identify "dominant" DB op by duration
  const mongooseEvents = ordered.filter((e) => e.type === "mongoose");
  const slowestDb = mongooseEvents
    .slice()
    .sort((a, b) => (b.durationMs ?? 0) - (a.durationMs ?? 0))[0];

  if (mongoDup) {
    signals.push({
      kind: "db",
      message: "Mongo duplicate key detected (E11000)"
    });
  } else if (mongooseError) {
    signals.push({
      kind: "db",
      message: `DB error: ${mongooseError.operation}`
    });
  }

  if (slowestDb && (slowestDb.durationMs ?? 0) > 200) {
    signals.push({
      kind: "db",
      message: `Slow DB op: ${slowestDb.operation} (${slowestDb.durationMs}ms)`
    });
  }

  // Build result
  let severity: Insight["severity"] = "info";
  if (hasAnyError) severity = "error";
  else if (isSlow) severity = "warn";

  let summary = `${headerOp}`;
  if (typeof statusCode === "number") summary += ` → ${statusCode}`;
  if (hasAnyError) summary += " (error)";
  else if (isSlow) summary += " (slow)";

  let rootCause: string | undefined;
  const suggestions: string[] = [];

  if (mongoDup) {
    rootCause = "MongoDB duplicate key error (E11000) during save";
    suggestions.push(
      "Add unique-check/validation before save (or handle E11000 explicitly)"
    );
    suggestions.push(
      "Return a consistent 409 Conflict (or 400) with a clear message for duplicates"
    );
    suggestions.push(
      "Ensure the unique index exists and matches app expectations"
    );
  } else if (mongooseError) {
    rootCause = "Database operation failed (mongoose error event)";
    suggestions.push(
      "Wrap DB writes in try/catch and map DB errors to stable API errors"
    );
    suggestions.push(
      "Log structured error context (model, operation, key fields) for debugging"
    );
  } else if (hasAnyError) {
    rootCause = "Request failed (non-OK response / error-level event present)";
    suggestions.push(
      "Inspect the failing trace payload and add explicit error handling"
    );
    suggestions.push("Add a regression test reproducing this request/response");
  } else if (isSlow) {
    rootCause = "Slow trace (high end-to-end latency)";
    suggestions.push(
      "Check slowest DB op and ensure indexes exist for the queried fields"
    );
    suggestions.push("Consider pagination / limiting payload size");
    suggestions.push(
      "Add timing around downstream calls and cache hot reads where safe"
    );
  } else {
    suggestions.push("No action needed — trace looks healthy");
  }

  return {
    traceId,
    appName,
    headerOp,
    summary,
    severity,
    rootCause,
    suggestions,
    signals
  };
}
import OpenAI from "openai";

let _openai: OpenAI | null = null;

function getOpenAI() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "OPENAI_API_KEY is missing. Set it in packages/dashboard-web/.env.local (dev) or Render env vars (prod)."
    );
  }

  if (!_openai) _openai = new OpenAI({ apiKey });
  return _openai;
}



function summarizeEventsForLLM(events: Event[]) {
  return events
    .slice()
    .sort((a, b) => a.ts - b.ts)
    .map((e) => ({
      ts: e.ts,
      appName: e.appName,
      type: e.type,
      level: e.level,
      operation: e.operation,
      durationMs: e.durationMs,
      // keep payload small + relevant
      payload: {
        response: e.payload?.response,
        error: e.payload?.error,
        modelName: e.payload?.modelName,
        operation: e.payload?.operation
      }
    }));
}
async function buildAIInsightForTrace(
  traceId: string,
  events: Event[]
): Promise<Insight> {

  const INSIGHT_MODEL = process.env.INSIGHT_MODEL || "gpt-5.2";

  const openai = getOpenAI();
  const ordered = [...events].sort((a, b) => a.ts - b.ts);
  const expressEvt = ordered.find((e) => e.type === "express");
  const appName = expressEvt?.appName ?? ordered[0]?.appName;
  const headerOp = expressEvt?.operation ?? ordered[0]?.operation ?? "Trace";

  const traceSummary = summarizeEventsForLLM(ordered);

  const system = `
You are SyncFlow Insight, a debugging assistant for MERN traces.
Return ONLY valid JSON matching this TypeScript type:

{
  "traceId": string,
  "appName"?: string,
  "headerOp"?: string,
  "summary": string,
  "severity": "info" | "warn" | "error",
  "rootCause"?: string,
  "suggestions"?: string[],
  "signals"?: Array<{ "kind": "error" | "slow" | "status" | "db" | "pattern", "message": string }>
}

Rules:
- Keep summary short and concrete.
- Use severity="error" for HTTP >= 400 or error events; "warn" for slow traces; else "info".
- Suggestions should be actionable and specific (2-5 bullets).
- If unsure, say so in rootCause and give safe suggestions.
`;

  const user = {
    traceId,
    appName,
    headerOp,
    events: traceSummary
  };

  const resp = await openai.responses.create({
    model: INSIGHT_MODEL,
    input: [
      { role: "system", content: system },
      { role: "user", content: JSON.stringify(user) }
    ]
  });

  const text = resp.output_text?.trim();
  if (!text) throw new Error("Empty OpenAI response");

  let parsed: any;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(`OpenAI did not return JSON. Got: ${text.slice(0, 200)}`);
  }

  // minimal validation / defaults
  return {
    traceId,
    appName,
    headerOp,
    summary: String(parsed.summary ?? `${headerOp}`),
    severity:
      parsed.severity === "warn" || parsed.severity === "error"
        ? parsed.severity
        : "info",
    rootCause: parsed.rootCause ? String(parsed.rootCause) : undefined,
    suggestions: Array.isArray(parsed.suggestions)
      ? parsed.suggestions.map(String).slice(0, 6)
      : undefined,
    signals: Array.isArray(parsed.signals)
      ? parsed.signals.slice(0, 8).map((s: any) => ({
          kind: s.kind,
          message: String(s.message ?? "")
        }))
      : undefined
  };
}

export async function buildInsightForTrace(
  traceId: string,
  events: Event[]
): Promise<Insight> {

  const ENABLE_AI = process.env.ENABLE_AI_INSIGHTS === "true";
  const canUseAI = ENABLE_AI && !!process.env.OPENAI_API_KEY;
  if (!canUseAI) {
    return buildHeuristicInsightForTrace(traceId, events);
  }

  try {
    return await buildAIInsightForTrace(traceId, events);
  } catch (err) {
    console.error(
      "[AI] Insight generation failed, falling back to heuristic:",
      err
    );
    return buildHeuristicInsightForTrace(traceId, events);
  }
}