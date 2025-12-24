export function shouldSampleInsight(input: {
  traceId: string;
  hasError?: boolean;
  statusCode?: number;
}): { ok: true } | { ok: false; reason: string } {
  const sampleRate = Number(process.env.AI_INSIGHT_SAMPLE_RATE ?? 1);
  const errorsOnly = process.env.AI_INSIGHT_SAMPLE_ERRORS_ONLY === "true";

  if (!Number.isFinite(sampleRate) || sampleRate <= 0) {
    return { ok: false, reason: "sampling_disabled" };
  }

  if (errorsOnly) {
    const isError =
      input.hasError === true ||
      (input.statusCode != null && input.statusCode >= 400);
    if (!isError) return { ok: false, reason: "not_error_trace" };
  }

  if (sampleRate >= 1) return { ok: true };

  // deterministic sampling by traceId (stable behavior across refreshes)
  const h = hashToUnitFloat(input.traceId);
  if (h < sampleRate) return { ok: true };
  return { ok: false, reason: "sampled_out" };
}

function hashToUnitFloat(s: string): number {
  // cheap deterministic hash -> [0,1)
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  // unsigned -> [0, 1)
  return (h >>> 0) / 2 ** 32;
}
