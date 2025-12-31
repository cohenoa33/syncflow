export interface Event {
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
};
export type RateLimitMeta = {
  remaining?: number;
  resetAt?: number;
};

export type InsightState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; error: string; code?: string; rateLimit?: RateLimitMeta }
  | {
      status: "ready";
      data: any;
      meta?: { cached?: boolean; computedAt?: number };
      rateLimit?: RateLimitMeta;
    };