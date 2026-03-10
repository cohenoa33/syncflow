import { useState } from "react";
import { TENANT_ID } from "../lib/config";
import { seedDemoData, type DemoSeedError } from "../lib/seedDemoData";
import type { Event } from "../lib/types";
import { getDemoAppNames } from "../lib/demoMode";

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
  const [error, setError] = useState<DemoSeedError | null>(null);

  const runDemo = async () => {
    try {
      setLoading(true);
      setError(null);

      const { ordered, initialOpen, initialTraceOpen } = await seedDemoData(
        TENANT_ID,
        requiresDemoToken,
        hasTenantsConfig
      );

      onDemoComplete(ordered, initialOpen, initialTraceOpen);
      onNavigateBack();
    } catch (err) {
      console.error("[Dashboard] load demo trace data failed", err);
      if (err && typeof err === "object" && "status" in err) {
        setError(err as DemoSeedError);
      } else {
        setError({
          status: 0,
          message: "Load Demo Data failed. Check the dashboard server logs."
        });
      }
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
