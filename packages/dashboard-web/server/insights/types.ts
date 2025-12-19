
export type Insight = {
  traceId: string;
  appName?: string;
  headerOp?: string;
  summary: string;
  severity: "info" | "warn" | "error";
  rootCause?: string;
  suggestions?: string[];
  signals?: Array<{
    kind: "error" | "slow" | "status" | "db" | "pattern";
    message: string;
  }>;

  source?: "ai" | "heuristic";
};

export type TraceEvent = {
  id: string;
  traceId?: string;
  appName: string;
  type: "express" | "mongoose" | "error";
  operation: string;
  ts: number;
  durationMs?: number;
  level: "info" | "warn" | "error";
  payload: Record<string, any>;
};
