import { useEffect, useMemo, useState } from "react";
import { io } from "socket.io-client";
import { API_BASE, SOCKET_URL } from "./lib/config";

import type { Agent, Event, TraceGroup } from "./lib/types";
import { buildAppOptions } from "./lib/apps";
import { groupEventsIntoTraces } from "./lib/trace";
import { buildInitialMaps } from "./lib/uiState";

import { ApplicationsCard } from "./components/ApplicationsCard";
import { TypeFilterBar } from "./components/TypeFilterBar";
import { TraceList } from "./components/TraceList";
import { SearchBar } from "./components/SearchBar";

export default function App() {
  const [events, setEvents] = useState<Event[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [connected, setConnected] = useState(false);

  const [filter, setFilter] = useState<
    "all" | "express" | "mongoose" | "error"
  >("all");

  // ✅ App selection model
  const [allAppsSelected, setAllAppsSelected] = useState(true);
  const [selectedApps, setSelectedApps] = useState<Set<string>>(new Set());

  const [openMap, setOpenMap] = useState<Record<string, boolean>>({});
  const [traceOpenMap, setTraceOpenMap] = useState<Record<string, boolean>>({});
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const [loadingHistory, setLoadingHistory] = useState(true);

  const [query, setQuery] = useState("");
  const [showSlowOnly, setShowSlowOnly] = useState(false);
  const [showErrorsOnly, setShowErrorsOnly] = useState(false);

  // ----- Load persisted history + attach live socket -----
  useEffect(() => {
    let isMounted = true;

    (async () => {
      try {
        setLoadingHistory(true);
        const res = await fetch(`${API_BASE}/api/traces`);
        const data: Event[] = await res.json();
        const ordered = [...data].sort((a, b) => a.ts - b.ts);

        if (!isMounted) return;
        setEvents(ordered);

        const { open, traceOpen } = buildInitialMaps(ordered);
        setOpenMap(open);
        setTraceOpenMap(traceOpen);
      } catch (err) {
        console.error("[Dashboard] failed to load traces", err);
      } finally {
        if (isMounted) setLoadingHistory(false);
      }
    })();

    const socket = io(SOCKET_URL, { transports: ["websocket", "polling"] });

    socket.on("connect", () => setConnected(true));
    socket.on("disconnect", () => setConnected(false));

    socket.on("agents", (agentList: Agent[]) => setAgents(agentList));

    socket.on("event", (event: Event) => {
      setEvents((prev) => [...prev, event].slice(-1000));
      setOpenMap((m) => ({ ...m, [event.id]: false }));

      const key = event.traceId ? event.traceId : `no-trace:${event.id}`;
      setTraceOpenMap((m) => (key in m ? m : { ...m, [key]: true }));
    });

    socket.on("eventHistory", (history: Event[]) => {
      const ordered = [...history].sort((a, b) => a.ts - b.ts);
      setEvents(ordered);

      const { open, traceOpen } = buildInitialMaps(ordered);
      setOpenMap(open);
      setTraceOpenMap(traceOpen);
    });

    return () => {
      isMounted = false;
      socket.close();
    };
  }, []);

  // ----- App options -----
  const appOptions = useMemo(() => {
    const fromAgents = agents.map((a) => a.appName);
    const fromEvents = Array.from(new Set(events.map((e) => e.appName)));
    return buildAppOptions(fromAgents, fromEvents);
  }, [agents, events]);

  // Keep selection sane when appOptions changes
  useEffect(() => {
    if (allAppsSelected) return;

    setSelectedApps((prev) => {
      const next = new Set<string>();
      for (const a of prev) if (appOptions.includes(a)) next.add(a);

      if (next.size === appOptions.length) {
        setAllAppsSelected(true);
        return new Set();
      }
      return next;
    });
  }, [appOptions, allAppsSelected]);

  // ----- Step 11 selection logic -----
  const toggleApp = (appName: string) => {
    // "ALL" -> first unselect becomes "all except clicked"
    if (allAppsSelected) {
      const next = new Set(appOptions);
      next.delete(appName);
      setAllAppsSelected(false);
      setSelectedApps(next);
      return;
    }

    setSelectedApps((prev) => {
      const next = new Set(prev);
      if (next.has(appName)) next.delete(appName);
      else next.add(appName);

      if (next.size === appOptions.length) {
        setAllAppsSelected(true);
        return new Set();
      }

      return next;
    });
  };

  const selectAllApps = () => {
    setAllAppsSelected(true);
    setSelectedApps(new Set());
  };

  // ----- Filters -----
  const filteredEvents = useMemo(() => {
    let out = events;

    if (!allAppsSelected) {
      if (selectedApps.size === 0) return [];
      out = out.filter((e) => selectedApps.has(e.appName));
    }

    if (filter === "all") return out;
    if (filter === "error") return out.filter((e) => e.level === "error");
    return out.filter((e) => e.type === filter);
  }, [events, filter, allAppsSelected, selectedApps]);

  const traceGroups: TraceGroup[] = useMemo(() => {
    return groupEventsIntoTraces(filteredEvents);
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

      if (ev.key === "e" && !ev.shiftKey) {
        const latest = filteredEvents[filteredEvents.length - 1];
        if (!latest) return;
        setOpenMap((m) => ({ ...m, [latest.id]: !m[latest.id] }));
        ev.preventDefault();
      }

      if (ev.key === "E" || (ev.key === "e" && ev.shiftKey)) {
        if (anyPayloadClosed) expandAllPayloads();
        else collapseAllPayloads();
        ev.preventDefault();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [filteredEvents, anyPayloadClosed, filteredTraceGroups]);

  // ----- Actions -----
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
      await fetch(`${API_BASE}/api/traces`, { method: "DELETE" });

      setEvents([]);
      setOpenMap({});
      setTraceOpenMap({});

      const res = await fetch(`${API_BASE}/api/demo-seed`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          apps: ["mern-sample-app", "mern-sample-app-2"]
        })
      });

      const json: {
        ok: boolean;
        count: number;
        traceIdsByApp?: Record<string, string[]>;
      } = await res.json();

      const eventsRes = await fetch(`${API_BASE}/api/traces`);
      const data: Event[] = await eventsRes.json();
      const ordered = [...data].sort((a, b) => a.ts - b.ts);
      setEvents(ordered);

      const initialOpen: Record<string, boolean> = {};
      const initialTraceOpen: Record<string, boolean> = {};
      for (const e of ordered) {
        initialOpen[e.id] = false;
        const key = e.traceId ? e.traceId : `no-trace:${e.id}`;
        if (!(key in initialTraceOpen)) initialTraceOpen[key] = false;
      }

      const allTraceIds = Object.values(json.traceIdsByApp ?? {}).flat();
      const newestTraceId = allTraceIds.length
        ? allTraceIds[allTraceIds.length - 1]
        : undefined;

      if (newestTraceId) initialTraceOpen[newestTraceId] = true;

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

  const toggleTrace = (traceId: string) =>
    setTraceOpenMap((m) => ({ ...m, [traceId]: !m[traceId] }));

  const togglePayload = (id: string) =>
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

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <ApplicationsCard
          appOptions={appOptions}
          allAppsSelected={allAppsSelected}
          selectedApps={selectedApps}
          onToggleApp={toggleApp}
          onSelectAll={selectAllApps}
        />

        <TypeFilterBar
          filter={filter}
          setFilter={setFilter}
          filteredEvents={filteredEvents}
          onClear={clearAll}
          onDemo={runDemo}
        />

        <SearchBar
          query={query}
          setQuery={setQuery}
          showSlowOnly={showSlowOnly}
          setShowSlowOnly={setShowSlowOnly}
          showErrorsOnly={showErrorsOnly}
          setShowErrorsOnly={setShowErrorsOnly}
          onExportJson={exportTracesJson}
          exportDisabled={filteredTraceGroups.length === 0}
          showingCount={filteredTraceGroups.length}
          totalCount={traceGroups.length}
        />

        <TraceList
          loading={loadingHistory}
          filteredTraceGroups={filteredTraceGroups}
          totalTraceGroupsCount={traceGroups.length}
          openMap={openMap}
          traceOpenMap={traceOpenMap}
          copiedId={copiedId}
          onToggleTrace={toggleTrace}
          onTogglePayload={togglePayload}
          onCopyPayload={copyPayload}
          anyPayloadClosed={anyPayloadClosed}
          onToggleAllPayloads={() =>
            anyPayloadClosed ? expandAllPayloads() : collapseAllPayloads()
          }
          onToggleAppFromTrace={(appName) => toggleApp(appName)}
        />
      </main>
    </div>
  );
}
