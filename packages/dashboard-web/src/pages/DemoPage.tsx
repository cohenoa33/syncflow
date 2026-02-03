import { useState } from "react";
import { API_BASE, TENANT_ID } from "../lib/config";
import { authHeaders, demoHeaders } from "../lib/api";
import { getDemoAppNames } from "../lib/demoMode";
import type { Event } from "../lib/types";

type Props = {
  onDemoComplete: (
    events: Event[],
    openMap: Record<string, boolean>,
    traceOpenMap: Record<string, boolean>
  ) => void;
  onNavigateBack: () => void;
  requiresDemoToken: boolean;
  hasTenantsConfig: boolean;
};

export function DemoPage({
  onDemoComplete,
  onNavigateBack,
  requiresDemoToken,
  hasTenantsConfig
}: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<{
    status: number;
    error?: string;
    message?: string;
  } | null>(null);

  const runDemo = async () => {
    try {
      setLoading(true);
      setError(null);

      // Use tenant-scoped demo app names
      const demoApps = getDemoAppNames(TENANT_ID);

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
        setError({
          status: res.status,
          error: json?.error,
          message: json?.message ?? "Failed to seed demo data"
        });
        return;
      }

      if (!json?.ok) {
        setError({
          status: res.status,
          error: json?.error,
          message: json?.message ?? "Failed to seed demo data"
        });
        return;
      }

      // Fetch all traces (includes both demo and real)
      const eventsRes = await fetch(`${API_BASE}/api/traces`, {
        headers: authHeaders()
      });
      const eventsJson = await eventsRes.json().catch(() => ({}));

      if (!eventsRes.ok) {
        setError({
          status: eventsRes.status,
          error: (eventsJson as any)?.error,
          message: (eventsJson as any)?.message ?? "Failed to load traces"
        });
        return;
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

        const latestExpress = newestTraceEvents.find(
          (e) => e.type === "express"
        );
        if (latestExpress) initialOpen[latestExpress.id] = true;
      }

      onDemoComplete(ordered, initialOpen, initialTraceOpen);
      onNavigateBack();
    } catch (err) {
      console.error("[Dashboard] load demo trace data failed", err);
      setError({
        status: 0,
        message: "Load Demo Data failed. Check the dashboard server logs."
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-linear-to-br from-indigo-50 to-blue-50 flex items-center justify-center px-4">
      <div className="bg-white rounded-lg shadow-lg p-8 max-w-md w-full">
        <h1 className="text-3xl font-bold text-gray-900 mb-4 text-center">
          Load Demo Data
        </h1>
        <p className="text-gray-600 text-center mb-8">
          Click the button below to load sample trace data and explore the
          dashboard features.
        </p>
        <p className="text-xs text-gray-500 text-center mt-6">
          This will seed realistic demo traces to tenant "{TENANT_ID}". Demo
          data is isolated and does not affect real trace data.
        </p>
        <p className="text-xs text-gray-500 text-center mt-2 mb-6">
          Demo apps: {getDemoAppNames(TENANT_ID).join(", ")}
        </p>
        {error && (
          <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
            <div className="font-semibold">
              Request failed (HTTP {error.status || "0"})
            </div>
            <div className="text-xs text-rose-700 mt-1">
              {error.error ? `${error.error}: ` : ""}
              {error.message ?? "Request failed"}
            </div>
          </div>
        )}
        <div className="space-y-4">
          <button
            onClick={runDemo}
            disabled={loading}
            className="w-full px-6 py-3 rounded-lg font-medium bg-indigo-600 text-white hover:bg-indigo-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed"
          >
            {loading ? "Loading..." : "Continue"}
          </button>

          <button
            onClick={onNavigateBack}
            disabled={loading}
            className="w-full px-6 py-3 rounded-lg font-medium bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors disabled:bg-gray-50 disabled:cursor-not-allowed"
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    </div>
  );
}
