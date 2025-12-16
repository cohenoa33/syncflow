import type { Event, TraceGroup } from "./types";

export function groupEventsIntoTraces(events: Event[]): TraceGroup[] {
  const map = new Map<string, Event[]>();

  for (const e of events) {
    const key = e.traceId ? e.traceId : `no-trace:${e.id}`;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(e);
  }

  const groups: TraceGroup[] = [];

  for (const [traceId, evs] of map.entries()) {
    const ordered = [...evs].sort((a, b) => a.ts - b.ts);

    const expressEvt = ordered.find((x) => x.type === "express");
    const statusCode =
      expressEvt?.payload?.response?.statusCode ??
      expressEvt?.payload?.response?.status ??
      undefined;

    const ok =
      expressEvt?.payload?.response?.ok ??
      (typeof statusCode === "number" ? statusCode < 400 : undefined);

    // ✅ mongoose errors are still type="mongoose" but level="error"
    const hasError = ordered.some((e) => e.level === "error");

    const slow =
      typeof expressEvt?.durationMs === "number"
        ? expressEvt.durationMs > 500
        : ordered.reduce((acc, x) => acc + (x.durationMs ?? 0), 0) > 800;

    const headerOp = expressEvt?.operation ?? ordered[0]?.operation ?? "Trace";
    const appName = expressEvt?.appName ?? ordered[0]?.appName ?? "app";
    const startedAt = ordered[0]?.ts ?? Date.now();
    const hasExpress = !!expressEvt;

    const totalDurationMs =
      expressEvt?.durationMs ??
      ordered.reduce((acc, x) => acc + (x.durationMs ?? 0), 0) ??
      undefined;

    groups.push({
      traceId,
      displayTraceId: traceId.startsWith("no-trace:") ? undefined : traceId,
      events: ordered,
      headerOp,
      appName,
      startedAt,
      totalDurationMs,
      hasExpress,
      statusCode,
      ok,
      hasError,
      slow
    });
  }

  groups.sort((a, b) => b.startedAt - a.startedAt);
  return groups;
}
