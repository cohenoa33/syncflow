import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { io } from "socket.io-client";
import { API_BASE, SOCKET_URL, TENANT_ID } from "./lib/config";

import type { Agent, Event, InsightState, TraceGroup } from "./lib/types";
import { buildAppOptions } from "./lib/apps";
import { groupEventsIntoTraces, buildTraceGroup } from "./lib/trace";
import { buildInitialMaps } from "./lib/uiState";

import { ApplicationsCard } from "./components/ApplicationsCard";
import { TypeFilterBar } from "./components/TypeFilterBar";
import { TraceList } from "./components/TraceList";
import { SearchBar } from "./components/SearchBar";
import { PaginationBar } from "./components/PaginationBar";
import { parseRateLimitHeaders } from "./lib/rateLimit";
import { authHeaders, demoHeaders, fetchDemoConfig } from "./lib/api";
import { DemoPage } from "./pages/DemoPage";
import { DemoModeToggle } from "./components/DemoModeToggle";
import { getDemoMode, getDemoAppNames } from "./lib/demoMode";
import { seedDemoData } from "./lib/seedDemoData";

type KnownGroupTypes = { hasExpress: boolean; hasMongoose: boolean; hasError: boolean };

function Dashboard() {
  const [events, setEvents] = useState<Event[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [connected, setConnected] = useState(false);
  const [showDemoPage, setShowDemoPage] = useState(false);
  const [demoOnly, setDemoOnly] = useState(false);

  const [filter, setFilter] = useState<
    "all" | "express" | "mongoose" | "error"
  >("all");

  const [allAppsSelected, setAllAppsSelected] = useState(true);
  const [selectedApps, setSelectedApps] = useState<Set<string>>(new Set());

  const [openMap, setOpenMap] = useState<Record<string, boolean>>({});
  const [traceOpenMap, setTraceOpenMap] = useState<Record<string, boolean>>({});
  const traceOpenMapRef = useRef<Record<string, boolean>>({});
  traceOpenMapRef.current = traceOpenMap;
  const knownTypesRef = useRef<Map<string, KnownGroupTypes>>(new Map());
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const [loadingHistory, setLoadingHistory] = useState(true);
  const [traceLoadError, setTraceLoadError] = useState<{
    status: number;
    error?: string;
    message?: string;
  } | null>(null);

  const [actionError, setActionError] = useState<{
    status: number;
    error?: string;
    message?: string;
    context: "clearAll" | "demoToggle" | "other";
  } | null>(null);

  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [showSlowOnly, setShowSlowOnly] = useState(false);
  const [showErrorsOnly, setShowErrorsOnly] = useState(false);

  const [currentPage, setCurrentPage] = useState(0);
  const [pageSize, setPageSize] = useState(25);
  const [totalGroups, setTotalGroups] = useState(0);
  const [expressGroups, setExpressGroups] = useState(0);
  const [mongooseGroups, setMongooseGroups] = useState(0);
  const [errorGroups, setErrorGroups] = useState(0);

  const [insightOpenMap, setInsightOpenMap] = useState<Record<string, boolean>>(
    {}
  );
  const [insightStateMap, setInsightStateMap] = useState<
    Record<string, InsightState>
  >({});

  // ----- Demo mode state -----
  const [demoModeEnabled, setDemoModeEnabled] = useState(getDemoMode());
  const [showDemoToggle, setShowDemoToggle] = useState(false);
  const [requiresDemoToken, setRequiresDemoToken] = useState(false);
  const [hasTenantsConfig, setHasTenantsConfig] = useState(false);

  const actionTitle = useMemo(() => {
    if (!actionError) return "";
    if (actionError.context === "clearAll") return "Clear traces failed";
    if (actionError.context === "demoToggle") return "Demo action failed";
    return "Action failed";
  }, [actionError]);

  // ----- Debounce search query -----
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query), 150);
    return () => clearTimeout(t);
  }, [query]);

  // ----- Fetch demo config to determine toggle visibility -----
  useEffect(() => {
    fetchDemoConfig()
      .then((config) => {
        setDemoOnly(config.demoOnly || false);
        setShowDemoToggle(config.demoModeEnabled);
        setRequiresDemoToken(config.requiresDemoToken);
        setHasTenantsConfig(config.hasTenantsConfig);
      })
      .catch((err) => {
        console.error("[Dashboard] Failed to fetch demo config:", err);
      });
  }, []);

  useEffect(() => {
    if (demoOnly) {
      setDemoModeEnabled(true);
    }
  }, [demoOnly]);
  // ----- Reset to page 0 when search / slow / errorsOnly filters change -----
  const mountedRef = useRef(false);
  useEffect(() => {
    if (!mountedRef.current) { mountedRef.current = true; return; }
    setCurrentPage(0);
  }, [debouncedQuery, showSlowOnly, showErrorsOnly]);

  // ----- Fetch history (re-runs on page / pageSize / filter / search change) -----
  useEffect(() => {
    const controller = new AbortController();
    (async () => {
      try {
        setLoadingHistory(true);
        setTraceLoadError(null);

        const params = new URLSearchParams({
          page: String(currentPage),
          pageSize: String(pageSize),
          filter,
          ...(debouncedQuery ? { q: debouncedQuery } : {}),
          ...(showSlowOnly ? { slowOnly: "true" } : {}),
          ...(showErrorsOnly ? { errorsOnly: "true" } : {}),
        });
        const res = await fetch(
          `${API_BASE}/api/traces?${params}`,
          { headers: authHeaders(), signal: controller.signal }
        );
        const json = await res.json().catch(() => ({}));

        if (!res.ok) {
          setTraceLoadError({
            status: res.status,
            error: (json as any)?.error,
            message: (json as any)?.message
          });
          return;
        }

        const data: Event[] = Array.isArray(json.events) ? json.events : [];
        const ordered = [...data].sort((a, b) => a.ts - b.ts);

        setEvents(ordered);
        setTotalGroups(json.totalGroups ?? 0);
        setExpressGroups(json.expressGroups ?? 0);
        setMongooseGroups(json.mongooseGroups ?? 0);
        setErrorGroups(json.errorGroups ?? 0);

        // Build known-types map so the socket handler can correctly
        // detect when an incoming event introduces a new type to a group.
        const typesMap = new Map<string, KnownGroupTypes>();
        for (const e of ordered) {
          const k = e.traceId ?? `no-trace:${e.id}`;
          const prev = typesMap.get(k) ?? { hasExpress: false, hasMongoose: false, hasError: false };
          typesMap.set(k, {
            hasExpress: prev.hasExpress || e.type === "express",
            hasMongoose: prev.hasMongoose || e.type === "mongoose",
            hasError: prev.hasError || e.level === "error",
          });
        }
        knownTypesRef.current = typesMap;

        const { open, traceOpen } = buildInitialMaps(ordered);
        setOpenMap(open);
        setTraceOpenMap(traceOpen);
      } catch (err) {
        if ((err as any)?.name === "AbortError") return;
        console.error("[Dashboard] failed to load traces", err);
        setTraceLoadError({ status: 0, message: "Failed to load traces" });
      } finally {
        if (!controller.signal.aborted) setLoadingHistory(false);
      }
    })();
    return () => controller.abort();
  }, [currentPage, pageSize, filter, debouncedQuery, showSlowOnly, showErrorsOnly]);

  // ----- Live socket (runs once) -----
  useEffect(() => {
    const token = import.meta.env.VITE_DASHBOARD_API_KEY as string | undefined;

    const socket = io(SOCKET_URL, {
      transports: ["websocket", "polling"],
      auth: { kind: "ui", token: token?.trim(), tenantId: TENANT_ID }
    });

    socket.on("connect", () => {
      setConnected(true);
      socket.emit("join_tenant", {
        tenantId: TENANT_ID,
        token: (import.meta.env.VITE_DASHBOARD_API_KEY as string | undefined)?.trim()
      });
    });

    socket.on("disconnect", () => setConnected(false));
    socket.on("agents", (agentList: Agent[]) => setAgents(agentList));

    socket.on("event", (event: Event) => {
      const key = event.traceId ? event.traceId : `no-trace:${event.id}`;
      const isNewGroup = !(key in traceOpenMapRef.current);
      const known = knownTypesRef.current.get(key) ?? { hasExpress: false, hasMongoose: false, hasError: false };

      if (isNewGroup) setTotalGroups((n) => n + 1);
      if (event.type === "express" && !known.hasExpress) setExpressGroups((n) => n + 1);
      if (event.type === "mongoose" && !known.hasMongoose) setMongooseGroups((n) => n + 1);
      if (event.level === "error" && !known.hasError) setErrorGroups((n) => n + 1);

      knownTypesRef.current.set(key, {
        hasExpress: known.hasExpress || event.type === "express",
        hasMongoose: known.hasMongoose || event.type === "mongoose",
        hasError: known.hasError || event.level === "error",
      });

      setEvents((prev) => {
        if (prev.length < 1000) return [...prev, event];
        return [...prev.slice(1), event];
      });
      setOpenMap((m) => ({ ...m, [event.id]: false }));
      setTraceOpenMap((m) => (key in m ? m : { ...m, [key]: true }));
    });

    socket.on("eventHistory", (history: Event[]) => {
      // Emitted after a clear-all — reset to empty page 0
      const ordered = [...history].sort((a, b) => a.ts - b.ts);
      setEvents(ordered);
      setTotalGroups(0);
      setExpressGroups(0);
      setMongooseGroups(0);
      setErrorGroups(0);
      knownTypesRef.current = new Map();
      setCurrentPage(0);
      const { open, traceOpen } = buildInitialMaps(ordered);
      setOpenMap(open);
      setTraceOpenMap(traceOpen);
    });

    socket.on("auth_error", (e) => console.error("[socket auth_error]", e));

    return () => {
      socket.off("connect");
      socket.off("disconnect");
      socket.off("agents");
      socket.off("event");
      socket.off("eventHistory");
      socket.off("auth_error");
      socket.close();
    };
  }, []);

  // ----- Demo mode filtering -----
  const displayedEvents = useMemo(() => {
    if (!demoModeEnabled) return events.filter((e) => e.source !== "demo");
    return events.filter((e) => e.source === "demo");
  }, [events, demoModeEnabled]);

  const displayedAgents = useMemo(() => {
    if (!demoModeEnabled) return agents;
    if (!TENANT_ID) return [];
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
  const appFilteredEvents = useMemo(() => {
    if (allAppsSelected) return displayedEvents;
    if (selectedApps.size === 0) return [];
    return displayedEvents.filter((e) => selectedApps.has(e.appName));
  }, [displayedEvents, allAppsSelected, selectedApps]);

  const filteredEvents = useMemo(() => {
    if (filter === "all") return appFilteredEvents;
    if (filter === "error") return appFilteredEvents.filter((e) => e.level === "error");
    return appFilteredEvents.filter((e) => e.type === filter);
  }, [appFilteredEvents, filter]);

  const filterCounts = useMemo(
    () => ({ all: totalGroups, express: expressGroups, mongoose: mongooseGroups, error: errorGroups }),
    [totalGroups, expressGroups, mongooseGroups, errorGroups]
  );

  // Incremental grouping: on a simple single-event append reuse all unchanged
  // TraceGroup objects and only rebuild the affected one. Falls back to full
  // recompute when filters change or history is loaded.
  const prevFilteredRef = useRef<Event[]>([]);
  const prevGroupMapRef = useRef<Map<string, TraceGroup>>(new Map());

  const traceGroups: TraceGroup[] = useMemo(() => {
    const prev = prevFilteredRef.current;
    const curr = filteredEvents;

    const isSimpleAppend =
      curr.length === prev.length + 1 &&
      prev.length > 0 &&
      prev[prev.length - 1] === curr[curr.length - 2]; // last of prev = second-to-last of curr

    if (isSimpleAppend) {
      const newEvent = curr[curr.length - 1];
      const key = newEvent.traceId ? newEvent.traceId : `no-trace:${newEvent.id}`;
      const groupMap = new Map(prevGroupMapRef.current);
      const existing = groupMap.get(key);
      groupMap.set(key, buildTraceGroup(key, existing ? [...existing.events, newEvent] : [newEvent]));
      const result = Array.from(groupMap.values()).sort((a, b) => b.startedAt - a.startedAt);
      prevFilteredRef.current = curr;
      prevGroupMapRef.current = groupMap;
      return result;
    }

    // Full recompute (filter change, history load, clear, etc.)
    const result = groupEventsIntoTraces(curr);
    prevFilteredRef.current = curr;
    prevGroupMapRef.current = new Map(result.map((g) => [g.traceId, g]));
    return result;
  }, [filteredEvents]);

  // Pre-compute payload strings once per traceGroups change, not per keystroke
  const payloadSampleMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const g of traceGroups) {
      try {
        map[g.traceId] = g.events
          .slice(0, 4)
          .map((e) => JSON.stringify(e.payload ?? {}))
          .join(" ")
          .toLowerCase();
      } catch {
        map[g.traceId] = "";
      }
    }
    return map;
  }, [traceGroups]);

  const filteredTraceGroups = useMemo(() => {
    const q = debouncedQuery.trim().toLowerCase();

    return traceGroups.filter((g) => {
      if (showSlowOnly && !g.slow) return false;
      if (showErrorsOnly && !g.hasError) return false;

      if (!q) return true;

      if (g.headerOp.toLowerCase().includes(q)) return true;
      if (g.appName.toLowerCase().includes(q)) return true;
      if (g.events.some((e) => e.operation.toLowerCase().includes(q)))
        return true;
      if (payloadSampleMap[g.traceId]?.includes(q)) return true;

      return false;
    });
  }, [traceGroups, payloadSampleMap, debouncedQuery, showSlowOnly, showErrorsOnly]);

  // ----- Expand / collapse all payloads -----
  const expandAllPayloads = useCallback(() => {
    const nextOpen: Record<string, boolean> = {};
    const nextTraceOpen: Record<string, boolean> = {};
    for (const g of filteredTraceGroups) {
      nextTraceOpen[g.traceId] = true;
      for (const e of g.events) nextOpen[e.id] = true;
    }
    setOpenMap((m) => ({ ...m, ...nextOpen }));
    setTraceOpenMap((m) => ({ ...m, ...nextTraceOpen }));
  }, [filteredTraceGroups]);

  const collapseAllPayloads = useCallback(() => {
    const nextOpen: Record<string, boolean> = {};
    const nextTraceOpen: Record<string, boolean> = {};
    for (const g of filteredTraceGroups) {
      nextTraceOpen[g.traceId] = false;
      for (const e of g.events) nextOpen[e.id] = false;
    }
    setOpenMap((m) => ({ ...m, ...nextOpen }));
    setTraceOpenMap((m) => ({ ...m, ...nextTraceOpen }));
  }, [filteredTraceGroups]);

  const anyPayloadClosed = useMemo(
    () => filteredTraceGroups.some((g) => g.events.some((e) => !openMap[e.id])),
    [filteredTraceGroups, openMap]
  );

  // Keyboard shortcuts
  const onKeyDown = useCallback((ev: KeyboardEvent) => {
    const tag = (ev.target as HTMLElement)?.tagName?.toLowerCase();
    if (
      tag === "input" ||
      tag === "textarea" ||
      (ev.target as HTMLElement)?.isContentEditable
    ) {
      return;
    }

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
  }, [filteredEvents, anyPayloadClosed, expandAllPayloads, collapseAllPayloads]);

  useEffect(() => {
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onKeyDown]);

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
    const msg = demoModeEnabled ? "Replace & Generate" : "Clear";

    try {
      setActionError(null);
      const options = demoModeEnabled
        ? {
            endpoint: "/api/demo-seed",
            headers: demoHeaders({ requiresDemoToken, hasTenantsConfig })
          }
        : { endpoint: "/api/traces", headers: authHeaders() };

      const { headers, endpoint } = options;

      const res = await fetch(`${API_BASE}${endpoint}`, {
        method: "DELETE",
        headers
      });

      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        setActionError({
          status: res.status,
          error: (json as any)?.error,
          message:
            (json as any)?.message ?? `Failed to ${msg.toLowerCase()} traces`,
          context: "clearAll"
        });
        return;
      }

      if (demoModeEnabled) {

        const { ordered, initialOpen, initialTraceOpen } = await seedDemoData(
          TENANT_ID,
          requiresDemoToken,
          hasTenantsConfig
        );
        setEvents(ordered);
        setOpenMap(initialOpen);
        setTraceOpenMap(initialTraceOpen);
      } else {
        setEvents((prev) => prev.filter((e) => e.source === "demo"));
        setOpenMap({});
        setTraceOpenMap({});
      }
    } catch (err) {
      console.error("[Dashboard] clear traces failed", err);
      setActionError({
        status: 0,
        message: "Request failed",
        context: "clearAll"
      });
    }
  };

  const toggleTrace = useCallback((traceId: string) =>
    setTraceOpenMap((m) => ({ ...m, [traceId]: !m[traceId] })), []);

  const togglePayload = useCallback((id: string) =>
    setOpenMap((m) => ({ ...m, [id]: !m[id] })), []);

  const copyPayload = useCallback(async (event: Event) => {
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
  }, []);

  const toggleInsight = useCallback(async (traceId: string) => {
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

        throw Object.assign(
          new Error((json as any)?.message ?? "Too many insight requests. Try again soon."),
          { __rateLimited: true, rateLimit: rl, resetInSec, statusCode: res.status }
        );
      }

      if (!res.ok || !(json as any)?.ok) {
        if ((json as any)?.error === "INSIGHT_SAMPLED_OUT") {
          setInsightStateMap((m) => ({
            ...m,
            [traceId]: {
              status: "error",
              code: "INSIGHT_SAMPLED_OUT",
              statusCode: res.status,
              error:
                (json as any)?.message ??
                "AI Insights were skipped for this trace (sampling). Click Regenerate to force.",
              rateLimit: rl
            }
          }));
          return;
        }

        throw Object.assign(
          new Error((json as any)?.message ?? "Failed to load insight"),
          { code: (json as any)?.error, statusCode: res.status, rateLimit: rl }
        );
      }

      setInsightStateMap((m) => ({
        ...m,
        [traceId]: {
          status: "ready",
          data: (json as any).insight,
          meta: {
            cached: (json as any).cached,
            computedAt: (json as any).computedAt
          },
          rateLimit: rl
        }
      }));
    } catch (e: any) {
      setInsightStateMap((m) => ({
        ...m,
        [traceId]: {
          status: "error",
          code: e?.code,
          statusCode: e?.statusCode,
          error:
            e?.__rateLimited && e?.resetInSec != null
              ? `Rate limited. Try again in ${e.resetInSec}s.`
              : (e?.message ?? "Request failed"),
          rateLimit: e?.rateLimit ?? rl
        }
      }));
    }
  }, [insightStateMap]);

  const regenerateInsight = useCallback(async (traceId: string) => {
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
          statusCode: res.status,
          message:
            (json as any)?.message ??
            "Too many regenerate requests. Try again soon."
        };
      }

      if (!res.ok || !(json as any)?.ok || !(json as any)?.insight) {
        throw {
          message: (json as any)?.message ?? "Failed to regenerate insight",
          code: (json as any)?.error,
          statusCode: res.status,
          rateLimit: rl
        };
      }

      setInsightStateMap((m) => ({
        ...m,
        [traceId]: {
          status: "ready",
          data: (json as any).insight,
          meta: {
            cached: (json as any).cached,
            computedAt: (json as any).computedAt
          },
          rateLimit: rl
        }
      }));
    } catch (e: any) {
      setInsightStateMap((m) => ({
        ...m,
        [traceId]: {
          status: "error",
          code: e?.code,
          statusCode: e?.statusCode,
          error:
            e?.__rateLimited && e?.resetInSec != null
              ? `Rate limited. Try again in ${e.resetInSec}s.`
              : (e?.message ?? "Request failed"),
          rateLimit: e?.rateLimit ?? rl
        }
      }));
    }
  }, []);

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
        requiresDemoToken={requiresDemoToken}
        hasTenantsConfig={hasTenantsConfig}
      />
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
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
              {showDemoToggle && (
                <DemoModeToggle
                  onToggle={async (enabled) => {
                    setActionError(null);
                    setDemoModeEnabled(enabled);
                  }}
                  disabled={demoOnly || !connected}
                  requiresDemoToken={requiresDemoToken}
                  hasTenantsConfig={hasTenantsConfig}
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
                  : `${displayedAgents.length} agent${
                      displayedAgents.length !== 1 ? "s" : ""
                    }`}
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
          setFilter={(f) => { setFilter(f); setCurrentPage(0); }}
          onClear={clearAll}
          filterCounts={filterCounts}
          demoMode={demoModeEnabled}
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
        />

        <PaginationBar
          currentPage={currentPage}
          totalGroups={filterCounts[filter]}
          pageSize={pageSize}
          pageSizeOptions={[25, 50, 100, 200]}
          onPageChange={setCurrentPage}
          onPageSizeChange={(size) => { setPageSize(size); setCurrentPage(0); }}
        />

        {actionError && (
          <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="font-semibold">
                  {actionTitle} (HTTP {actionError.status || "0"})
                </div>

                <div className="text-xs text-rose-700 mt-1">
                  {actionError.error ? `${actionError.error}: ` : ""}
                  {actionError.message ?? "Request failed"}
                </div>

                {(actionError.status === 400 || actionError.status === 401) && (
                  <div className="text-xs text-rose-700 mt-1">
                    Check tenant id and dashboard key / demo token.
                  </div>
                )}
              </div>

              <button
                type="button"
                onClick={() => setActionError(null)}
                className="text-xs text-rose-700 hover:text-rose-900"
                aria-label="Dismiss action error"
                title="Dismiss"
              >
                ✕
              </button>
            </div>
          </div>
        )}

        <TraceList
          loading={loadingHistory}
          error={traceLoadError}
          filteredTraceGroups={filteredTraceGroups}
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
