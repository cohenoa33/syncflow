import type { InsightState, TraceGroup } from "../../lib/types";

type Props = {
  nowMs: number;
  g: TraceGroup;
  setInsightOpenMap: React.Dispatch<
    React.SetStateAction<Record<string, boolean>>
  >;
  onRegenerateInsight: (traceId: string) => void;
  insightState: InsightState;
  rateLimitedNow: boolean;
  retryInSec: number | null;
  regenDisabled?: boolean;
  freshnessLabel: string | null;
  insight: any;
};

export function InsightPanel({
  nowMs,
  g,
  setInsightOpenMap,
  onRegenerateInsight,
  insightState,
  rateLimitedNow,
  retryInSec,
  regenDisabled,
  freshnessLabel,
  insight
}: Props) {

const isSampledOut =
  insightState.status === "error" &&
  insightState.code === "INSIGHT_SAMPLED_OUT";

const showSampledOut = isSampledOut && !(rateLimitedNow && retryInSec != null);
  function fmtAgo(ms?: number) {
    if (!ms) return null;
    const diff = Math.max(0, nowMs - ms);
    const s = Math.floor(diff / 1000);
    if (s < 60) return `${s}s ago`;
    const m = Math.floor(s / 60);
    return `${m}m ago`;
  }

  const getSeverityBadge = (sev: "info" | "warn" | "error") =>
    sev === "error"
      ? "bg-rose-100 text-rose-800"
      : sev === "warn"
        ? "bg-amber-100 text-amber-800"
        : "bg-slate-100 text-slate-700";

  function renderInsightContent() {
    if (insightState.status === "loading") {
      return (
        <div className="p-3 text-sm text-gray-500">Generating insight…</div>
      );
    } else {
      if (insightState.status === "error") {
        return (
          <div className="p-3">
            <div className="text-sm text-rose-700 font-medium">
              Failed to generate insight
            </div>

            <div className="text-xs text-gray-600 mt-1">
              {rateLimitedNow && retryInSec != null ? (
                <>
                  Rate limited. Try again in{" "}
                  <span className="font-mono">{retryInSec}s</span>.
                </>
              ) : showSampledOut ? (
                <>
                  {insightState.error}{" "}
                  <span className="text-gray-500">
                    (Sampling is enabled — use Regenerate to force compute.)
                  </span>
                </>
              ) : (
                insightState.error
              )}
            </div>
            <div className="mt-3 flex items-center gap-2">
              <button
                type="button"
                onClick={() => onRegenerateInsight(g.traceId)}
                disabled={regenDisabled}
                className={`text-xs px-2 py-1 rounded bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 ${
                  regenDisabled ? "opacity-50 cursor-not-allowed" : ""
                }`}
                title={
                  rateLimitedNow && retryInSec != null
                    ? `Rate limited. Retry in ${retryInSec}s`
                    : showSampledOut
                      ? "Force compute insight for this trace"
                      : "Retry"
                }
              >
                {rateLimitedNow && retryInSec != null
                  ? `Retry (${retryInSec}s)`
                  : showSampledOut
                    ? "Regenerate"
                    : "Retry"}
              </button>

              <button
                type="button"
                onClick={() =>
                  setInsightOpenMap((m) => ({
                    ...m,
                    [g.traceId]: false
                  }))
                }
                className="ml-auto text-xs text-gray-500 hover:text-gray-900"
              >
                Close
              </button>
            </div>
          </div>
        );
      } else if (insightState.status === "ready" && insight) {
        return (
          <div className="rounded-lg bg-gray-50 p-3">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold">Insight</span>

                <span
                  className={`text-xs px-2 py-0.5 rounded font-medium ${getSeverityBadge(insight.severity)}`}
                >
                  {insight.severity}
                </span>
                {freshnessLabel && (
                  <span className="text-[10px] px-2 py-0.5 rounded bg-white border border-gray-200 text-gray-600">
                    {freshnessLabel}
                  </span>
                )}
                {insightState.meta?.computedAt && (
                  <span className="text-xs text-gray-500">
                    {fmtAgo(insightState.meta.computedAt)}
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => onRegenerateInsight(g.traceId)}
                  disabled={regenDisabled}
                  className={`text-xs px-2 py-1 rounded bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 ${
                    regenDisabled ? "opacity-50 cursor-not-allowed" : ""
                  }`}
                  title="Recompute insight for this trace"
                >
                  Regenerate
                </button>

                <button
                  type="button"
                  onClick={() =>
                    setInsightOpenMap((m) => ({
                      ...m,
                      [g.traceId]: false
                    }))
                  }
                  className="ml-auto text-xs text-gray-500 hover:text-gray-900"
                  aria-label="Close insight"
                  title="Close"
                >
                  ✕
                </button>
              </div>

              <div className="text-sm text-gray-900">{insight.summary}</div>

              {insight.rootCause && (
                <div className="text-sm text-gray-700">
                  <span className="font-medium">Root cause:</span>{" "}
                  {insight.rootCause}
                </div>
              )}

              {Array.isArray(insight.signals) && insight.signals.length > 0 && (
                <ul className="text-xs text-gray-600 list-disc pl-5">
                  {insight.signals.map((s: any, idx: number) => (
                    <li key={idx}>{s.message}</li>
                  ))}
                </ul>
              )}

              {Array.isArray(insight.suggestions) &&
                insight.suggestions.length > 0 && (
                  <div>
                    <div className="text-xs font-semibold text-gray-700 mb-1">
                      Suggestions
                    </div>
                    <ul className="text-xs text-gray-600 list-disc pl-5">
                      {insight.suggestions.map((s: string, idx: number) => (
                        <li key={idx}>{s}</li>
                      ))}
                    </ul>
                  </div>
                )}
            </div>
          </div>
        );
      } else {
        return (
          <div className="p-3 text-sm text-gray-500">
            Open “AI Insight” to generate.
          </div>
        );
      }
    }
  }

  return (
    <div className="mt-3 rounded-lg border border-gray-200 overflow-hidden">
      {renderInsightContent()}
    </div>
  );
}
