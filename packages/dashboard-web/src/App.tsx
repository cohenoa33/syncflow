// packages/dashboard-web/src/App.tsx

import { useEventStore } from "./store/events";

export default function App() {
  const { events, clear } = useEventStore();

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 px-6 py-12">
      {/* Outer max-width wrapper */}
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <header className="flex flex-col items-center justify-between gap-4 m-4">
          <h1 className="text-3xl font-bold sm:text-4xl tracking-tight leading-tight text-center w-full">
            SyncFlow Dashboard
            <span className="block text-balance sm:text-lg font-medium text-slate-400 m-1 ">
              (MVP)
            </span>
          </h1>
            <button
              onClick={clear}
              className="self-center sm:self-auto px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-sm font-medium transition mb-2 mt-2"
            >
              Clear
            </button>

        </header>

        {/* Big wrapping card */}
        <div className="mb-5 rounded-3xl bg-slate-900/60 border border-slate-800 shadow-sm overflow-hidden">
          <div className="p-2.5">
            {events.length === 0 ? (
              <div className="p-10 text-center">
                <div className="text-slate-200 font-semibold text-lg">
                  Waiting for events…
                </div>
                <div className="text-sm text-slate-500 mt-1">
                  Trigger an API call or DB change to see live updates.
                </div>
              </div>
            ) : (
              <div className="divide-y divide-slate-800 rounded-2xl overflow-hidden">
                {events.map((e, i) => (
                  <div
                    key={e.traceId + i}
                    className="p-6 hover:bg-slate-900/70 transition"
                  >
                    <div className="flex items-center justify-between">
                      <div className="font-semibold text-slate-500 text-base">
                        {e.type}
                      </div>
                      <div className="text-xs text-slate-500">
                        {new Date(e.ts).toLocaleTimeString()}
                      </div>
                    </div>

                    <pre className="mt-3 text-xs text-slate-200 overflow-x-auto whitespace-pre-wrap leading-relaxed">
                      {JSON.stringify(e.payload, null, 2)}
                    </pre>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
