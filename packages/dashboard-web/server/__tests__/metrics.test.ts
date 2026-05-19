import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach
} from "vitest";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { EventModel } from "../models";
import { computeMetricsSummary } from "../routes/metrics";

let mongoServer: MongoMemoryServer;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

beforeEach(async () => {
  await EventModel.deleteMany({});
});

const TENANT = "tenant-metrics-test";

function makeEvent(overrides: Record<string, unknown> = {}) {
  return {
    id: Math.random().toString(36).slice(2),
    tenantId: TENANT,
    appName: "app-1",
    type: "express",
    operation: "GET /test",
    ts: Date.now(),
    durationMs: 100,
    level: "info",
    payload: {},
    ...overrides
  };
}

describe("computeMetricsSummary", () => {
  it("empty DB returns totalRequests=0, errorRate=0, slowRate=0, p95Latency=null", async () => {
    const result = await computeMetricsSummary(TENANT, "1h", null, true);
    expect(result.totalRequests).toBe(0);
    expect(result.errorRate).toBe(0);
    expect(result.slowRate).toBe(0);
    expect(result.p95Latency).toBeNull();
  });

  it("single express event: totalRequests=1", async () => {
    await EventModel.create(makeEvent());
    const result = await computeMetricsSummary(TENANT, "1h", null, true);
    expect(result.totalRequests).toBe(1);
  });

  it("errorRate = errors/total (insert 2 errors out of 10 → 0.2)", async () => {
    const events = [
      ...Array.from({ length: 8 }, () => makeEvent({ level: "info" })),
      ...Array.from({ length: 2 }, () => makeEvent({ level: "error" }))
    ];
    await EventModel.insertMany(events);
    const result = await computeMetricsSummary(TENANT, "1h", null, true);
    expect(result.totalRequests).toBe(10);
    expect(result.errorRate).toBeCloseTo(0.2);
  });

  it("p95Latency returns the correct percentile from inserted durations", async () => {
    // 20 events with durations 10, 20, ..., 200
    const events = Array.from({ length: 20 }, (_, i) =>
      makeEvent({ durationMs: (i + 1) * 10 })
    );
    await EventModel.insertMany(events);
    const result = await computeMetricsSummary(TENANT, "1h", null, true);
    // percentile(sorted, 0.95): idx = floor(20 * 0.95) = 19, sorted[19] = 200
    expect(result.p95Latency).toBe(200);
  });

  it("slowRate = slow/total (durationMs > 500 counts as slow)", async () => {
    // 3 slow (> 500ms), 7 normal → slowRate = 0.3
    const events = [
      ...Array.from({ length: 7 }, () => makeEvent({ durationMs: 100 })),
      ...Array.from({ length: 3 }, () => makeEvent({ durationMs: 600 }))
    ];
    await EventModel.insertMany(events);
    const result = await computeMetricsSummary(TENANT, "1h", null, true);
    expect(result.totalRequests).toBe(10);
    expect(result.slowRate).toBeCloseTo(0.3);
  });

  it("events with ts outside the window are not counted", async () => {
    const TWO_HOURS_AGO = Date.now() - 2 * 60 * 60 * 1000;
    await EventModel.create(makeEvent({ ts: TWO_HOURS_AGO })); // outside "1h" window
    await EventModel.create(makeEvent()); // inside window (now)
    const result = await computeMetricsSummary(TENANT, "1h", null, true);
    expect(result.totalRequests).toBe(1);
  });

  it("excludeDemo=true filters out source:demo events when real events exist", async () => {
    await EventModel.create(makeEvent());
    await EventModel.create(makeEvent({ source: "demo" }));
    const result = await computeMetricsSummary(TENANT, "1h", null, true);
    // Only the 1 real event should be counted
    expect(result.totalRequests).toBe(1);
  });

  it("excludeDemo=true falls back to demo events when no real events exist in window", async () => {
    await EventModel.create(makeEvent({ source: "demo" }));
    await EventModel.create(makeEvent({ source: "demo" }));
    const result = await computeMetricsSummary(TENANT, "1h", null, true);
    // No real events → falls back to demo
    expect(result.totalRequests).toBe(2);
  });

  it("appName filter scopes to only that app's events", async () => {
    await EventModel.create(makeEvent({ appName: "app-a" }));
    await EventModel.create(makeEvent({ appName: "app-b" }));
    const result = await computeMetricsSummary(TENANT, "1h", "app-a", true);
    expect(result.totalRequests).toBe(1);
  });

  it("tenant isolation: events from other tenants are not counted", async () => {
    await EventModel.create(makeEvent({ tenantId: "other-tenant" }));
    await EventModel.create(makeEvent({ tenantId: TENANT }));
    const result = await computeMetricsSummary(TENANT, "1h", null, true);
    expect(result.totalRequests).toBe(1);
  });
});
