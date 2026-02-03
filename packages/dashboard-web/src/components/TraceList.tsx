import type { Event, InsightState, TraceGroup } from "../lib/types";
import { useEffect, useMemo, useState } from "react";
import { TraceCard } from "./traces/TraceCard";

type Props = {
  loading: boolean;
  error?: {
    status: number;
    error?: string;
    message?: string;
  } | null;
  filteredTraceGroups: TraceGroup[];
  openMap: Record<string, boolean>;
  traceOpenMap: Record<string, boolean>;
  copiedId: string | null;
  onToggleTrace: (traceId: string) => void;
  onTogglePayload: (eventId: string) => void;
  onCopyPayload: (event: Event) => void;
  anyPayloadClosed: boolean;
  onToggleAllPayloads: () => void;
  toggleInsight: (traceId: string) => void;
  insightStateMap: Record<string, InsightState>;
  insightOpenMap: Record<string, boolean>;
  setInsightOpenMap: React.Dispatch<
    React.SetStateAction<Record<string, boolean>>
  >;
  onRegenerateInsight: (traceId: string) => void;
};

export function TraceList({
  loading,
  error,
  filteredTraceGroups,
  openMap,
  traceOpenMap,
  copiedId,
  onToggleTrace,
  onTogglePayload,
  onCopyPayload,
  anyPayloadClosed,
  onToggleAllPayloads,
  toggleInsight,
  insightOpenMap,
  insightStateMap,
  setInsightOpenMap,
  onRegenerateInsight
}: Props) {
  const [, forceTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => forceTick((x) => x + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const [nowMs, setNowMs] = useState(() => Date.now());

  const tickMode = useMemo(() => {
    // fast tick if ANY open insight is rate-limited right now
    const anyRateLimited = filteredTraceGroups.some((g) => {
      if (!insightOpenMap[g.traceId]) return false;
      const st = insightStateMap[g.traceId];
      const resetAt =
        st?.status === "error" ? st.rateLimit?.resetAt : undefined;
      return resetAt != null && Date.now() < resetAt;
    });

    if (anyRateLimited) return "fast";

    // slow tick if ANY open insight is ready (shows "ago")
    const anyReadyOpen = filteredTraceGroups.some((g) => {
      if (!insightOpenMap[g.traceId]) return false;
      return insightStateMap[g.traceId]?.status === "ready";
    });

    if (anyReadyOpen) return "slow";
    return "off";
  }, [filteredTraceGroups, insightOpenMap, insightStateMap]);

  useEffect(() => {
    if (tickMode === "off") return;

    const intervalMs = tickMode === "fast" ? 1000 : 10_000;
    const id = setInterval(() => setNowMs(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [tickMode]);

  return (
    <div className="bg-white rounded-lg shadow">
      <div className="p-4 border-b border-gray-200 flex items-center justify-between">
        <h2 className="text-lg font-semibold">Live Traces</h2>

        {filteredTraceGroups.length > 0 && (
          <button
            onClick={onToggleAllPayloads}
            className="text-xs text-gray-600 hover:text-gray-900 underline"
          >
            {anyPayloadClosed ? "Expand all payloads" : "Collapse all payloads"}
          </button>
        )}
      </div>

      <div className="px-4 pb-2 text-[11px] text-gray-500">
        Tip: press <span className="font-mono">E</span> to toggle latest payload
        • <span className="font-mono">Shift+E</span> to expand/collapse all
        payloads
      </div>

      {error && (
        <div className="mx-4 mb-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          <div className="font-semibold">
            Failed to load traces (HTTP {error.status || "0"})
          </div>
          <div className="text-xs text-rose-700 mt-1">
            {error.error ? `${error.error}: ` : ""}
            {error.message ?? "Request failed"}
          </div>
        </div>
      )}

      {loading && filteredTraceGroups.length === 0 ? (
        <div className="p-6 space-y-3">
          <div className="h-10 bg-gray-100 rounded animate-pulse" />
          <div className="h-10 bg-gray-100 rounded animate-pulse" />
          <div className="h-10 bg-gray-100 rounded animate-pulse" />
          <div className="text-xs text-gray-400 pt-2">Loading history…</div>
        </div>
      ) : error && filteredTraceGroups.length === 0 ? (
        <div className="p-8 text-center text-rose-700">
          <p className="text-lg font-medium mb-2">Unable to load traces</p>
          <p className="text-sm">
            Check your dashboard credentials and tenant configuration.
          </p>
        </div>
      ) : filteredTraceGroups.length === 0 ? (
        <div className="p-8 text-center text-gray-500">
          <p className="text-lg font-medium mb-2">No events yet</p>
          <p className="text-sm">
            Start your instrumented application to see traces here
          </p>
        </div>
      ) : (
        <div className="divide-y divide-gray-200">
          {filteredTraceGroups.map((g) => {
            const traceOpen = traceOpenMap[g.traceId] ?? true;
            const insightOpen = !!insightOpenMap[g.traceId];
            const insightState = insightStateMap[g.traceId] ?? {
              status: "idle"
            };

            const insight =
              insightState.status === "ready" ? insightState.data : null;
            const rlResetAt =
              insightState.status === "error"
                ? insightState.rateLimit?.resetAt
                : undefined;

            const rateLimitedNow = rlResetAt != null && nowMs < rlResetAt;
            const retryInSec =
              rlResetAt != null
                ? Math.max(0, Math.ceil((rlResetAt - nowMs) / 1000))
                : undefined;

            const regenDisabled =
              insightState.status === "loading" || rateLimitedNow;
            const meta =
              insightState.status === "ready" ? insightState.meta : undefined;

            let freshnessLabel: string | undefined;

            if (meta?.cached === true) {
              freshnessLabel = "Cached";
            } else if (meta?.cached === false) {
              freshnessLabel = "Fresh";
            }

            return (
              <TraceCard
                key={g.traceId}
                g={g}
                openMap={openMap}
                traceOpen={traceOpen}
                insightOpen={insightOpen}
                insightState={insightState}
                rateLimitedNow={rateLimitedNow}
                retryInSec={retryInSec ?? null}
                regenDisabled={regenDisabled}
                freshnessLabel={freshnessLabel ?? null}
                insight={insight}
                onToggleTrace={onToggleTrace}
                onTogglePayload={onTogglePayload}
                onCopyPayload={onCopyPayload}
                toggleInsight={toggleInsight}
                setInsightOpenMap={setInsightOpenMap}
                onRegenerateInsight={onRegenerateInsight}
                nowMs={nowMs}
                copiedId={copiedId}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
