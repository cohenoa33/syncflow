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

export function buildInsightForTrace(
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