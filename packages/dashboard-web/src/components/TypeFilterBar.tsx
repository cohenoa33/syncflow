import type { Event } from "../lib/types";

type Props = {
  filter: "all" | "express" | "mongoose" | "error";
  setFilter: (v: "all" | "express" | "mongoose" | "error") => void;
  filteredEvents: Event[];
  onClear: () => void;
  onDemo: () => void;
};

export function TypeFilterBar({
  filter,
  setFilter,
  filteredEvents,
  onClear,
  onDemo
}: Props) {
  return (
    <div className="bg-white rounded-lg shadow mb-6 p-4">
      <div className="flex gap-2 flex-wrap">
        {(["all", "express", "mongoose", "error"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setFilter(t)}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              filter === t
                ? "bg-indigo-600 text-white"
                : "bg-gray-100 text-gray-700 hover:bg-gray-200"
            }`}
          >
            {t === "all"
              ? `All (${filteredEvents.length})`
              : t === "error"
                ? `Error (${filteredEvents.filter((e) => e.level === "error").length})`
                : `${t[0].toUpperCase() + t.slice(1)} (${
                    filteredEvents.filter((e) => e.type === t).length
                  })`}
          </button>
        ))}

        <button
          onClick={onClear}
          className="ml-auto px-4 py-2 rounded-lg font-medium bg-red-100 text-red-700 hover:bg-red-200 transition-colors"
        >
          Clear
        </button>

        <button
          onClick={onDemo}
          className="px-4 py-2 rounded-lg font-medium bg-indigo-600 text-white hover:bg-indigo-700 transition-colors"
        >
          Demo Mode
        </button>
      </div>
    </div>
  );
}
