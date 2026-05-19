import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { checkRateLimit } from "../ai/rateLimit";

describe("checkRateLimit", () => {
  let keyPrefix: string;

  beforeEach(() => {
    // Each test gets a unique key prefix to avoid module-level bucket state leakage
    keyPrefix = `test-${Math.random().toString(36).slice(2)}-`;
    delete process.env.AI_RATE_LIMIT_WINDOW_MS;
    delete process.env.AI_RATE_LIMIT_MAX;
  });

  afterEach(() => {
    vi.useRealTimers();
    delete process.env.AI_RATE_LIMIT_WINDOW_MS;
    delete process.env.AI_RATE_LIMIT_MAX;
  });

  it("first call returns ok:true with remaining = max-1", () => {
    process.env.AI_RATE_LIMIT_MAX = "5";
    const result = checkRateLimit(`${keyPrefix}a`);
    expect(result.ok).toBe(true);
    expect(result.remaining).toBe(4);
  });

  it("resetAt is a future timestamp (within the configured window)", () => {
    process.env.AI_RATE_LIMIT_WINDOW_MS = "5000";
    const before = Date.now();
    const result = checkRateLimit(`${keyPrefix}reset`);
    const after = Date.now();
    expect(result.resetAt).toBeGreaterThan(before);
    expect(result.resetAt).toBeLessThanOrEqual(after + 5000);
  });

  it("resetAt stays the same for all calls within the same window", () => {
    process.env.AI_RATE_LIMIT_MAX = "5";
    const key = `${keyPrefix}same-window`;
    const r1 = checkRateLimit(key);
    const r2 = checkRateLimit(key);
    const r3 = checkRateLimit(key);
    expect(r2.resetAt).toBe(r1.resetAt);
    expect(r3.resetAt).toBe(r1.resetAt);
  });

  it("remaining decrements on each successive call", () => {
    process.env.AI_RATE_LIMIT_MAX = "5";
    const key = `${keyPrefix}decrement`;
    const r1 = checkRateLimit(key);
    const r2 = checkRateLimit(key);
    const r3 = checkRateLimit(key);
    expect(r1.remaining).toBe(4);
    expect(r2.remaining).toBe(3);
    expect(r3.remaining).toBe(2);
  });

  it("calls up to max all return ok:true", () => {
    process.env.AI_RATE_LIMIT_MAX = "3";
    const key = `${keyPrefix}b`;
    for (let i = 0; i < 3; i++) {
      const r = checkRateLimit(key);
      expect(r.ok).toBe(true);
    }
  });

  it("call at max+1 returns ok:false, remaining=0", () => {
    process.env.AI_RATE_LIMIT_MAX = "3";
    const key = `${keyPrefix}c`;
    for (let i = 0; i < 3; i++) {
      checkRateLimit(key);
    }
    const r = checkRateLimit(key);
    expect(r.ok).toBe(false);
    expect(r.remaining).toBe(0);
  });

  it("blocked call preserves the original window's resetAt", () => {
    process.env.AI_RATE_LIMIT_MAX = "2";
    const key = `${keyPrefix}blocked-reset`;
    const r1 = checkRateLimit(key);
    checkRateLimit(key);
    const blocked = checkRateLimit(key);
    expect(blocked.ok).toBe(false);
    expect(blocked.resetAt).toBe(r1.resetAt);
  });

  it("after the window expires, counter resets and ok:true again", () => {
    process.env.AI_RATE_LIMIT_WINDOW_MS = "1000";
    process.env.AI_RATE_LIMIT_MAX = "2";
    vi.useFakeTimers();
    const key = `${keyPrefix}d`;
    checkRateLimit(key);
    checkRateLimit(key);
    const blocked = checkRateLimit(key);
    expect(blocked.ok).toBe(false);

    vi.advanceTimersByTime(1001);
    const r = checkRateLimit(key);
    expect(r.ok).toBe(true);
    expect(r.remaining).toBe(1);
  });

  it("different keys are tracked independently", () => {
    process.env.AI_RATE_LIMIT_MAX = "2";
    const key1 = `${keyPrefix}e1`;
    const key2 = `${keyPrefix}e2`;
    checkRateLimit(key1);
    checkRateLimit(key1);
    // key1 is now at max
    const r1 = checkRateLimit(key1);
    expect(r1.ok).toBe(false);
    // key2 is untouched
    const r2 = checkRateLimit(key2);
    expect(r2.ok).toBe(true);
    expect(r2.remaining).toBe(1);
  });
});
