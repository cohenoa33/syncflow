/**
 * POST /api/demo-seed — apps[] input validation
 *
 * These tests exercise ONLY the body validation introduced for `apps`.
 * Auth/tenant behavior is kept out of the way by running in dev mode with
 * a single tenant. Auth-matrix coverage lives in auth.test.ts.
 */

import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  beforeAll,
  afterAll
} from "vitest";
import express, { Express } from "express";
import { createServer, Server as HttpServer } from "http";
import { Server as SocketIOServer } from "socket.io";
import request from "supertest";
import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";

import { EventModel } from "../models";

let mongoServer: MongoMemoryServer;
let app: Express;
let httpServer: HttpServer;
let io: SocketIOServer;

const TENANT = "tenant-a";
const VIEWER = "viewer-a";

function clearServerModuleCache() {
  const path = require("path");
  const serverDir = path.resolve(__dirname, "..");
  Object.keys(require.cache).forEach((key) => {
    if (
      key.startsWith(serverDir) &&
      !key.includes("models") &&
      !key.includes("node_modules")
    ) {
      delete require.cache[key];
    }
  });
}

function setDevEnv() {
  delete process.env.TENANTS_JSON;
  delete process.env.AUTH_MODE;
  delete process.env.DEMO_MODE_ENABLED;
  delete process.env.DEMO_MODE_TOKEN;

  process.env.TENANTS_JSON = JSON.stringify({
    [TENANT]: {
      apps: {},
      dashboards: { [VIEWER]: true }
    }
  });
  process.env.AUTH_MODE = "dev";
  process.env.DEMO_MODE_ENABLED = "true";
}

async function setupServer() {
  clearServerModuleCache();

  const { requireApiKey } = await import("../auth");
  const { registerDemoRoutes } = await import("../routes/demo");
  const { registerConfigRoutes } = await import("../routes/config");
  const { attachSocketServer } = await import("../socket");
  const { eventsBuffer, connectedAgents } = await import("../state");
  const { __TEST_resetTenantsConfig, __TEST_resetAuthConfig } =
    await import("../tenants");

  __TEST_resetTenantsConfig();
  __TEST_resetAuthConfig();

  eventsBuffer.length = 0;
  connectedAgents.clear();

  app = express();
  app.use(express.json());
  registerConfigRoutes(app);
  app.use("/api", requireApiKey);
  httpServer = createServer(app);
  io = attachSocketServer(httpServer);
  registerDemoRoutes(app, io);

  await new Promise<void>((resolve) => {
    httpServer.listen(0, () => resolve());
  });
}

async function teardownServer() {
  if (io) {
    await new Promise<void>((resolve) => io.close(() => resolve()));
  }
  if (httpServer) {
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
  }
}

function seed(body?: unknown) {
  const req = request(app)
    .post("/api/demo-seed")
    .set("X-Tenant-Id", TENANT)
    .set("Authorization", `Bearer ${VIEWER}`);
  return body === undefined ? req : req.send(body as object);
}

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

beforeEach(async () => {
  clearServerModuleCache();
  setDevEnv();
  await setupServer();
});

afterEach(async () => {
  await teardownServer();
  await EventModel.deleteMany({});
});

describe("POST /api/demo-seed — apps[] validation", () => {
  describe("accepts omitted apps and uses defaults", () => {
    it("no body at all → seeds the two default demo apps", async () => {
      const res = await seed();
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(Object.keys(res.body.traceIdsByApp).sort()).toEqual(
        [`demo-${TENANT}-app`, `demo-app-${TENANT}`].sort()
      );
    });

    it("body present but apps field omitted → uses defaults", async () => {
      const res = await seed({ unrelated: true });
      expect(res.status).toBe(200);
      expect(Object.keys(res.body.traceIdsByApp).sort()).toEqual(
        [`demo-${TENANT}-app`, `demo-app-${TENANT}`].sort()
      );
    });
  });

  describe("rejects malformed input with 400 BAD_REQUEST", () => {
    it("apps is null → 400", async () => {
      const res = await seed({ apps: null });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe("BAD_REQUEST");
    });

    it("apps is a string → 400", async () => {
      const res = await seed({ apps: "billing" });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe("BAD_REQUEST");
    });

    it("apps is a number → 400", async () => {
      const res = await seed({ apps: 42 });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe("BAD_REQUEST");
    });

    it("apps is a plain object → 400", async () => {
      const res = await seed({ apps: { 0: "billing" } });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe("BAD_REQUEST");
    });

    it("apps is an empty array → 400 (not treated as 'omitted')", async () => {
      const res = await seed({ apps: [] });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe("BAD_REQUEST");
    });

    it("apps contains a non-string item → 400 (does not silently drop)", async () => {
      const res = await seed({ apps: ["billing", 42] });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe("BAD_REQUEST");
      expect(res.body.message).toContain("apps[1]");
    });

    it("apps contains null → 400", async () => {
      const res = await seed({ apps: ["billing", null] });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe("BAD_REQUEST");
    });

    it("apps contains an empty string → 400", async () => {
      const res = await seed({ apps: ["billing", ""] });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe("BAD_REQUEST");
    });

    it("apps contains a whitespace-only string → 400", async () => {
      const res = await seed({ apps: ["   "] });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe("BAD_REQUEST");
    });
  });

  describe("accepts well-formed input with trimming and dedupe", () => {
    it("trims whitespace around each item", async () => {
      const res = await seed({ apps: ["  billing  ", "orders\t"] });
      expect(res.status).toBe(200);
      expect(Object.keys(res.body.traceIdsByApp).sort()).toEqual(
        ["billing", "orders"].sort()
      );
    });

    it("deduplicates after trimming, preserving first-seen order", async () => {
      const res = await seed({
        apps: ["billing", " billing ", "orders", "billing", "orders"]
      });
      expect(res.status).toBe(200);
      expect(Object.keys(res.body.traceIdsByApp)).toEqual(["billing", "orders"]);

      // Dedupe must happen before seeding, not just in the response shape:
      // the only appNames persisted should be the two deduped values.
      const appNames = await EventModel.distinct("appName", {
        tenantId: TENANT,
        source: "demo"
      });
      expect(appNames.sort()).toEqual(["billing", "orders"]);
    });
  });

  describe("rejected requests preserve previously seeded demo data", () => {
    it("malformed body does not wipe existing demo events", async () => {
      const seeded = await seed({ apps: ["billing"] });
      expect(seeded.status).toBe(200);
      const before = await EventModel.countDocuments({
        tenantId: TENANT,
        source: "demo"
      });
      expect(before).toBeGreaterThan(0);

      const bad = await seed({ apps: [""] });
      expect(bad.status).toBe(400);

      const after = await EventModel.countDocuments({
        tenantId: TENANT,
        source: "demo"
      });
      expect(after).toBe(before);
    });

    it("empty-array body does not wipe existing demo events", async () => {
      const seeded = await seed({ apps: ["billing"] });
      expect(seeded.status).toBe(200);
      const before = await EventModel.countDocuments({
        tenantId: TENANT,
        source: "demo"
      });

      const bad = await seed({ apps: [] });
      expect(bad.status).toBe(400);

      const after = await EventModel.countDocuments({
        tenantId: TENANT,
        source: "demo"
      });
      expect(after).toBe(before);
    });
  });
});
