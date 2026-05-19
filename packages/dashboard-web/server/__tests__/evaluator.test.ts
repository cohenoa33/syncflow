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
import { EventModel, AlertRuleModel, AlertFireModel } from "../models";
import { runEvaluation } from "../alerts/evaluator";

let mongoServer: MongoMemoryServer;

// Minimal io mock — evaluator only calls io.to(room).emit(event, data)
const mockIo: any = {
  to: (_room: string) => ({ emit: (_ev: string, _data: unknown) => {} })
};

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
  await AlertRuleModel.deleteMany({});
  await AlertFireModel.deleteMany({});
});

const TENANT = "tenant-eval-test";
const NOW = Date.now();

function makeRule(overrides: Record<string, unknown> = {}) {
  return {
    tenantId: TENANT,
    name: "Test Rule",
    metric: "errorRate",
    threshold: 10,
    window: "1h",
    appName: null,
    enabled: true,
    cooldownMs: 3_600_000,
    lastFiredAt: null,
    createdAt: NOW,
    ...overrides
  };
}

function makeEvent(overrides: Record<string, unknown> = {}) {
  return {
    id: Math.random().toString(36).slice(2),
    tenantId: TENANT,
    appName: "app-1",
    type: "express",
    operation: "GET /test",
    ts: NOW,
    durationMs: 100,
    level: "info",
    payload: {},
    ...overrides
  };
}

describe("runEvaluation", () => {
  it("rule with metric=errorRate fires when errorRate exceeds threshold", async () => {
    // 5 info + 5 error = 50% error rate → metricValue = 50 > threshold 30
    await EventModel.insertMany([
      ...Array.from({ length: 5 }, () => makeEvent({ level: "info" })),
      ...Array.from({ length: 5 }, () => makeEvent({ level: "error" }))
    ]);
    await AlertRuleModel.create(makeRule({ metric: "errorRate", threshold: 30 }));

    const results = await runEvaluation(mockIo);
    expect(results).toHaveLength(1);
    expect(results[0].status).toBe("fired");
    expect(results[0].value).toBeCloseTo(50);
  });

  it("firing creates an AlertFire record with correct fields", async () => {
    await EventModel.insertMany(
      Array.from({ length: 5 }, () => makeEvent({ level: "error" }))
    );
    const rule = await AlertRuleModel.create(
      makeRule({ metric: "errorRate", threshold: 0 })
    );

    await runEvaluation(mockIo);

    const fire = await AlertFireModel.findOne({ ruleId: rule._id.toString() });
    expect(fire).not.toBeNull();
    expect(fire!.metric).toBe("errorRate");
    expect(fire!.tenantId).toBe(TENANT);
    expect(typeof fire!.firedAt).toBe("number");
  });

  it("firing updates lastFiredAt on the rule", async () => {
    const beforeFire = Date.now();
    await EventModel.insertMany(
      Array.from({ length: 5 }, () => makeEvent({ level: "error" }))
    );
    const rule = await AlertRuleModel.create(
      makeRule({ metric: "errorRate", threshold: 0 })
    );

    await runEvaluation(mockIo);

    const updated = await AlertRuleModel.findById(rule._id).lean();
    expect(updated!.lastFiredAt).toBeGreaterThanOrEqual(beforeFire);
  });

  it("rule does not fire when metric is below threshold (status=skipped)", async () => {
    // 9 info + 1 error = 10% error rate → metricValue = 10 ≤ threshold 50
    await EventModel.insertMany([
      ...Array.from({ length: 9 }, () => makeEvent({ level: "info" })),
      makeEvent({ level: "error" })
    ]);
    await AlertRuleModel.create(makeRule({ metric: "errorRate", threshold: 50 }));

    const results = await runEvaluation(mockIo);
    expect(results[0].status).toBe("skipped");
  });

  it("cooldown: a rule that fired recently is skipped", async () => {
    // threshold=0 so any positive errorRate exceeds it, but cooldown blocks firing
    await EventModel.insertMany(
      Array.from({ length: 5 }, () => makeEvent({ level: "error" }))
    );
    await AlertRuleModel.create(
      makeRule({
        metric: "errorRate",
        threshold: 0,
        lastFiredAt: Date.now(),
        cooldownMs: 3_600_000
      })
    );

    const results = await runEvaluation(mockIo);
    expect(results[0].status).toBe("skipped");
    expect(results[0].reason).toMatch(/cooldown/);
  });

  it("no traffic in window: rule is skipped with 'no traffic' reason", async () => {
    // No events inserted at all
    await AlertRuleModel.create(makeRule({ metric: "errorRate", threshold: 10 }));

    const results = await runEvaluation(mockIo);
    expect(results[0].status).toBe("skipped");
    expect(results[0].reason).toMatch(/no traffic/);
  });

  it("rule with metric=requestVolume fires when total requests exceed threshold", async () => {
    // 10 total requests > threshold 5
    await EventModel.insertMany(
      Array.from({ length: 10 }, () => makeEvent({ level: "info" }))
    );
    await AlertRuleModel.create(
      makeRule({ metric: "requestVolume", threshold: 5 })
    );

    const results = await runEvaluation(mockIo);
    expect(results[0].status).toBe("fired");
    expect(results[0].value).toBe(10);
  });

  it("rule with metric=p95Latency fires when p95 exceeds threshold", async () => {
    // 10 events all with 600ms duration → p95 = 600 > threshold 500
    await EventModel.insertMany(
      Array.from({ length: 10 }, () => makeEvent({ durationMs: 600 }))
    );
    await AlertRuleModel.create(
      makeRule({ metric: "p95Latency", threshold: 500 })
    );

    const results = await runEvaluation(mockIo);
    expect(results[0].status).toBe("fired");
    expect(results[0].value).toBeGreaterThan(500);
  });

  it("unknown metric is skipped with descriptive reason", async () => {
    await EventModel.insertMany([makeEvent()]);
    await AlertRuleModel.create(makeRule({ metric: "unknownMetric" }));

    const results = await runEvaluation(mockIo);
    expect(results[0].status).toBe("skipped");
    expect(results[0].reason).toMatch(/unknown metric/i);
  });

  it("disabled rules (enabled=false) are never evaluated", async () => {
    await EventModel.insertMany(
      Array.from({ length: 10 }, () => makeEvent({ level: "error" }))
    );
    await AlertRuleModel.create(makeRule({ enabled: false }));

    const results = await runEvaluation(mockIo);
    expect(results).toHaveLength(0);
  });

  it("runEvaluation with tenantId only evaluates rules for that tenant", async () => {
    await EventModel.insertMany([
      ...Array.from({ length: 5 }, () =>
        makeEvent({ level: "error", tenantId: TENANT })
      ),
      ...Array.from({ length: 5 }, () =>
        makeEvent({ level: "error", tenantId: "other-tenant" })
      )
    ]);
    await AlertRuleModel.create(makeRule({ tenantId: TENANT }));
    await AlertRuleModel.create(makeRule({ tenantId: "other-tenant" }));

    const results = await runEvaluation(mockIo, TENANT);
    expect(results).toHaveLength(1);
    // Rule for TENANT should be the only one evaluated
    const rule = await AlertRuleModel.findOne({ tenantId: TENANT });
    expect(results[0].ruleId).toBe(rule!._id.toString());
  });
});
