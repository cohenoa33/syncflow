import { API_BASE } from "./config";
import { authHeaders, demoHeaders } from "./api";
import { getDemoAppNames } from "./demoMode";
import type { Event } from "./types";

export interface DemoSeedResult {
  ordered: Event[];
  initialOpen: Record<string, boolean>;
  initialTraceOpen: Record<string, boolean>;
}

export interface DemoSeedError {
  status: number;
  error?: string;
  message?: string;
}

export async function seedDemoData(
  tenantId: string,
  requiresDemoToken: boolean,
  hasTenantsConfig: boolean
): Promise<DemoSeedResult> {
  // Use tenant-scoped demo app names
  const demoApps = getDemoAppNames(tenantId);

  // Seed demo traces (server will clear existing demo data for this tenant)
  const res = await fetch(`${API_BASE}/api/demo-seed`, {
    method: "POST",
    headers: {
      ...demoHeaders({ requiresDemoToken, hasTenantsConfig }),
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      apps: demoApps
    })
  });
  const json: {
    ok?: boolean;
    count?: number;
    traceIdsByApp?: Record<string, string[]>;
    error?: string;
    message?: string;
  } = await res.json().catch(() => ({}));

  if (!res.ok) {
    const error: DemoSeedError = {
      status: res.status,
      error: json?.error,
      message: json?.message ?? "Failed to seed demo data"
    };
    throw error;
  }

  if (!json?.ok) {
    const error: DemoSeedError = {
      status: res.status,
      error: json?.error,
      message: json?.message ?? "Failed to seed demo data"
    };
    throw error;
  }

  // Fetch all traces (includes both demo and real)
  const eventsRes = await fetch(`${API_BASE}/api/traces`, {
    headers: authHeaders()
  });
  const eventsJson = await eventsRes.json().catch(() => ({}));

  if (!eventsRes.ok) {
    const error: DemoSeedError = {
      status: eventsRes.status,
      error: (eventsJson as any)?.error,
      message: (eventsJson as any)?.message ?? "Failed to load traces"
    };
    throw error;
  }

  const data: Event[] = Array.isArray(eventsJson) ? eventsJson : [];
  const ordered = [...data].sort((a, b) => a.ts - b.ts);

  const initialOpen: Record<string, boolean> = {};
  const initialTraceOpen: Record<string, boolean> = {};
  for (const e of ordered) {
    initialOpen[e.id] = false;
    const key = e.traceId ? e.traceId : `no-trace:${e.id}`;
    if (!(key in initialTraceOpen)) initialTraceOpen[key] = false;
  }

  const allTraceIds = Object.values(json.traceIdsByApp ?? {}).flat();
  const newestTraceId = allTraceIds.length
    ? allTraceIds[allTraceIds.length - 1]
    : undefined;

  if (newestTraceId) initialTraceOpen[newestTraceId] = true;

  if (newestTraceId) {
    const newestTraceEvents = ordered
      .filter((e) => e.traceId === newestTraceId)
      .sort((a, b) => b.ts - a.ts);

    const latestExpress = newestTraceEvents.find((e) => e.type === "express");
    if (latestExpress) initialOpen[latestExpress.id] = true;
  }

  return {
    ordered,
    initialOpen,
    initialTraceOpen
  };
}
