import { useEffect, useState } from "react";
import type { AlertFire, AlertMetric, AlertRule } from "../lib/types";
import { API_BASE } from "../lib/config";
import { authHeaders } from "../lib/api";

type Props = {
  rules: AlertRule[];
  loading: boolean;
  alertFiredTrigger: number;
  onCreateRule: (rule: Omit<AlertRule, "_id" | "tenantId" | "createdAt" | "lastFiredAt">) => Promise<void>;
  onToggleRule: (id: string, enabled: boolean) => Promise<void>;
  onDeleteRule: (id: string) => Promise<void>;
};

const METRIC_LABELS: Record<AlertMetric, string> = {
  errorRate: "Error Rate (%)",
  p95Latency: "p95 Latency (ms)",
  slowRate: "Slow Rate (%)",
  requestVolume: "Request Volume",
};

function formatMetricValue(metric: AlertMetric, value: number): string {
  if (metric === "errorRate" || metric === "slowRate") return `${value.toFixed(1)}%`;
  if (metric === "p95Latency") return `${value.toFixed(0)}ms`;
  return String(value);
}

function formatThreshold(metric: AlertMetric, threshold: number): string {
  if (metric === "errorRate" || metric === "slowRate") return `${threshold}%`;
  if (metric === "p95Latency") return `${threshold}ms`;
  return String(threshold);
}

