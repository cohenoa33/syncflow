import { describe, it, expect } from "vitest";
import { buildHeuristicInsightForTrace } from "../insights/heuristic";
import type { TraceEvent } from "../insights/types";

let _idSeq = 0;
function makeExpressEvent(overrides: Partial<TraceEvent> = {}): TraceEvent {
  return {
    id: `evt-${++_idSeq}`,
    traceId: "trace-1",
    appName: "test-app",
    type: "express",
    operation: "GET /test",
    ts: Date.now(),
    durationMs: 100,
    level: "info",
    payload: { response: { statusCode: 200, ok: true } },
    ...overrides
  };
}

function makeMongooseEvent(overrides: Partial<TraceEvent> = {}): TraceEvent {
  return {
    id: `evt-${++_idSeq}`,
    traceId: "trace-1",
    appName: "test-app",
    type: "mongoose",
    operation: "find Widget",
    ts: Date.now(),
    durationMs: 50,
    level: "info",
    payload: { modelName: "Widget" },
    ...overrides
  };
}

describe("buildHeuristicInsightForTrace", () => {
  it("error trace (statusCode 500): severity=error, rootCause present, suggestions non-empty", () => {
    const events: TraceEvent[] = [
      makeExpressEvent({
        level: "error",
        payload: { response: { statusCode: 500, ok: false } }
      })
    ];
    const result = buildHeuristicInsightForTrace("trace-1", events);
    expect(result.severity).toBe("error");
    expect(result.rootCause).toBeDefined();
    expect(result.suggestions!.length).toBeGreaterThan(0);
  });

  it("slow trace (durationMs > 800): severity=warn, slow signal present", () => {
    const events: TraceEvent[] = [
      makeExpressEvent({
        durationMs: 900,
        payload: { response: { statusCode: 200, ok: true } }
      })
    ];
    const result = buildHeuristicInsightForTrace("trace-1", events);
    expect(result.severity).toBe("warn");
    const slowSignal = result.signals?.find((s) => s.kind === "slow");
    expect(slowSignal).toBeDefined();
  });

  it("healthy trace (200, fast): severity=info, no rootCause, suggestion says No action needed", () => {
    const events: TraceEvent[] = [
      makeExpressEvent({
        durationMs: 50,
        payload: { response: { statusCode: 200, ok: true } }
      })
    ];
    const result = buildHeuristicInsightForTrace("trace-1", events);
    expect(result.severity).toBe("info");
    expect(result.rootCause).toBeUndefined();
    expect(result.suggestions?.some((s) => s.includes("No action needed"))).toBe(true);
  });

  it("Mongo duplicate key error (E11000): rootCause mentions E11000, suggestions include 409", () => {
    const events: TraceEvent[] = [
      makeExpressEvent({
        level: "error",
        payload: {
          response: { statusCode: 500, ok: false },
          error: "E11000 duplicate key error collection: db.users index: email_1"
        }
      })
    ];
    const result = buildHeuristicInsightForTrace("trace-1", events);
    expect(result.rootCause).toMatch(/E11000/i);
    expect(result.suggestions?.some((s) => s.includes("409"))).toBe(true);
  });

  it("non-duplicate mongoose error: rootCause mentions database operation failed", () => {
    const events: TraceEvent[] = [
      makeExpressEvent({
        level: "error",
        payload: { response: { statusCode: 500, ok: false } }
      }),
      makeMongooseEvent({
        level: "error",
        operation: "save User",
        payload: { modelName: "User", error: "connection refused" }
      })
    ];
    const result = buildHeuristicInsightForTrace("trace-1", events);
    expect(result.severity).toBe("error");
    expect(result.rootCause).toMatch(/database operation failed/i);
    const dbSignal = result.signals?.find((s) => s.kind === "db");
    expect(dbSignal).toBeDefined();
  });

  it("error takes precedence over slow: severity=error even when also slow", () => {
    const events: TraceEvent[] = [
      makeExpressEvent({
        durationMs: 1200,
        level: "error",
        payload: { response: { statusCode: 500, ok: false } }
      })
    ];
    const result = buildHeuristicInsightForTrace("trace-1", events);
    expect(result.severity).toBe("error");
    // Both signals should be present
    expect(result.signals?.some((s) => s.kind === "slow")).toBe(true);
    expect(result.signals?.some((s) => s.kind === "status")).toBe(true);
  });

  it("empty events array: severity=info, traceId preserved, suggestions non-empty", () => {
    const result = buildHeuristicInsightForTrace("empty-trace", []);
    expect(result.severity).toBe("info");
    expect(result.traceId).toBe("empty-trace");
    expect(result.suggestions?.length).toBeGreaterThan(0);
    expect(result.suggestions?.some((s) => s.includes("No action needed"))).toBe(true);
  });

  it("slow DB op (> 200ms) adds a db signal", () => {
    const events: TraceEvent[] = [
      makeExpressEvent({ durationMs: 50 }),
      makeMongooseEvent({ durationMs: 300, operation: "find Product" })
    ];
    const result = buildHeuristicInsightForTrace("trace-1", events);
    const dbSignal = result.signals?.find(
      (s) => s.kind === "db" && s.message.includes("Slow DB op")
    );
    expect(dbSignal).toBeDefined();
  });

  it("always returns correct traceId and appName locked from input events", () => {
    const events: TraceEvent[] = [makeExpressEvent({ appName: "my-app" })];
    const result = buildHeuristicInsightForTrace("my-trace-id", events);
    expect(result.traceId).toBe("my-trace-id");
    expect(result.appName).toBe("my-app");
  });
});
