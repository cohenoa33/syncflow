import { useState } from "react";
import { API_BASE, TENANT_ID } from "../lib/config";
import {  demoHeaders } from "../lib/api";
import type { Event } from "../lib/types";

type Props = {
  onDemoComplete: (
    events: Event[],
    openMap: Record<string, boolean>,
    traceOpenMap: Record<string, boolean>
  ) => void;
  onNavigateBack: () => void;
};

export function DemoPage({ onDemoComplete, onNavigateBack }: Props) {
  const [loading, setLoading] = useState(false);
  const isDemoTenant = TENANT_ID === "demo";

  const runDemo = async () => {
    try {
      setLoading(true);
      // For demo tenant, seed demo apps
      const appsToSeed = isDemoTenant
        ? ["demo-app-1", "demo-app-2"]
        : ["mern-sample-app", "mern-sample-app-2"];

      await fetch(`${API_BASE}/api/traces`, {
        method: "DELETE",
        headers: demoHeaders()
      });
  

      // Seed demo traces
      const res = await fetch(`${API_BASE}/api/demo-seed`, {
        method: "POST",
        headers: { ...demoHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({
          apps: appsToSeed
        })
      });
      const json: {
        ok: boolean;
        count: number;
        traceIdsByApp?: Record<string, string[]>;
      } = await res.json();
      
      // Fetch loaded traces
      const eventsRes = await fetch(`${API_BASE}/api/traces`, {
        headers: demoHeaders()
      });
      const data: Event[] = await eventsRes.json();
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
      alert("Load Demo Data failed. Check the dashboard server logs." + err);
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-linear-to-br from-indigo-50 to-blue-50 flex items-center justify-center px-4">
      <div className="bg-white rounded-lg shadow-lg p-8 max-w-md w-full">
        <h1 className="text-3xl font-bold text-gray-900 mb-4 text-center">
          {isDemoTenant ? "Load Demo Data" : "Load Sample Data"}
        </h1>
        <p className="text-gray-600 text-center mb-8">
          Click the button below to load sample trace data and explore the
          dashboard features.
        </p>
        <p className="text-xs text-gray-500 text-center mt-6">
          {isDemoTenant
            ? "This will seed realistic demo traces to the demo tenant. Use this to explore the dashboard features without running a live application."
            : "This will remove all existing trace data and replace it with sample demo traces."}
        </p>{" "}
        <p className="text-xs text-gray-500 text-center mt-2 mb-6">
          {isDemoTenant
            ? "Demo data is isolated to the 'demo' tenant and does not affect production data."
            : "Sample apps: mern-sample-app, mern-sample-app-2"}
        </p>
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
