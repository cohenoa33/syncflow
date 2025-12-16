import type { Event } from "./types";

export function buildInitialMaps(events: Event[]) {
  const open: Record<string, boolean> = {};
  const traceOpen: Record<string, boolean> = {};

  for (const e of events) {
    open[e.id] = false;
    const key = e.traceId ? e.traceId : `no-trace:${e.id}`;
    if (!(key in traceOpen)) traceOpen[key] = true;
  }

  return { open, traceOpen };
}
