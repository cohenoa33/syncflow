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
import { AlertFireModel } from "../models";

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
  await AlertFireModel.deleteMany({});
});

const TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days, matches cleanup.ts

function makeAlertFire(overrides: Record<string, unknown> = {}) {
  return {
    tenantId: "tenant-cleanup-test",
    ruleId: "rule-1",
    ruleName: "Test Rule",
    metric: "errorRate",
    value: 50,
    threshold: 10,
    window: "1h",
    appName: null,
    firedAt: Date.now(),
    ...overrides
  };
}

describe("AlertFire cleanup deletion logic", () => {
  it("deletes records older than 7 days and preserves records within 7 days", async () => {
    const now = Date.now();
    const cutoff = now - TTL_MS;

    // 3 old records (beyond the 7-day cutoff)
    await AlertFireModel.insertMany([
      makeAlertFire({ firedAt: cutoff - 1_000 }),
      makeAlertFire({ firedAt: cutoff - 86_400_000 }),
      makeAlertFire({ firedAt: cutoff - 2 * 86_400_000 })
    ]);

    // 2 recent records (within 7 days)
    await AlertFireModel.insertMany([
      makeAlertFire({ firedAt: now - 60_000 }),
      makeAlertFire({ firedAt: now })
    ]);

    expect(await AlertFireModel.countDocuments()).toBe(5);

    const result = await AlertFireModel.deleteMany({ firedAt: { $lt: cutoff } });

    expect(result.deletedCount).toBe(3);
    expect(await AlertFireModel.countDocuments()).toBe(2);

    // Remaining records are all within the TTL window
    const remaining = await AlertFireModel.find().lean();
    remaining.forEach((doc) => {
      expect(doc.firedAt).toBeGreaterThanOrEqual(cutoff);
    });
  });

  it("record with firedAt === cutoff is NOT deleted ($lt is strict, not $lte)", async () => {
    const now = Date.now();
    const cutoff = now - TTL_MS;

    await AlertFireModel.create(makeAlertFire({ firedAt: cutoff }));

    const result = await AlertFireModel.deleteMany({ firedAt: { $lt: cutoff } });

    expect(result.deletedCount).toBe(0);
    expect(await AlertFireModel.countDocuments()).toBe(1);
  });

  it("empty collection: deleteMany returns deletedCount=0 without error", async () => {
    const cutoff = Date.now() - TTL_MS;
    const result = await AlertFireModel.deleteMany({ firedAt: { $lt: cutoff } });
    expect(result.deletedCount).toBe(0);
  });

  it("all records within TTL: nothing deleted", async () => {
    const now = Date.now();
    await AlertFireModel.insertMany([
      makeAlertFire({ firedAt: now - 60_000 }),
      makeAlertFire({ firedAt: now - 3_600_000 })
    ]);

    const cutoff = now - TTL_MS;
    const result = await AlertFireModel.deleteMany({ firedAt: { $lt: cutoff } });

    expect(result.deletedCount).toBe(0);
    expect(await AlertFireModel.countDocuments()).toBe(2);
  });

  it("all records beyond TTL: all deleted", async () => {
    const now = Date.now();
    const cutoff = now - TTL_MS;

    await AlertFireModel.insertMany([
      makeAlertFire({ firedAt: cutoff - 1 }),
      makeAlertFire({ firedAt: cutoff - 86_400_000 }),
      makeAlertFire({ firedAt: cutoff - 7 * 86_400_000 })
    ]);

    const result = await AlertFireModel.deleteMany({ firedAt: { $lt: cutoff } });

    expect(result.deletedCount).toBe(3);
    expect(await AlertFireModel.countDocuments()).toBe(0);
  });
});
