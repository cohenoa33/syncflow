export type ApiErrorCode =
  | "AI_RATE_LIMITED"
  | "AI_TIMEOUT"
  | "AI_UNAVAILABLE"
  | "AI_INVALID_RESPONSE"
  | "TRACE_NOT_FOUND"
  | "INTERNAL_ERROR"
  | "INSIGHT_SAMPLED_OUT"
  | "AI_DISABLED";

export function apiError(
  code: ApiErrorCode,
  message: string,
  opts?: {
    retryAfterMs?: number;
    status?: number;
  }
) {
  return {
    status: opts?.status ?? 500,
    body: {
      ok: false,
      error: code,
      message,
      ...(opts?.retryAfterMs ? { retryAfterMs: opts.retryAfterMs } : {})
    }
  };
}
