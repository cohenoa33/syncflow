import type { Event, InsightState, TraceGroup } from "../../lib/types";
import { EventList } from "./EventList";
import { InsightPanel } from "./InsightPanel";


type Props = {
  nowMs: number;
  g: TraceGroup;
  openMap: Record<string, boolean>;
  copiedId: string | null;
  onToggleTrace: (traceId: string) => void;
  onTogglePayload: (eventId: string) => void;
  onCopyPayload: (event: Event) => void;
  toggleInsight: (traceId: string) => void;
  setInsightOpenMap: React.Dispatch<
    React.SetStateAction<Record<string, boolean>>
  >;
  onRegenerateInsight: (traceId: string) => void;
  insightOpen: boolean;
  traceOpen: boolean;
  insightState: InsightState;
  rateLimitedNow: boolean;
  retryInSec: number | null;
  regenDisabled?: boolean;
  freshnessLabel: string | null;
  insight: any;
};

export function TraceCard({
  nowMs,
  g,
  openMap,
  copiedId,
  onToggleTrace,
  onTogglePayload,
  onCopyPayload,
  toggleInsight,
  setInsightOpenMap,
  onRegenerateInsight,
  insightOpen,
  traceOpen,
  insightState,
  rateLimitedNow,
  retryInSec,
  regenDisabled,
  freshnessLabel, insight
}: Props) {

  return (
    <div key={g.traceId} className="p-4">
      <div
        role="button"
        tabIndex={0}
        onClick={() => onToggleTrace(g.traceId)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onToggleTrace(g.traceId);
          }
        }}
        className="w-full text-left flex items-center justify-between gap-3 rounded-lg bg-gray-50 hover:bg-gray-100 px-3 py-2 transition cursor-pointer select-none"
      >
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-semibold text-gray-900">
            {g.headerOp}
          </span>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggleTrace(g.traceId);
            }}
            className="text-xs text-gray-500 hover:text-gray-900 underline"
            title="Toggle app selection"
          >
            {g.appName}
          </button>

          {g.totalDurationMs != null && (
            <span className="text-xs text-gray-500">
              {g.totalDurationMs}ms total
            </span>
          )}

          <span className="text-xs text-gray-500">
            {g.events.length} event{g.events.length !== 1 ? "s" : ""}
          </span>

          {g.displayTraceId && (
            <span className="text-xs text-gray-400 font-mono">
              trace:{g.displayTraceId}
            </span>
          )}
        </div>

        <div className="flex items-center justify-end gap-0.5">
          {(g.statusCode != null || g.slow || g.hasError) && (
            <span className="inline-flex items-center gap-0.5">
              {g.statusCode != null && (
                <span
                  className={`px-2 py-0.5 rounded text-xs font-medium ${
                    g.ok
                      ? "bg-emerald-100 text-emerald-800"
                      : "bg-rose-100 text-rose-800"
                  }`}
                >
                  {g.statusCode}
                </span>
              )}
              {g.hasError && (
                <span className="px-2 py-0.5 rounded text-xs font-medium bg-rose-100 text-rose-800">
                  error
                </span>
              )}
              {g.slow && !g.hasError && (
                <span className="px-2 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-800">
                  slow
                </span>
              )}
            </span>
          )}

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              toggleInsight(g.traceId);
            }}
            className="text-xs px-2 py-1 rounded bg-slate-100 text-slate-700 hover:bg-slate-200"
          >
            {insightOpen ? "Close Insight" : "AI Insight"}
          </button>

          <div className="text-xs text-gray-500">
            {traceOpen ? "Collapse" : "Expand"}
          </div>
        </div>
      </div>
      {traceOpen && (
        <div className="mt-3 rounded-lg border border-gray-200 overflow-hidden bg-white">
          {/* Trace-body header row */}
          <div className="flex items-center justify-between px-3 py-2 bg-gray-50 border-b border-gray-200">
            <div className="text-xs font-medium text-gray-700">
              Events ({g.events.length})
            </div>

            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onToggleTrace(g.traceId);
              }}
              className="text-xs text-gray-500 hover:text-gray-900"
              aria-label="Collapse trace"
              title="Collapse"
            >
              ✕
            </button>
          </div>
          {g.events.map((event) => {
            const isOpen = !!openMap[event.id];
            const isCopied = copiedId === event.id;

            return (
              <EventList
                key={event.id}
                event={event}
                isOpen={isOpen}
                isCopied={isCopied}
                onTogglePayload={onTogglePayload}
                onCopyPayload={onCopyPayload}
              />
            );
          })}
        </div>
      )}
      {insightOpen && (
        <InsightPanel
          nowMs={nowMs}
          g={g}
          setInsightOpenMap={setInsightOpenMap}
          onRegenerateInsight={onRegenerateInsight}
          insightState={insightState}
          rateLimitedNow={rateLimitedNow}
          retryInSec={retryInSec}
          regenDisabled={regenDisabled}
          freshnessLabel={freshnessLabel}
          insight={insight}
        />
      )}
    </div>
  );
}
