import type { Event, TraceGroup } from "../lib/types";

type Props = {
  loading: boolean;
  filteredTraceGroups: TraceGroup[];
  totalTraceGroupsCount: number;

  openMap: Record<string, boolean>;
  traceOpenMap: Record<string, boolean>;
  copiedId: string | null;

  onToggleTrace: (traceId: string) => void;
  onTogglePayload: (eventId: string) => void;
  onCopyPayload: (event: Event) => void;

  anyPayloadClosed: boolean;
  onToggleAllPayloads: () => void;

  onToggleAppFromTrace: (appName: string) => void;
};

export function TraceList({
  loading,
  filteredTraceGroups,
  openMap,
  traceOpenMap,
  copiedId,
  onToggleTrace,
  onTogglePayload,
  onCopyPayload,
  anyPayloadClosed,
  onToggleAllPayloads,
  onToggleAppFromTrace
}: Props) {
  const getTypeBadgeClasses = (type: Event["type"]) =>
    type === "express"
      ? "bg-blue-100 text-blue-800"
      : type === "mongoose"
        ? "bg-green-100 text-green-800"
        : "bg-red-100 text-red-800";

  const getLevelBadgeClasses = (level: Event["level"]) =>
    level === "info"
      ? "bg-slate-100 text-slate-700"
      : level === "warn"
        ? "bg-amber-100 text-amber-800"
        : "bg-rose-100 text-rose-800";

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

      {loading && filteredTraceGroups.length === 0 ? (
        <div className="p-6 space-y-3">
          <div className="h-10 bg-gray-100 rounded animate-pulse" />
          <div className="h-10 bg-gray-100 rounded animate-pulse" />
          <div className="h-10 bg-gray-100 rounded animate-pulse" />
          <div className="text-xs text-gray-400 pt-2">Loading history…</div>
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

            return (
              <div key={g.traceId} className="p-4">
                <button
                  onClick={() => onToggleTrace(g.traceId)}
                  className="w-full text-left flex items-center justify-between gap-3 rounded-lg bg-gray-50 hover:bg-gray-100 px-3 py-2 transition"
                >
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-gray-900">
                      {g.headerOp}
                    </span>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onToggleAppFromTrace(g.appName);
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

                  {(g.statusCode != null || g.slow || g.hasError) && (
                    <span className="inline-flex items-center gap-1">
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

                  <div className="text-xs text-gray-500">
                    {traceOpen ? "Collapse" : "Expand"}
                  </div>
                </button>

                {traceOpen && (
                  <div className="mt-3 rounded-lg border border-gray-200 overflow-hidden">
                    <div className="divide-y divide-gray-200">
                      {g.events.map((event) => {
                        const isOpen = !!openMap[event.id];
                        const isCopied = copiedId === event.id;

                        return (
                          <div
                            key={event.id}
                            className="p-3 hover:bg-gray-50 transition-colors"
                          >
                            <div className="flex items-start justify-between gap-4">
                              <div className="flex-1">
                                <div className="flex items-center gap-2 mb-1 flex-wrap">
                                  <span
                                    className={`px-2 py-1 rounded text-xs font-medium ${getTypeBadgeClasses(
                                      event.type
                                    )}`}
                                  >
                                    {event.type}
                                  </span>

                                  <span
                                    className={`px-2 py-1 rounded text-xs font-medium ${getLevelBadgeClasses(
                                      event.level
                                    )}`}
                                  >
                                    {event.level}
                                  </span>

                                  {event.durationMs != null && (
                                    <span className="text-xs text-gray-500">
                                      {event.durationMs}ms
                                    </span>
                                  )}
                                </div>

                                <p className="font-mono text-sm text-gray-900 mb-2">
                                  {event.operation}
                                </p>

                                {event.payload && (
                                  <div className="flex items-center gap-3">
                                    <button
                                      onClick={() => onTogglePayload(event.id)}
                                      className="text-xs text-indigo-700 hover:text-indigo-900 underline"
                                    >
                                      {isOpen ? "Hide payload" : "Show payload"}
                                    </button>

                                    <button
                                      onClick={() => onCopyPayload(event)}
                                      className="text-xs text-gray-700 hover:text-gray-900 underline"
                                    >
                                      {isCopied ? "Copied!" : "Copy payload"}
                                    </button>
                                  </div>
                                )}

                                {event.payload && isOpen && (
                                  <pre className="mt-2 text-xs text-gray-700 bg-gray-50 p-3 rounded overflow-x-auto leading-relaxed">
                                    {JSON.stringify(event.payload, null, 2)}
                                  </pre>
                                )}
                              </div>

                              <div className="text-xs text-gray-500 whitespace-nowrap">
                                {new Date(event.ts).toLocaleTimeString()}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
