import { useEffect, useMemo, useState } from "react";
import { io } from "socket.io-client";

interface Event {
  id: string;
  appName: string;
  type: "express" | "mongoose" | "error";
  operation: string;
  ts: number;
  durationMs?: number;
  traceId?: string;
  level: "info" | "warn" | "error";
  payload: Record<string, any>;
  receivedAt?: number;
}

interface Agent {
  appName: string;
  socketId: string;
}

function App() {
  const [events, setEvents] = useState<Event[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [connected, setConnected] = useState(false);
  const [filter, setFilter] = useState<
    "all" | "express" | "mongoose" | "error"
  >("all");

  const [openMap, setOpenMap] = useState<Record<string, boolean>>({});
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    const socket = io("http://localhost:5050");

    socket.on("connect", () => {
      setConnected(true);
      socket.emit("getEvents");
    });

    socket.on("disconnect", () => {
      setConnected(false);
    });

    socket.on("event", (event: Event) => {
      setEvents((prev) => [event, ...prev].slice(0, 1000));
      setOpenMap((m) => ({ ...m, [event.id]: false }));
    });

    socket.on("eventHistory", (history: Event[]) => {
      const reversed = history.reverse();
      setEvents(reversed);
      const initialOpen: Record<string, boolean> = {};
      for (const e of reversed) initialOpen[e.id] = false;
      setOpenMap(initialOpen);
    });

    socket.on("agents", (agentList: Agent[]) => {
      setAgents(agentList);
    });

    return () => {
      socket.close();
    };
  }, []);

  const filteredEvents = useMemo(
    () => events.filter((e) => filter === "all" || e.type === filter),
    [events, filter]
  );

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

  const toggleOpen = (id: string) =>
    setOpenMap((m) => ({ ...m, [id]: !m[id] }));

  const copyPayload = async (event: Event) => {
    try {
      const text = JSON.stringify(event.payload ?? {}, null, 2);
      await navigator.clipboard.writeText(text);
      setCopiedId(event.id);
      setTimeout(() => {
        setCopiedId((cur) => (cur === event.id ? null : cur));
      }, 1200);
    } catch (err) {
      console.error("Failed to copy payload", err);
      alert("Copy failed. Your browser may block clipboard access.");
    }
  };
  const expandAll = () =>
    setOpenMap((m) => {
      const next: Record<string, boolean> = {};
      for (const e of filteredEvents) next[e.id] = true;
      return { ...m, ...next };
    });

  const collapseAll = () =>
    setOpenMap((m) => {
      const next: Record<string, boolean> = {};
      for (const e of filteredEvents) next[e.id] = false;
      return { ...m, ...next };
    });

  const allFilteredExpanded =
    filteredEvents.length > 0 && filteredEvents.every((e) => openMap[e.id]);

    useEffect(() => {
      const onKeyDown = (ev: KeyboardEvent) => {
        const tag = (ev.target as HTMLElement)?.tagName?.toLowerCase();
        if (
          tag === "input" ||
          tag === "textarea" ||
          (ev.target as HTMLElement)?.isContentEditable
        ) {
          return;
        }

        if (ev.key === "e" && !ev.shiftKey) {
          const latest = filteredEvents[0];
          if (!latest) return;
          toggleOpen(latest.id);
          ev.preventDefault();
        }

        if (ev.key === "E" || (ev.key === "e" && ev.shiftKey)) {
          if (allFilteredExpanded) collapseAll();
          else expandAll();
          ev.preventDefault();
        }
      };

      window.addEventListener("keydown", onKeyDown);
      return () => window.removeEventListener("keydown", onKeyDown);
    }, [filteredEvents, allFilteredExpanded]);
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">
                SyncFlow Dashboard
              </h1>
              <p className="text-sm text-gray-500 mt-1">
                Real-time monitoring for MERN applications
              </p>
            </div>

            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <div
                  className={`w-2 h-2 rounded-full ${
                    connected ? "bg-green-500" : "bg-red-500"
                  }`}
                />
                <span className="text-sm text-gray-600">
                  {connected ? "Connected" : "Disconnected"}
                </span>
              </div>
              <div className="text-sm text-gray-600">
                {agents.length} agent{agents.length !== 1 ? "s" : ""}
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Connected Agents */}
        {agents.length > 0 && (
          <div className="bg-white rounded-lg shadow mb-6 p-4">
            <h2 className="text-lg font-semibold mb-3">
              Connected Applications
            </h2>
            <div className="flex flex-wrap gap-2">
              {agents.map((agent) => (
                <span
                  key={agent.socketId}
                  className="px-3 py-1 bg-indigo-100 text-indigo-800 rounded-full text-sm font-medium"
                >
                  {agent.appName}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Filters */}
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
                  ? `All (${events.length})`
                  : `${t[0].toUpperCase() + t.slice(1)} (${
                      events.filter((e) => e.type === t).length
                    })`}
              </button>
            ))}

            <button
              onClick={() => {
                setEvents([]);
                setOpenMap({});
              }}
              className="ml-auto px-4 py-2 rounded-lg font-medium bg-red-100 text-red-700 hover:bg-red-200 transition-colors"
            >
              Clear
            </button>
          </div>
        </div>

        {/* Events List */}
        <div className="bg-white rounded-lg shadow">
          <div className="p-4 border-b border-gray-200 flex items-center justify-between">
            <h2 className="text-lg font-semibold">Live Events</h2>
            {filteredEvents.length > 0 && (
              <button
                onClick={() =>
                  allFilteredExpanded ? collapseAll() : expandAll()
                }
                className="text-xs text-gray-600 hover:text-gray-900 underline"
              >
                {allFilteredExpanded ? "Collapse all" : "Expand all"}
              </button>
            )}
          </div>

          <div className="divide-y divide-gray-200 max-h-[650px] overflow-y-auto">
            {filteredEvents.length === 0 ? (
              <div className="p-8 text-center text-gray-500">
                <p className="text-lg font-medium mb-2">No events yet</p>
                <p className="text-sm">
                  Start your instrumented application to see events here
                </p>
              </div>
            ) : (
              filteredEvents.map((event) => {
                const isOpen = !!openMap[event.id];
                const isCopied = copiedId === event.id;

                return (
                  <div
                    key={event.id}
                    className="p-4 hover:bg-gray-50 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        {/* Badges row */}
                        <div className="flex items-center gap-2 mb-2 flex-wrap">
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

                          <span className="text-xs text-gray-500">
                            {event.appName}
                          </span>

                          {event.durationMs != null && (
                            <span className="text-xs text-gray-500">
                              {event.durationMs}ms
                            </span>
                          )}

                          {event.traceId && (
                            <span className="text-xs text-gray-400 font-mono">
                              trace:{event.traceId}
                            </span>
                          )}
                        </div>

                        {/* Operation */}
                        <p className="font-mono text-sm text-gray-900 mb-2">
                          {event.operation}
                        </p>

                        {/* Payload actions */}
                        {event.payload && (
                          <div className="flex items-center gap-3">
                            <button
                              onClick={() => toggleOpen(event.id)}
                              className="text-xs text-indigo-700 hover:text-indigo-900 underline"
                            >
                              {isOpen ? "Hide payload" : "Show payload"}
                            </button>

                            <button
                              onClick={() => copyPayload(event)}
                              className="text-xs text-gray-700 hover:text-gray-900 underline"
                            >
                              {isCopied ? "Copied!" : "Copy payload"}
                            </button>
                          </div>
                        )}

                        {/* Payload block */}
                        {event.payload && isOpen && (
                          <pre className="mt-2 text-xs text-gray-700 bg-gray-50 p-3 rounded overflow-x-auto leading-relaxed">
                            {JSON.stringify(event.payload, null, 2)}
                          </pre>
                        )}
                      </div>

                      {/* Time */}
                      <div className="text-xs text-gray-500 whitespace-nowrap">
                        {new Date(event.ts).toLocaleTimeString()}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

export default App;
