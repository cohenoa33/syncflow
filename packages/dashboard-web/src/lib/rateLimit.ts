export function parseRateLimitHeaders(headers: Headers): {
  remaining?: number;
  resetAt?: number; // epoch ms
} {
  const remainingRaw = headers.get("X-RateLimit-Remaining");
  const resetRaw = headers.get("X-RateLimit-Reset");

  const remaining =
    remainingRaw != null && remainingRaw !== ""
      ? Number(remainingRaw)
      : undefined;

  // server sends resetAt as epoch ms (String(rl.resetAt))
  const resetAt =
    resetRaw != null && resetRaw !== "" ? Number(resetRaw) : undefined;

  return {
    remaining: Number.isFinite(remaining) ? remaining : undefined,
    resetAt: Number.isFinite(resetAt) ? resetAt : undefined
  };
}
