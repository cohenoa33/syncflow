import type { TraceEvent } from "./types";

export function summarizeEventsForLLM(events: TraceEvent[]) {
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
