import { useEffect, useMemo, useState } from "react";
import { io } from "socket.io-client";
import { API_BASE, SOCKET_URL, TENANT_ID } from "./lib/config";

import type { Agent, Event, InsightState, TraceGroup } from "./lib/types";
import { buildAppOptions } from "./lib/apps";
import { groupEventsIntoTraces } from "./lib/trace";
import { buildInitialMaps } from "./lib/uiState";

import { ApplicationsCard } from "./components/ApplicationsCard";
import { TypeFilterBar } from "./components/TypeFilterBar";
import { TraceList } from "./components/TraceList";
import { SearchBar } from "./components/SearchBar";
import { parseRateLimitHeaders } from "./lib/rateLimit";
import { authHeaders, demoHeaders, fetchDemoConfig } from "./lib/api";
import { DemoPage } from "./pages/DemoPage";
import { DemoModeToggle } from "./components/DemoModeToggle";
import { getDemoMode, getDemoAppNames } from "./lib/demoMode";

function Dashboard() {
  const [events, setEvents] = useState<Event[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [connected, setConnected] = useState(false);
  const [showDemoPage, setShowDemoPage] = useState(false);

  const [filter, setFilter] = useState<
    "all" | "express" | "mongoose" | "error"
  >("all");

  const [allAppsSelected, setAllAppsSelected] = useState(true);
  const [selectedApps, setSelectedApps] = useState<Set<string>>(new Set());

  const [openMap, setOpenMap] = useState<Record<string, boolean>>({});
  const [traceOpenMap, setTraceOpenMap] = useState<Record<string, boolean>>({});
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const [loadingHistory, setLoadingHistory] = useState(true);

  const [query, setQuery] = useState("");
  const [showSlowOnly, setShowSlowOnly] = useState(false);
  const [showErrorsOnly, setShowErrorsOnly] = useState(false);

  const [insightOpenMap, setInsightOpenMap] = useState<Record<string, boolean>>(
    {}
  );
  const [insightStateMap, setInsightStateMap] = useState<
    Record<string, InsightState>
  >({});

  // ----- Demo mode state -----
  const [demoModeEnabled, setDemoModeEnabled] = useState(getDemoMode());
  const [showDemoToggle, setShowDemoToggle] = useState(false);

  // ----- Fetch demo config to determine toggle visibility -----
  useEffect(() => {
    fetchDemoConfig()
      .then((config) => {
        // Show toggle based on server's demoModeEnabled flag
        // (which already accounts for AUTH_MODE and DEMO_MODE_TOKEN)
        setShowDemoToggle(config.demoModeEnabled);
      })
      .catch((err) => {
        console.error("[Dashboard] Failed to fetch demo config:", err);
      });
  }, []);

  // ----- Load persisted history + attach live socket -----
  useEffect(() => {
    let isMounted = true;

    (async () => {
      try {
        setLoadingHistory(true);
        const res = await fetch(`${API_BASE}/api/traces`, {
          headers: authHeaders()
        });
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

    const token = import.meta.env.VITE_DASHBOARD_API_KEY as string | undefined;

    const socket = io(SOCKET_URL, {
      transports: ["websocket", "polling"],
      auth: {
        token: token?.trim(),
        tenantId: TENANT_ID
      }
    });

    socket.on("connect", () => {
      setConnected(true);
      // Join tenant room on connect
      socket.emit("join_tenant", { tenantId: TENANT_ID });
    });
    socket.on("disconnect", () => setConnected(false));
    socket.on("agents", (agentList: Agent[]) => setAgents(agentList));

    socket.on("event", (event: Event) => {
      console.log("[socket event]", {
        app: event.appName,
        tenantId: (event as any).tenantId
      });

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

  // ----- Demo mode filtering -----
  const displayedEvents = useMemo(() => {
    if (!demoModeEnabled) {
      // Show only real events (not demo)
      return events.filter((e) => e.source !== "demo");
    }
    // Show only demo events
    return events.filter((e) => e.source === "demo");
  }, [events, demoModeEnabled]);

  const displayedAgents = useMemo(() => {
    if (!demoModeEnabled) {
      return agents;
    }
    // Show fake demo agents
    const demoApps = getDemoAppNames(TENANT_ID);
    return demoApps.map((appName) => ({
      appName,
      socketId: `demo-${appName}`
    }));
  }, [agents, demoModeEnabled]);

  // ----- App options -----
  const appOptions = useMemo(() => {
    const fromAgents = displayedAgents.map((a) => a.appName);
    const fromEvents = Array.from(
      new Set(displayedEvents.map((e) => e.appName))
    );
    return buildAppOptions(fromAgents, fromEvents);
  }, [displayedAgents, displayedEvents]);

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
    let out = displayedEvents;

    if (!allAppsSelected) {
      if (selectedApps.size === 0) return [];
      out = out.filter((e) => selectedApps.has(e.appName));
    }

    if (filter === "all") return out;
    if (filter === "error") return out.filter((e) => e.level === "error");
    return out.filter((e) => e.type === filter);
  }, [displayedEvents, filter, allAppsSelected, selectedApps]);

  // Calculate filter counts based on app-filtered events (before type filtering)
  const appFilteredEvents = useMemo(() => {
    let out = displayedEvents;
    if (!allAppsSelected) {
      if (selectedApps.size === 0) return [];
      out = out.filter((e) => selectedApps.has(e.appName));
    }
    return out;
  }, [displayedEvents, allAppsSelected, selectedApps]);

  const filterCounts = useMemo(() => {
    return {
      all: appFilteredEvents.length,
      express: appFilteredEvents.filter((e) => e.type === "express").length,
      mongoose: appFilteredEvents.filter((e) => e.type === "mongoose").length,
      error: appFilteredEvents.filter((e) => e.level === "error").length
    };
  }, [appFilteredEvents]);

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
    setTraceOpenMap((m) => {
      const next: Record<string, boolean> = {};
      for (const g of filteredTraceGroups) next[g.traceId] = false;
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
    if (!confirm("Clear all traces?")) return;
    try {
      // If demo mode is ON, clear demo data; otherwise clear real traces
      const endpoint = demoModeEnabled ? "/api/demo-seed" : "/api/traces";
      const headers = demoModeEnabled ? demoHeaders() : authHeaders();

      await fetch(`${API_BASE}${endpoint}`, {
        method: "DELETE",
        headers
      });

      // Filter out the cleared events
      if (demoModeEnabled) {
        setEvents((prev) => prev.filter((e) => e.source !== "demo"));
      } else {
        setEvents((prev) => prev.filter((e) => e.source === "demo"));
      }

      setOpenMap({});
      setTraceOpenMap({});
    } catch (err) {
      console.error("[Dashboard] clear traces failed", err);
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

  const toggleInsight = async (traceId: string) => {
    const willOpen = !(insightOpenMap[traceId] ?? false);
    setInsightOpenMap((m) => ({ ...m, [traceId]: willOpen }));
    if (!willOpen) return;

    if (insightStateMap[traceId]?.status === "ready") return;

    setInsightStateMap((m) => ({ ...m, [traceId]: { status: "loading" } }));

    let rl: ReturnType<typeof parseRateLimitHeaders> | undefined;

    try {
      const res = await fetch(
        `${API_BASE}/api/insights/${encodeURIComponent(traceId)}`,
        { headers: authHeaders() }
      );

      rl = parseRateLimitHeaders(res.headers);
      const json = await res.json().catch(() => ({}));

      if (res.status === 429) {
        const resetInSec =
          rl?.resetAt != null
            ? Math.max(0, Math.ceil((rl.resetAt - Date.now()) / 1000))
            : undefined;

        throw {
          __rateLimited: true,
          rateLimit: rl,
          resetInSec,
          message: json?.message ?? "Too many insight requests. Try again soon."
        };
      }

      if (!res.ok || !json?.ok) {
        if (json?.error === "INSIGHT_SAMPLED_OUT") {
          setInsightStateMap((m) => ({
            ...m,
            [traceId]: {
              status: "error",
              code: "INSIGHT_SAMPLED_OUT",
              error:
                json?.message ??
                "AI Insights were skipped for this trace (sampling). Click Regenerate to force.",
              rateLimit: rl
            }
          }));
          return;
        }

        throw {
          message: json?.message ?? "Failed to load insight",
          code: json?.error,
          rateLimit: rl
        };
      }

      setInsightStateMap((m) => ({
        ...m,
        [traceId]: {
          status: "ready",
          data: json.insight,
          meta: { cached: json.cached, computedAt: json.computedAt },
          rateLimit: rl
        }
      }));
    } catch (e: any) {
      setInsightStateMap((m) => ({
        ...m,
        [traceId]: {
          status: "error",
          code: e?.code,
          error:
            e?.__rateLimited && e?.resetInSec != null
              ? `Rate limited. Try again in ${e.resetInSec}s.`
              : (e?.message ?? "Request failed"),
          rateLimit: e?.rateLimit ?? rl
        }
      }));
    }
  };

  const regenerateInsight = async (traceId: string) => {
    setInsightOpenMap((m) => ({ ...m, [traceId]: true }));
    setInsightStateMap((m) => ({ ...m, [traceId]: { status: "loading" } }));

    let rl: ReturnType<typeof parseRateLimitHeaders> | undefined;

    try {
      const res = await fetch(
        `${API_BASE}/api/insights/${encodeURIComponent(traceId)}/regenerate`,
        { method: "POST", headers: authHeaders() }
      );

      rl = parseRateLimitHeaders(res.headers);
      const json = await res.json().catch(() => ({}));

      if (res.status === 429) {
        const resetInSec =
          rl?.resetAt != null
            ? Math.max(0, Math.ceil((rl.resetAt - Date.now()) / 1000))
            : undefined;

        throw {
          __rateLimited: true,
          rateLimit: rl,
          resetInSec,
          message:
            json?.message ?? "Too many regenerate requests. Try again soon."
        };
      }

      if (!res.ok || !json?.ok || !json?.insight) {
        throw {
          message: json?.message ?? "Failed to regenerate insight",
          code: json?.error,
          rateLimit: rl
        };
      }

      setInsightStateMap((m) => ({
        ...m,
        [traceId]: {
          status: "ready",
          data: json.insight,
          meta: { cached: json.cached, computedAt: json.computedAt },
          rateLimit: rl
        }
      }));
    } catch (e: any) {
      setInsightStateMap((m) => ({
        ...m,
        [traceId]: {
          status: "error",
          code: e?.code,
          error:
            e?.__rateLimited && e?.resetInSec != null
              ? `Rate limited. Try again in ${e.resetInSec}s.`
              : (e?.message ?? "Request failed"),
          rateLimit: e?.rateLimit ?? rl
        }
      }));
    }
  };

  if (showDemoPage) {
    return (
      <DemoPage
        onDemoComplete={(events, openMap, traceOpenMap) => {
          setEvents(events);
          setOpenMap(openMap);
          setTraceOpenMap(traceOpenMap);
          setShowDemoPage(false);
        }}
        onNavigateBack={() => setShowDemoPage(false)}
      />
    );
  }

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
                Real-time monitoring for MERn applications
              </p>
            </div>

            <div className="flex items-center gap-4">
              {showDemoToggle && (
                <DemoModeToggle
                  onToggle={async (enabled) => {
                    setDemoModeEnabled(enabled);
                    // Refresh traces after toggle
                    try {
                      const res = await fetch(`${API_BASE}/api/traces`, {
                        headers: authHeaders()
                      });
                      const data: Event[] = await res.json();
                      const ordered = [...data].sort((a, b) => a.ts - b.ts);
                      setEvents(ordered);
                      const { open, traceOpen } = buildInitialMaps(ordered);
                      setOpenMap(open);
                      setTraceOpenMap(traceOpen);
                    } catch (err) {
                      console.error(
                        "[Dashboard] failed to refresh traces",
                        err
                      );
                    }
                  }}
                  disabled={!connected}
                />
              )}
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
                {demoModeEnabled
                  ? "2 agents"
                  : `${displayedAgents.length} agent${displayedAgents.length !== 1 ? "s" : ""}`}
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
          onClear={clearAll}
          filterCounts={filterCounts}
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
          toggleInsight={toggleInsight}
          insightStateMap={insightStateMap}
          insightOpenMap={insightOpenMap}
          setInsightOpenMap={setInsightOpenMap}
          onRegenerateInsight={regenerateInsight}
        />
      </main>
    </div>
  );
}

export default function App() {
  return <Dashboard />;
}
