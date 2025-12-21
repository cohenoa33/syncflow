type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

function now() {
  return Date.now();
}

export function checkRateLimit(key: string) {
  const windowMs = Number(process.env.AI_RATE_LIMIT_WINDOW_MS || 60_000);
  const max = Number(process.env.AI_RATE_LIMIT_MAX || 20);

  const t = now();
  const cur = buckets.get(key); 

  if (!cur || t >= cur.resetAt) {
    const next = { count: 1, resetAt: t + windowMs };
    buckets.set(key, next);
    return { ok: true as const, remaining: max - 1, resetAt: next.resetAt };
  }

  if (cur.count >= max) {
    return { ok: false as const, remaining: 0, resetAt: cur.resetAt };
  }

  cur.count += 1;
  return {
    ok: true as const,
    remaining: max - cur.count,
    resetAt: cur.resetAt
  };
}

// optional: keep map from growing forever
setInterval(() => {
  const t = now();
  for (const [k, b] of Array.from(buckets)) if (t >= b.resetAt) buckets.delete(k);
}, 60_000).unref?.();
