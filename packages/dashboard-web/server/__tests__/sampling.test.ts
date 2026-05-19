import { describe, it, expect, afterEach } from "vitest";
import { shouldSampleInsight } from "../ai/sampling";

afterEach(() => {
  delete process.env.AI_INSIGHT_SAMPLE_RATE;
  delete process.env.AI_INSIGHT_SAMPLE_ERRORS_ONLY;
});

describe("shouldSampleInsight", () => {
  it("returns ok:true when sampleRate=1 (default)", () => {
    const result = shouldSampleInsight({ traceId: "trace-1" });
    expect(result.ok).toBe(true);
  });

  it("returns ok:false when sampleRate=0", () => {
    process.env.AI_INSIGHT_SAMPLE_RATE = "0";
    const result = shouldSampleInsight({ traceId: "trace-1" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("sampling_disabled");
  });

  it("returns ok:false when sampleRate is NaN (non-numeric string)", () => {
    process.env.AI_INSIGHT_SAMPLE_RATE = "not-a-number";
    const result = shouldSampleInsight({ traceId: "trace-1" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("sampling_disabled");
  });

  it("returns ok:false when sampleRate is negative", () => {
    process.env.AI_INSIGHT_SAMPLE_RATE = "-0.5";
    const result = shouldSampleInsight({ traceId: "trace-1" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("sampling_disabled");
  });

  it("returns ok:true when sampleRate > 1 (never sampled out)", () => {
    process.env.AI_INSIGHT_SAMPLE_RATE = "2";
    const result = shouldSampleInsight({ traceId: "any-trace" });
    expect(result.ok).toBe(true);
  });

  it("returns ok:false when errorsOnly=true and hasError=false", () => {
    process.env.AI_INSIGHT_SAMPLE_ERRORS_ONLY = "true";
    const result = shouldSampleInsight({ traceId: "trace-1", hasError: false });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("not_error_trace");
  });

  it("returns ok:true when errorsOnly=true and hasError=true", () => {
    process.env.AI_INSIGHT_SAMPLE_ERRORS_ONLY = "true";
    const result = shouldSampleInsight({ traceId: "trace-1", hasError: true });
    expect(result.ok).toBe(true);
  });

  it("returns ok:true when errorsOnly=true and statusCode=500", () => {
    process.env.AI_INSIGHT_SAMPLE_ERRORS_ONLY = "true";
    const result = shouldSampleInsight({ traceId: "trace-1", statusCode: 500 });
    expect(result.ok).toBe(true);
  });

  it("returns ok:true when errorsOnly=true and statusCode=400 (boundary: >= 400 is error)", () => {
    process.env.AI_INSIGHT_SAMPLE_ERRORS_ONLY = "true";
    const result = shouldSampleInsight({ traceId: "trace-1", statusCode: 400 });
    expect(result.ok).toBe(true);
  });

  it("returns ok:false when errorsOnly=true and statusCode=399 (boundary: < 400 is not error)", () => {
    process.env.AI_INSIGHT_SAMPLE_ERRORS_ONLY = "true";
    const result = shouldSampleInsight({ traceId: "trace-1", statusCode: 399 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("not_error_trace");
  });

  it("errorsOnly flag only triggers when value is exactly 'true'", () => {
    process.env.AI_INSIGHT_SAMPLE_ERRORS_ONLY = "1";
    const result = shouldSampleInsight({ traceId: "trace-1", hasError: false });
    // "1" !== "true" → errorsOnly is false → sampling proceeds normally
    expect(result.ok).toBe(true);
  });

  it("is deterministic: same traceId always produces the same result", () => {
    process.env.AI_INSIGHT_SAMPLE_RATE = "0.5";
    const traceId = "deterministic-trace-abc-xyz";
    const r1 = shouldSampleInsight({ traceId });
    const r2 = shouldSampleInsight({ traceId });
    const r3 = shouldSampleInsight({ traceId });
    expect(r1.ok).toBe(r2.ok);
    expect(r2.ok).toBe(r3.ok);
  });

  it("sampleRate=0.5: roughly half of a large set of distinct traceIds pass", () => {
    process.env.AI_INSIGHT_SAMPLE_RATE = "0.5";
    const N = 1000;
    let passed = 0;
    for (let i = 0; i < N; i++) {
      const result = shouldSampleInsight({ traceId: `trace-${i}` });
      if (result.ok) passed++;
    }
    expect(passed).toBeGreaterThan(N * 0.4);
    expect(passed).toBeLessThan(N * 0.6);
  });

  it("different traceIds with same sampleRate can produce different outcomes", () => {
    process.env.AI_INSIGHT_SAMPLE_RATE = "0.5";
    const results = new Set<boolean>();
    for (let i = 0; i < 50; i++) {
      results.add(shouldSampleInsight({ traceId: `unique-${i}-${Math.random()}` }).ok);
    }
    // With 50 distinct random IDs and 50% rate, both true and false must appear
    expect(results.has(true)).toBe(true);
    expect(results.has(false)).toBe(true);
  });
});
