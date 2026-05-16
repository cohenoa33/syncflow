export interface Event {
  id: string;
  appName: string;
  type: "express" | "mongoose" | "error";
  operation: string;
  ts: number;
  durationMs?: number;
  traceId?: string;
  parentApp?: string;
  level: "info" | "warn" | "error";
  payload: Record<string, any>;
  receivedAt?: number;
  source?: "demo"; // "demo" for demo-seeded events, undefined for real
}

export interface Agent {
  appName: string;
  socketId: string;
}

export type TraceGroup = {
  traceId: string;
  displayTraceId?: string;
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
  isDistributed?: boolean;
};
export type MetricsWindow = "1h" | "24h" | "7d";

export type MetricsBucket = {
  ts: number;
  total: number;
  errors: number;
  errorRate: number;
  p50: number | null;
  p95: number | null;
  p99: number | null;
  slowCount: number;
};

export type MetricsSummary = {
  totalRequests: number;
  errorRate: number;
  p95Latency: number | null;
  slowRate: number;
};

export type MetricsData = {
  window: MetricsWindow;
  buckets: MetricsBucket[];
  summary: MetricsSummary;
  appName: string | null;
};

export type RateLimitMeta = {
  remaining?: number;
  resetAt?: number;
};

export type AlertMetric = "errorRate" | "p95Latency" | "slowRate" | "requestVolume";
export type AlertWindow = "1h" | "24h" | "7d";

export type AlertRule = {
  _id: string;
  tenantId: string;
  name: string;
  metric: AlertMetric;
  threshold: number;
  window: AlertWindow;
  appName: string | null;
  enabled: boolean;
  cooldownMs: number;
  lastFiredAt?: number;
  createdAt: number;
};

export type AlertFire = {
  _id: string;
  ruleId: string;
  ruleName: string;
  metric: AlertMetric;
  value: number;
  threshold: number;
  window: AlertWindow;
  appName: string | null;
  firedAt: number;
};

export type InAppAlertNotification = {
  ruleId: string;
  ruleName: string;
  metric: AlertMetric;
  value: number;
  threshold: number;
  window: AlertWindow;
  appName: string | null;
  firedAt: number;
};

export type InsightState =
  | { status: "idle" }
  | { status: "loading" }
  | {
      status: "error";
      error: string;
      code?: string;
      statusCode?: number;
      rateLimit?: RateLimitMeta;
    }
  | {
      status: "ready";
      data: any;
      meta?: { cached?: boolean; computedAt?: number };
      rateLimit?: RateLimitMeta;
    };
