import type { Event } from "../../lib/types";

type Props = {
  event: Event;
  onTogglePayload: (eventId: string) => void;
  onCopyPayload: (event: Event) => void;
  isOpen: boolean;
  isCopied: boolean;
};
export function EventList({
  event,
  isOpen,
  isCopied,
  onTogglePayload,
  onCopyPayload
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
    <div className="p-3 transition-colors">
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
}
