import { useEffect, useMemo, useState } from "react";
import { io } from "socket.io-client";
import { API_BASE, SOCKET_URL } from "./lib/config";

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

type TraceGroup = {
  traceId: string; // "no-trace:<eventId>" for untraced events
  displayTraceId?: string; // undefined for no-trace groups
  events: Event[];
  headerOp: string;
  appName: string;
  startedAt: number;
  totalDurationMs?: number;
  hasExpress: boolean;
  statusCode?: number;
  ok?: boolean;
  slow?: boolean;
  hasError?: boolean;
};

export default function App() {
  const [events, setEvents] = useState<Event[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [connected, setConnected] = useState(false);

  const [filter, setFilter] = useState<
    "all" | "express" | "mongoose" | "error"
  >("all");
  const [appFilter, setAppFilter] = useState<string | "all">("all");

  const [openMap, setOpenMap] = useState<Record<string, boolean>>({});
  const [traceOpenMap, setTraceOpenMap] = useState<Record<string, boolean>>({});
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const [loadingHistory, setLoadingHistory] = useState(true);

  const [query, setQuery] = useState("");
  const [showSlowOnly, setShowSlowOnly] = useState(false);
  const [showErrorsOnly, setShowErrorsOnly] = useState(false);


  // ----- Socket + initial load -----
  useEffect(() => {
    let isMounted = true;

    // 1) Load persisted history from API (Mongo-backed)
    (async () => {
      try {
        setLoadingHistory(true);
        const res = await fetch(`${API_BASE}/api/traces`);
        const data: Event[] = await res.json();

        const ordered = [...data].sort((a, b) => a.ts - b.ts);
        if (!isMounted) return;

        setEvents(ordered);

        const initialOpen: Record<string, boolean> = {};
        const initialTraceOpen: Record<string, boolean> = {};
        for (const e of ordered) {
          initialOpen[e.id] = false;
          const key = e.traceId ? e.traceId : `no-trace:${e.id}`;
          if (!(key in initialTraceOpen)) initialTraceOpen[key] = true;
        }
        setOpenMap(initialOpen);
        setTraceOpenMap(initialTraceOpen);
      } catch (err) {
        console.error("[Dashboard] failed to load traces", err);
      } finally {
        if (isMounted) setLoadingHistory(false);
      }
    })();

    // 2) Attach live socket
    const socket = io(SOCKET_URL, {
      transports: ["websocket", "polling"]
    });

    socket.on("connect", () => setConnected(true));
    socket.on("disconnect", () => setConnected(false));

    socket.on("agents", (agentList: Agent[]) => setAgents(agentList));

    socket.on("event", (event: Event) => {
      setEvents((prev) => [...prev, event].slice(-1000));
      setOpenMap((m) => ({ ...m, [event.id]: false }));

      const key = event.traceId ? event.traceId : `no-trace:${event.id}`;
      setTraceOpenMap((m) => (key in m ? m : { ...m, [key]: true }));
    });

    // Server broadcasts this on CLEAR so all tabs reset
    socket.on("eventHistory", (history: Event[]) => {
      const ordered = [...history].sort((a, b) => a.ts - b.ts);
      setEvents(ordered);

      const initialOpen: Record<string, boolean> = {};
      const initialTraceOpen: Record<string, boolean> = {};
      for (const e of ordered) {
        initialOpen[e.id] = false;
        const key = e.traceId ? e.traceId : `no-trace:${e.id}`;
        if (!(key in initialTraceOpen)) initialTraceOpen[key] = true;
      }
      setOpenMap(initialOpen);
      setTraceOpenMap(initialTraceOpen);
    });

    return () => {
      isMounted = false;
      socket.close();
    };
  }, []);

  // ----- Local UI helpers -----
  const toggleOpen = (id: string) =>
    setOpenMap((m) => ({ ...m, [id]: !m[id] }));
  const toggleTrace = (traceId: string) =>
    setTraceOpenMap((m) => ({ ...m, [traceId]: !m[traceId] }));

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

  // ----- Filtering -----
const filteredEvents = useMemo(() => {
  let out = events;

  if (appFilter !== "all") {
    out = out.filter((e) => e.appName === appFilter);
  }

  if (filter === "error") return out.filter((e) => e.level === "error");
  if (filter !== "all") return out.filter((e) => e.type === filter);

  return out;
}, [events, filter, appFilter]);

  // ----- Group into traces -----
  const traceGroups: TraceGroup[] = useMemo(() => {
    const map = new Map<string, Event[]>();

    for (const e of filteredEvents) {
      const key = e.traceId ? e.traceId : `no-trace:${e.id}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(e);
    }

    const groups: TraceGroup[] = [];

    for (const [traceId, evs] of map.entries()) {
      const ordered = [...evs].sort((a, b) => a.ts - b.ts);

      const expressEvt = ordered.find((x) => x.type === "express");
      const statusCode =
        expressEvt?.payload?.response?.statusCode ??
        expressEvt?.payload?.response?.status ??
        undefined;

      const ok =
        expressEvt?.payload?.response?.ok ??
        (typeof statusCode === "number" ? statusCode < 400 : undefined);

      const hasError = ordered.some(
        (e) => e.level === "error" || e.type === "error"
      );

      const slow =
        typeof expressEvt?.durationMs === "number"
          ? expressEvt.durationMs > 500
          : ordered.reduce((acc, x) => acc + (x.durationMs ?? 0), 0) > 800;

      const headerOp =
        expressEvt?.operation ?? ordered[0]?.operation ?? "Trace";
      const appName = expressEvt?.appName ?? ordered[0]?.appName ?? "app";
      const startedAt = ordered[0]?.ts ?? Date.now();
      const hasExpress = !!expressEvt;

      const totalDurationMs =
        expressEvt?.durationMs ??
        ordered.reduce((acc, x) => acc + (x.durationMs ?? 0), 0) ??
        undefined;

      groups.push({
        traceId,
        displayTraceId: traceId.startsWith("no-trace:") ? undefined : traceId,
        events: ordered,
        headerOp,
        appName,
        startedAt,
        totalDurationMs,
        hasExpress,
        statusCode,
        ok,
        hasError,
        slow
      });
    }

    groups.sort((a, b) => b.startedAt - a.startedAt);
    return groups;
  }, [filteredEvents]);

  const filteredTraceGroups = useMemo(() => {
    const q = query.trim().toLowerCase();

    return traceGroups.filter((g) => {
      if (showSlowOnly && !g.slow) return false;
      if (showErrorsOnly && !g.hasError) return false;

      if (!q) return true;

      if (g.headerOp.toLowerCase().includes(q)) return true;
      if (g.appName.toLowerCase().includes(q)) return true;

      if (g.events.some((e) => e.operation.toLowerCase().includes(q)))
        return true;

      try {
        const sample = g.events
          .slice(0, 4)
          .map((e) => JSON.stringify(e.payload ?? {}))
          .join(" ");
        if (sample.toLowerCase().includes(q)) return true;
      } catch {
        // ignore
      }

      return false;
    });
  }, [traceGroups, query, showSlowOnly, showErrorsOnly]);

  
  // ----- Expand / collapse all payloads -----
  const expandAllPayloads = () => {
    setOpenMap((m) => {
      const next: Record<string, boolean> = {};
      for (const g of filteredTraceGroups)
        for (const e of g.events) next[e.id] = true;
      return { ...m, ...next };
    });

    setTraceOpenMap((m) => {
      const next: Record<string, boolean> = {};
      for (const g of filteredTraceGroups) next[g.traceId] = true;
      return { ...m, ...next };
    });
  };

  const collapseAllPayloads = () => {
    setOpenMap((m) => {
      const next: Record<string, boolean> = {};
      for (const g of filteredTraceGroups)
        for (const e of g.events) next[e.id] = false;
      return { ...m, ...next };
    });
  };

  const anyPayloadClosed = filteredTraceGroups.some((g) =>
    g.events.some((e) => !openMap[e.id])
  );

  // Keyboard shortcuts
  useEffect(() => {
    const onKeyDown = (ev: KeyboardEvent) => {
      const tag = (ev.target as HTMLElement)?.tagName?.toLowerCase();
      if (
        tag === "input" ||
        tag === "textarea" ||
        (ev.target as HTMLElement)?.isContentEditable
      )
        return;

      // E toggles latest event payload
      if (ev.key === "e" && !ev.shiftKey) {
        const latest = filteredEvents[filteredEvents.length - 1];
        if (!latest) return;
        toggleOpen(latest.id);
        ev.preventDefault();
      }

      // Shift+E toggles all payloads
      if (ev.key === "E" || (ev.key === "e" && ev.shiftKey)) {
        if (anyPayloadClosed) expandAllPayloads();
        else collapseAllPayloads();
        ev.preventDefault();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [filteredEvents, anyPayloadClosed, filteredTraceGroups]);

  const exportTracesJson = () => {
    const exportPayload = filteredTraceGroups.map((g) => ({
      traceId: g.displayTraceId ?? g.traceId,
      headerOp: g.headerOp,
      appName: g.appName,
      startedAt: g.startedAt,
      totalDurationMs: g.totalDurationMs,
      statusCode: g.statusCode,
      ok: g.ok,
      slow: g.slow,
      hasError: g.hasError,
      events: g.events
    }));

    const blob = new Blob([JSON.stringify(exportPayload, null, 2)], {
      type: "application/json"
    });

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const now = new Date().toISOString().replace(/[:.]/g, "-");
    a.href = url;
    a.download = `syncflow-traces-${now}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const clearAll = async () => {
    // optimistic UI clear
    setEvents([]);
    setOpenMap({});
    setTraceOpenMap({});

    try {
      await fetch(`${API_BASE}/api/traces`, { method: "DELETE" });
    } catch (err) {
      console.error("[Dashboard] failed to clear traces", err);
    }
  };

  const runDemo = async () => {
    try {
      // 1) wipe
      await fetch(`${API_BASE}/api/traces`, { method: "DELETE" });

      // optimistic UI reset
      setEvents([]);
      setOpenMap({});
      setTraceOpenMap({});

      // 2) seed
      const res = await fetch(`${API_BASE}/api/demo-seed`, { method: "POST" });
      const json: { ok: boolean; count: number; traceIds?: string[] } =
        await res.json();

      // 3) fetch fresh from DB (authoritative)
      const eventsRes = await fetch(`${API_BASE}/api/traces`);
      const data: Event[] = await eventsRes.json();
      const ordered = [...data].sort((a, b) => a.ts - b.ts);
      setEvents(ordered);

      // init maps
      const initialOpen: Record<string, boolean> = {};
      const initialTraceOpen: Record<string, boolean> = {};
      for (const e of ordered) {
        initialOpen[e.id] = false;
        const key = e.traceId ? e.traceId : `no-trace:${e.id}`;
        if (!(key in initialTraceOpen)) initialTraceOpen[key] = false;
      }

      const newestTraceId = json.traceIds?.[json.traceIds.length - 1];
      if (newestTraceId) initialTraceOpen[newestTraceId] = true;

      // open the latest express payload in that newest trace
      if (newestTraceId) {
        const newestTraceEvents = ordered
          .filter((e) => e.traceId === newestTraceId)
          .sort((a, b) => b.ts - a.ts);

        const latestExpress = newestTraceEvents.find(
          (e) => e.type === "express"
        );
        if (latestExpress) initialOpen[latestExpress.id] = true;
      }

      setOpenMap(initialOpen);
      setTraceOpenMap(initialTraceOpen);
    } catch (err) {
      console.error("[Dashboard] demo mode failed", err);
      alert("Demo Mode failed. Check the dashboard server logs.");
    }
  };

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

      {/* Main */}
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

        {/* Type Filters + Actions */}
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
                  : t === "error"
                    ? `Error (${events.filter((e) => e.level === "error").length})`
                    : `${t[0].toUpperCase() + t.slice(1)} (${
                        events.filter((e) => e.type === t).length
                      })`}
              </button>
            ))}

            <button
              onClick={clearAll}
              className="ml-auto px-4 py-2 rounded-lg font-medium bg-red-100 text-red-700 hover:bg-red-200 transition-colors"
            >
              Clear
            </button>

            <button
              onClick={runDemo}
              className="px-4 py-2 rounded-lg font-medium bg-indigo-600 text-white hover:bg-indigo-700 transition-colors"
            >
              Demo Mode
            </button>
          </div>
        </div>

        {/* Traces */}
        <div className="bg-white rounded-lg shadow">
          <div className="p-4 border-b border-gray-200 flex items-center justify-between">
            <h2 className="text-lg font-semibold">Live Traces</h2>

            {filteredTraceGroups.length > 0 && (
              <button
                onClick={() =>
                  anyPayloadClosed ? expandAllPayloads() : collapseAllPayloads()
                }
                className="text-xs text-gray-600 hover:text-gray-900 underline"
              >
                {anyPayloadClosed
                  ? "Expand all payloads"
                  : "Collapse all payloads"}
              </button>
            )}
          </div>

          <div className="px-4 pb-2 text-[11px] text-gray-500">
            Tip: press <span className="font-mono">E</span> to toggle latest
            payload • <span className="font-mono">Shift+E</span> to
            expand/collapse all payloads
          </div>

          {/* Search & flags */}
          <div className="px-4 pb-4">
            <div className="bg-white rounded-lg border border-gray-200 p-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search traces (route, model, payload text...)"
                className="w-full sm:flex-1 px-3 py-2 rounded-md border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />

              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={showSlowOnly}
                  onChange={(e) => setShowSlowOnly(e.target.checked)}
                  className="rounded"
                />
                Slow only
              </label>

              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={showErrorsOnly}
                  onChange={(e) => setShowErrorsOnly(e.target.checked)}
                  className="rounded"
                />
                Errors only
              </label>
              <select
                value={appFilter}
                onChange={(e) => setAppFilter(e.target.value)}
                className="px-2 py-1 border rounded text-sm"
              >
                <option value="all">All apps</option>
                {agents.map((a) => (
                  <option key={a.appName} value={a.appName}>
                    {a.appName}
                  </option>
                ))}
              </select>

              <button
                onClick={exportTracesJson}
                disabled={filteredTraceGroups.length === 0}
                className={`px-3 py-2 rounded-md text-sm font-medium transition ${
                  filteredTraceGroups.length === 0
                    ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                    : "bg-indigo-600 text-white hover:bg-indigo-700"
                }`}
              >
                Export JSON
              </button>

              <div className="text-xs text-gray-500">
                Showing {filteredTraceGroups.length} / {traceGroups.length}
              </div>
            </div>
          </div>

          {loadingHistory && filteredTraceGroups.length === 0 ? (
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
                      onClick={() => toggleTrace(g.traceId)}
                      className="w-full text-left flex items-center justify-between gap-3 rounded-lg bg-gray-50 hover:bg-gray-100 px-3 py-2 transition"
                    >
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold text-gray-900">
                          {g.headerOp}
                        </span>

                        <span className="text-xs text-gray-500">
                          {g.appName}
                        </span>

                        {g.totalDurationMs != null && (
                          <span className="text-xs text-gray-500">
                            {g.totalDurationMs}ms total
                          </span>
                        )}

                        <span className="text-xs text-gray-500">
                          {g.events.length} event
                          {g.events.length !== 1 ? "s" : ""}
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
                                          onClick={() => toggleOpen(event.id)}
                                          className="text-xs text-indigo-700 hover:text-indigo-900 underline"
                                        >
                                          {isOpen
                                            ? "Hide payload"
                                            : "Show payload"}
                                        </button>

                                        <button
                                          onClick={() => copyPayload(event)}
                                          className="text-xs text-gray-700 hover:text-gray-900 underline"
                                        >
                                          {isCopied
                                            ? "Copied!"
                                            : "Copy payload"}
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
      </main>
    </div>
  );
}
