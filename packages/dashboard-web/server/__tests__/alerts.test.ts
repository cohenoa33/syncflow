import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import express, { Express, Request, Response, NextFunction } from "express";
import request from "supertest";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { AlertFireModel } from "../models";
import { registerAlertsRoutes } from "../routes/alerts";

let mongoServer: MongoMemoryServer;
let app: Express;

const TENANT = "tenant-alerts-regex";

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());

  app = express();
  app.use((req: Request, _res: Response, next: NextFunction) => {
    (req as any).tenantId = TENANT;
    next();
  });
  // Minimal io stub — alerts routes only touch io inside /evaluate, which this
  // test does not hit, so a bare object is enough.
  registerAlertsRoutes(app, {} as any);
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

beforeEach(async () => {
  await AlertFireModel.deleteMany({});
});

function makeAlertFire(overrides: Record<string, unknown> = {}) {
  return {
    tenantId: TENANT,
    ruleId: "rule-1",
    ruleName: "Test Rule",
    metric: "errorRate",
    value: 50,
    threshold: 10,
    window: "1h",
    appName: null,
    firedAt: Date.now(),
    ...overrides,
  };
}

describe("GET /api/alerts/history ?q=", () => {
  it("treats regex metacharacters in q as literal text", async () => {
    await AlertFireModel.insertMany([
      makeAlertFire({ ruleName: "errors(.*)spike" }), // literal match target
      makeAlertFire({ ruleName: "errorsXYZspike" }),  // would match if (.*) were a pattern
      makeAlertFire({ ruleName: "unrelated" }),
    ]);

    const res = await request(app)
      .get("/api/alerts/history")
      .query({ q: "errors(.*)spike" });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.history).toHaveLength(1);
    expect(res.body.history[0].ruleName).toBe("errors(.*)spike");
  });
});
