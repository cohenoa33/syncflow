import type { ReactNode } from "react";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import type { MetricsData, MetricsWindow } from "../lib/types";

type Props = {
  data: MetricsData | null;
  loading: boolean;
  error: string | null;
  window: MetricsWindow;
  onWindowChange: (w: MetricsWindow) => void;
};

function formatTick(ts: number, window: MetricsWindow): string {
  if (window === "7d") {
    return new Intl.DateTimeFormat(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(new Date(ts));
  }
  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(ts));
}

export function MetricsDashboard({ data, loading, error, window, onWindowChange }: Props) {
  const summary = data?.summary;
  const buckets = data?.buckets ?? [];

  const chartData = buckets.map((b) => ({
    label: formatTick(b.ts, window),
    total: b.total,
    errorRatePct: parseFloat((b.errorRate * 100).toFixed(2)),
    p50: b.p50,
    p95: b.p95,
  }));

  return (
    <div className="space-y-6">
      {/* Window selector */}
      <div className="bg-white rounded-lg shadow mb-6 p-4">
        <div className="flex gap-2">
          {(["1h", "24h", "7d"] as MetricsWindow[]).map((w) => (
            <button
              key={w}
              onClick={() => onWindowChange(w)}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                window === w
                  ? "bg-indigo-600 text-white"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
            >
              {w}
            </button>
          ))}
        </div>
      </div>

      {/* Summary cards */}
      {summary && !loading && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <SummaryCard label="Total Requests" value={summary.totalRequests.toLocaleString()} />
          <SummaryCard
            label="Error Rate"
            value={`${(summary.errorRate * 100).toFixed(1)}%`}
            warn={summary.errorRate * 100 > 5}
            warnColor="text-red-600"
          />
          <SummaryCard
            label="p95 Latency"
            value={summary.p95Latency != null ? `${summary.p95Latency}ms` : "—"}
            warn={summary.p95Latency != null && summary.p95Latency > 500}
            warnColor="text-amber-600"
          />
          <SummaryCard
            label="Slow Rate"
            value={`${(summary.slowRate * 100).toFixed(1)}%`}
            warn={summary.slowRate * 100 > 10}
            warnColor="text-amber-600"
          />
        </div>
      )}

      {loading ? (
        <div className="bg-white rounded-lg shadow p-12 flex items-center justify-center">
          <div className="flex flex-col items-center gap-3 text-gray-400">
            <div className="w-8 h-8 border-4 border-gray-200 border-t-indigo-500 rounded-full animate-spin" />
            <span className="text-sm">Loading metrics...</span>
          </div>
        </div>
      ) : error ? (
        <div className="bg-white rounded-lg shadow p-8 text-center text-red-600 text-sm">
          {error}
        </div>
      ) : !data || buckets.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-12 text-center text-gray-400 text-sm">
          No request data for this window.
        </div>
      ) : (
        <div className="space-y-6">
          <ChartCard title="Request Volume">
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="total" fill="#6366f1" name="Requests" />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="Error Rate (%)">
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} domain={[0, "auto"]} />
                <Tooltip formatter={(v: number) => [`${v}%`, "Error %"]} />
                <ReferenceLine y={5} stroke="#f87171" strokeDasharray="4 4" />
                <Line
                  type="monotone"
                  dataKey="errorRatePct"
                  stroke="#ef4444"
                  dot={{ r: 3 }}
                  name="Error %"
                  connectNulls={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="Latency (ms)">
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v: number) => [`${v}ms`]} />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="p50"
                  stroke="#6366f1"
                  dot={{ r: 3 }}
                  name="p50"
                  connectNulls={false}
                />
                <Line
                  type="monotone"
                  dataKey="p95"
                  stroke="#f97316"
                  dot={{ r: 3 }}
                  name="p95"
                  connectNulls={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>
      )}
    </div>
  );
}

function SummaryCard({
  label,
  value,
  warn = false,
  warnColor = "text-amber-600",
}: {
  label: string;
  value: string;
  warn?: boolean;
  warnColor?: string;
}) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <div className="text-xs text-gray-500 mb-1">{label}</div>
      <div className={`text-2xl font-semibold ${warn ? warnColor : "text-gray-900"}`}>
        {value}
      </div>
    </div>
  );
}

function ChartCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="bg-white rounded-lg shadow p-4">
      <div className="text-sm font-medium text-gray-700 mb-3">{title}</div>
      {children}
    </div>
  );
}