function formatCooldown(ms: number): string {
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  if (h > 0 && m === 0) return `${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function formatFiredAt(ts: number): string {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(ts));
}

const EMPTY_FORM = {
  name: "",
  metric: "errorRate" as AlertMetric,
  threshold: "",
  window: "1h" as "1h" | "24h" | "7d",
  appName: "",
  cooldownMinutes: "60",
  enabled: true,
};

const PAGE_SIZE = 25;

export function AlertsPanel({ rules, loading, alertFiredTrigger, onCreateRule, onToggleRule, onDeleteRule }: Props) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  // History state
  const [historyItems, setHistoryItems] = useState<AlertFire[]>([]);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [historyPage, setHistoryPage] = useState(0);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [metricFilter, setMetricFilter] = useState<AlertMetric | "">("");
  const [nameFilter, setNameFilter] = useState("");
  const [debouncedName, setDebouncedName] = useState("");

  useEffect(() => {
    if (!confirmDelete) return;
    const handler = () => setConfirmDelete(null);
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [confirmDelete]);

  // Debounce name filter
  useEffect(() => {
    const t = setTimeout(() => setDebouncedName(nameFilter), 250);
    return () => clearTimeout(t);
  }, [nameFilter]);

  // Reset to page 0 when filters or a new alert fire changes
  useEffect(() => {
    setHistoryPage(0);
  }, [metricFilter, debouncedName, alertFiredTrigger]);

  // Fetch history
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setHistoryLoading(true);
      try {
        const params = new URLSearchParams({
          page: String(historyPage),
          pageSize: String(PAGE_SIZE),
        });
        if (metricFilter) params.set("metric", metricFilter);
        if (debouncedName.trim()) params.set("q", debouncedName.trim());

        const res = await fetch(`${API_BASE}/api/alerts/history?${params}`, {
          headers: authHeaders(),
        });
        const json = await res.json().catch(() => ({}));
        if (!cancelled && res.ok) {
          setHistoryItems(json.history ?? []);
          setHistoryTotal(json.total ?? 0);
        }
      } catch {
        // silent — history section shows empty state
      } finally {
        if (!cancelled) setHistoryLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [historyPage, metricFilter, debouncedName, alertFiredTrigger]);

  const totalPages = Math.max(1, Math.ceil(historyTotal / PAGE_SIZE));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    const threshold = parseFloat(form.threshold);
    if (!form.name.trim()) return setFormError("Name is required.");
    if (isNaN(threshold) || threshold < 0) return setFormError("Threshold must be 0 or greater.");
    const cooldownMs = Math.max(1, parseInt(form.cooldownMinutes || "60", 10)) * 60_000;

    try {
      setSubmitting(true);
      await onCreateRule({
        name: form.name.trim(),
        metric: form.metric,
        threshold,
        window: form.window,
        appName: form.appName.trim() || null,
        enabled: true,
        cooldownMs,
      });
      setForm(EMPTY_FORM);
    } catch {
      setFormError("Failed to create rule. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Active Rules */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-800">Alert Rules</h2>
        </div>

        {loading ? (
          <div className="px-5 py-6 text-sm text-gray-400">Loading rules…</div>
        ) : rules.length === 0 ? (
          <div className="px-5 py-6 text-sm text-gray-400">No alert rules yet. Create one below.</div>
        ) : (
          <ul className="divide-y divide-gray-100">
            {rules.map((rule) => (
              <li key={rule._id} className="px-5 py-4 flex items-start gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-gray-900 text-sm">{rule.name}</span>
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-indigo-50 text-indigo-700">
                      {rule.window}
                    </span>
                    {rule.appName && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-600">
                        {rule.appName}
                      </span>
                    )}
                    {!rule.appName && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-500">
                        all apps
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-xs text-gray-500">
                    {METRIC_LABELS[rule.metric].toLowerCase()} &gt; {formatThreshold(rule.metric, rule.threshold)}
                    {" · "}cooldown: {formatCooldown(rule.cooldownMs)}
                  </p>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  {confirmDelete === rule._id ? (
                    <div className="flex items-center gap-2" onMouseDown={(e) => e.stopPropagation()}>
                      <span className="text-xs text-gray-500">Delete?</span>
                      <button
                        onClick={() => setConfirmDelete(null)}
                        className="px-2 py-1 rounded text-xs font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => { onDeleteRule(rule._id); setConfirmDelete(null); }}
                        className="px-2 py-1 rounded text-xs font-medium text-white bg-red-500 hover:bg-red-600 transition-colors"
                      >
                        Delete
                      </button>
                    </div>
                  ) : (
                    <>
                      <button
                        onClick={() => onToggleRule(rule._id, !rule.enabled)}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 ${
                          rule.enabled ? "bg-indigo-600" : "bg-gray-200"
                        }`}
                        role="switch"
                        aria-checked={rule.enabled}
                        title={rule.enabled ? "Disable rule" : "Enable rule"}
                      >
                        <span
                          className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                            rule.enabled ? "translate-x-6" : "translate-x-1"
                          }`}
                        />
                      </button>

                      <button
                        onClick={() => setConfirmDelete(rule._id)}
                        className="p-1 text-gray-400 hover:text-red-500 transition-colors"
                        title="Delete rule"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                        </svg>
                      </button>
                    </>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Create Rule Form */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-800">Add Alert Rule</h2>
        </div>
        <form onSubmit={handleSubmit} className="px-5 py-4 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Name</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="e.g. High error rate"
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Metric</label>
              <select
                value={form.metric}
                onChange={(e) => setForm((f) => ({ ...f, metric: e.target.value as AlertMetric }))}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent"
              >
                <option value="errorRate">Error Rate (%)</option>
                <option value="p95Latency">p95 Latency (ms)</option>
                <option value="slowRate">Slow Rate (%)</option>
                <option value="requestVolume">Request Volume</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Threshold</label>
              <input
                type="number"
                min="0"
                step="any"
                value={form.threshold}
                onChange={(e) => setForm((f) => ({ ...f, threshold: e.target.value }))}
                placeholder="e.g. 10"
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Window</label>
              <select
                value={form.window}
                onChange={(e) => setForm((f) => ({ ...f, window: e.target.value as "1h" | "24h" | "7d" }))}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent"
              >
                <option value="1h">1h</option>
                <option value="24h">24h</option>
                <option value="7d">7d</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">App name (optional)</label>
              <input
                type="text"
                value={form.appName}
                onChange={(e) => setForm((f) => ({ ...f, appName: e.target.value }))}
                placeholder="all apps"
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Cooldown (minutes)</label>
              <input
                type="number"
                min="1"
                step="1"
                value={form.cooldownMinutes}
                onChange={(e) => setForm((f) => ({ ...f, cooldownMinutes: e.target.value }))}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent"
              />
            </div>
          </div>

          {formError && (
            <p className="text-xs text-red-600">{formError}</p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors"
          >
            {submitting ? "Adding…" : "Add Rule"}
          </button>
        </form>
      </div>

      {/* Alert History */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between gap-4 flex-wrap">
          <h2 className="text-base font-semibold text-gray-800">Alert History</h2>
          <div className="flex items-center gap-2 flex-wrap">
            <input
              type="text"
              value={nameFilter}
              onChange={(e) => setNameFilter(e.target.value)}
              placeholder="Filter by name…"
              className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-400 w-40"
            />
            <select
              value={metricFilter}
              onChange={(e) => {
                setMetricFilter(e.target.value as AlertMetric | "");
                setHistoryPage(0);
              }}
              className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-indigo-400"
            >
              <option value="">All metrics</option>
              <option value="errorRate">Error Rate</option>
              <option value="p95Latency">p95 Latency</option>
              <option value="slowRate">Slow Rate</option>
              <option value="requestVolume">Request Volume</option>
            </select>
            {(nameFilter || metricFilter) && (
              <button
                onClick={() => { setNameFilter(""); setMetricFilter(""); setHistoryPage(0); }}
                className="text-xs text-gray-500 hover:text-gray-700 transition-colors"
              >
                Clear
              </button>
            )}
          </div>
        </div>

        {historyLoading ? (
          <div className="px-5 py-6 text-sm text-gray-400">Loading history…</div>
        ) : historyItems.length === 0 ? (
          <div className="px-5 py-6 text-sm text-gray-400">
            {nameFilter || metricFilter ? "No alerts match your filters." : "No alerts have fired yet."}
          </div>
        ) : (
          <ul className="divide-y divide-gray-100">
            {historyItems.map((fire) => (
              <li key={fire._id} className="px-5 py-3 flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-gray-800 text-sm">{fire.ruleName}</span>
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-indigo-50 text-indigo-700">
                      {fire.window}
                    </span>
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-600">
                      {METRIC_LABELS[fire.metric]}
                    </span>
                    {fire.appName && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-600">
                        {fire.appName}
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-xs text-gray-500">
                    {METRIC_LABELS[fire.metric].toLowerCase()} was {formatMetricValue(fire.metric, fire.value)}
                    {" "}(threshold: {formatThreshold(fire.metric, fire.threshold)})
                  </p>
                </div>
                <span className="text-xs text-gray-400 shrink-0">{formatFiredAt(fire.firedAt)}</span>
              </li>
            ))}
          </ul>
        )}

        {/* Pagination */}
        {historyTotal > 0 && (
          <div className="px-5 py-3 border-t border-gray-100 flex items-center justify-between gap-4">
            <span className="text-xs text-gray-500">{historyTotal} total</span>
            <div className="flex items-center gap-3">
              <button
                disabled={historyPage === 0}
                onClick={() => setHistoryPage((p) => p - 1)}
                className="px-3 py-1 rounded-lg border border-gray-200 text-xs text-gray-600 disabled:opacity-40 hover:bg-gray-50 transition-colors"
              >
                ← Previous
              </button>
              <span className="text-xs text-gray-500">
                Page {historyPage + 1} of {totalPages}
              </span>
              <button
                disabled={historyPage >= totalPages - 1}
                onClick={() => setHistoryPage((p) => p + 1)}
                className="px-3 py-1 rounded-lg border border-gray-200 text-xs text-gray-600 disabled:opacity-40 hover:bg-gray-50 transition-colors"
              >
                Next →
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
