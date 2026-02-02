/**
 * Authentication and Tenant Isolation Tests
 *
 * These tests lock the CURRENT authentication and tenant isolation behavior.
 * They MUST FAIL if any auth or isolation rule regresses.
 *
 * NO behavior changes - tests only document and verify existing behavior.
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
import { io as ioClient, Socket as ClientSocket } from "socket.io-client";
import request from "supertest";
import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";

// Import server components (will be re-imported per test)
import { EventModel } from "../models";

// Test utilities
let mongoServer: MongoMemoryServer;
let app: Express;
let httpServer: HttpServer;
let io: SocketIOServer;
let serverPort: number;

// Module cache management
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

// Helper to set env vars for each test
function setTestEnv(config: {
  TENANTS_JSON?: string;
  AUTH_MODE?: string;
  DEMO_MODE_ENABLED?: string;
  DEMO_MODE_TOKEN?: string;
}) {
  // Clear all test env vars first
  delete process.env.TENANTS_JSON;
  delete process.env.AUTH_MODE;
  delete process.env.DEMO_MODE_ENABLED;
  delete process.env.DEMO_MODE_TOKEN;

  // Set provided values
  if (config.TENANTS_JSON !== undefined)
    process.env.TENANTS_JSON = config.TENANTS_JSON;
  if (config.AUTH_MODE !== undefined) process.env.AUTH_MODE = config.AUTH_MODE;
  if (config.DEMO_MODE_ENABLED !== undefined)
    process.env.DEMO_MODE_ENABLED = config.DEMO_MODE_ENABLED;
  if (config.DEMO_MODE_TOKEN !== undefined)
    process.env.DEMO_MODE_TOKEN = config.DEMO_MODE_TOKEN;
}

async function setupServer() {
  clearServerModuleCache();

  const { requireApiKey } = await import("../auth");
  const { registerDemoRoutes } = await import("../routes/demo");
  const { registerTracesRoutes } = await import("../routes/traces");
  const { registerInsightsRoutes } = await import("../routes/insights");
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

  // Config endpoint must be registered BEFORE requireApiKey (intentionally public)
  registerConfigRoutes(app);

  app.use("/api", requireApiKey);

  httpServer = createServer(app);
  io = attachSocketServer(httpServer);

  registerDemoRoutes(app, io);
  registerTracesRoutes(app, io);
  registerInsightsRoutes(app);

  await new Promise<void>((resolve) => {
    httpServer.listen(0, () => {
      const addr = httpServer.address();
      serverPort = typeof addr === "object" && addr ? addr.port : 0;
      resolve();
    });
  });
}

async function teardownServer() {
  if (io) {
    await new Promise<void>((resolve) => {
      io.close(() => resolve());
    });
  }

  if (httpServer) {
    await new Promise<void>((resolve) => {
      httpServer.close(() => resolve());
    });
  }
}

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  const mongoUri = mongoServer.getUri();
  await mongoose.connect(mongoUri);
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

beforeEach(() => {
  clearServerModuleCache();
});

afterEach(async () => {
  await teardownServer();
  await EventModel.deleteMany({});
});
// ============================================================================
// CANARY — AUTH MUST NEVER WEAKEN
// ============================================================================

describe("AUTH CANARY — must never weaken", () => {
  it("must reject any /api route without valid tenant + viewer token when TENANTS_JSON is set", async () => {
    setTestEnv({
      TENANTS_JSON: JSON.stringify({
        "tenant-a": {
          apps: {},
          dashboards: { "viewer-a": true }
        }
      }),
      AUTH_MODE: "strict"
    });

    await setupServer();

    // Test BOTH /api/traces AND /api/insights to ensure middleware protects all routes
    const endpoints = ["/api/traces", "/api/insights/trace-123"];

    for (const endpoint of endpoints) {
      // 1) Missing tenant header
      const res1 = await request(app).get(endpoint);
      expect(res1.status).toBe(400);
      expect(res1.body.error).toBe("BAD_REQUEST");

      // 2) Unknown tenant
      const res2 = await request(app)
        .get(endpoint)
        .set("X-Tenant-Id", "unknown-tenant")
        .set("Authorization", "Bearer viewer-a");
      expect(res2.status).toBe(401);
      expect(res2.body.error).toBe("UNAUTHORIZED");

      // 3) Missing Authorization
      const res3 = await request(app)
        .get(endpoint)
        .set("X-Tenant-Id", "tenant-a");
      expect(res3.status).toBe(401);
      expect(res3.body.error).toBe("UNAUTHORIZED");

      // 4) Invalid viewer token
      const res4 = await request(app)
        .get(endpoint)
        .set("X-Tenant-Id", "tenant-a")
        .set("Authorization", "Bearer invalid");
      expect(res4.status).toBe(401);
      expect(res4.body.error).toBe("UNAUTHORIZED");
    }

    // Ensure middleware protects ALL /api/* paths (even non-existent routes)
    // If middleware is missing or registered incorrectly, this would return 404
    const resUnknown = await request(app).get("/api/__canary__");
    expect(resUnknown.status).toBe(400);
    expect(resUnknown.body.error).toBe("BAD_REQUEST");

    // 5) Control: valid tenant + valid token MUST succeed for /api/traces
    const res5 = await request(app)
      .get("/api/traces")
      .set("X-Tenant-Id", "tenant-a")
      .set("Authorization", "Bearer viewer-a");
    expect(res5.status).toBe(200);
  });
});
// ============================================================================
// 1) HTTP AUTH — requireApiKey middleware
// ============================================================================

describe("HTTP AUTH - requireApiKey middleware", () => {
  describe("GET /api/config", () => {
    it("should be the ONLY public /api endpoint and return only safe fields", async () => {
      setTestEnv({
        TENANTS_JSON: JSON.stringify({
          "tenant-a": {
            apps: {},
            dashboards: { "viewer-a": true }
          }
        }),
        AUTH_MODE: "strict",
        DEMO_MODE_ENABLED: "true",
        DEMO_MODE_TOKEN: "demo-secret"
      });
      await setupServer();

      // Call /api/config with NO authentication headers
      const res = await request(app).get("/api/config");

      // Must return 200 (public endpoint)
      expect(res.status).toBe(200);

      // Must return ONLY these safe fields (no sensitive data)
      const keys = Object.keys(res.body).sort();
      expect(keys).toEqual(["demoModeEnabled", "requiresDemoToken"]);

      // Both values must be booleans
      expect(typeof res.body.demoModeEnabled).toBe("boolean");
      expect(typeof res.body.requiresDemoToken).toBe("boolean");
    });
  });

  describe("GET /api/traces", () => {
    it("should return 400 when X-Tenant-Id is missing", async () => {
      setTestEnv({ TENANTS_JSON: "", AUTH_MODE: "dev" });
      await setupServer();

      const res = await request(app).get("/api/traces");
      // No X-Tenant-Id header

      expect(res.status).toBe(400);
      expect(res.body.error).toBe("BAD_REQUEST");
    });

    it("should return 200 with empty array when TENANTS_JSON is empty and X-Tenant-Id is present", async () => {
      setTestEnv({ TENANTS_JSON: "", AUTH_MODE: "dev" });
      await setupServer();

      const res = await request(app)
        .get("/api/traces")
        .set("X-Tenant-Id", "any-tenant");

      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });

    it("should return 401 when tenant is unknown (TENANTS_JSON present)", async () => {
      setTestEnv({
        TENANTS_JSON: JSON.stringify({
          "tenant-a": {
            apps: { "app-a": "token-a" },
            dashboards: { "viewer-a": true }
          }
        }),
        AUTH_MODE: "strict"
      });
      await setupServer();

      const res = await request(app)
        .get("/api/traces")
        .set("X-Tenant-Id", "unknown-tenant")
        .set("Authorization", "Bearer viewer-a");

      expect(res.status).toBe(401);
      expect(res.body.error).toBe("UNAUTHORIZED");
    });

    it("should return 401 when Authorization header is missing (TENANTS_JSON present)", async () => {
      setTestEnv({
        TENANTS_JSON: JSON.stringify({
          "tenant-a": {
            apps: { "app-a": "token-a" },
            dashboards: { "viewer-a": true }
          }
        }),
        AUTH_MODE: "strict"
      });
      await setupServer();

      const res = await request(app)
        .get("/api/traces")
        .set("X-Tenant-Id", "tenant-a");
      // No Authorization header

      expect(res.status).toBe(401);
      expect(res.body.error).toBe("UNAUTHORIZED");
    });

    it("should return 401 when viewer token is invalid (TENANTS_JSON present)", async () => {
      setTestEnv({
        TENANTS_JSON: JSON.stringify({
          "tenant-a": {
            apps: { "app-a": "token-a" },
            dashboards: { "viewer-a": true }
          }
        }),
        AUTH_MODE: "strict"
      });
      await setupServer();

      const res = await request(app)
        .get("/api/traces")
        .set("X-Tenant-Id", "tenant-a")
        .set("Authorization", "Bearer invalid-token");

      expect(res.status).toBe(401);
      expect(res.body.error).toBe("UNAUTHORIZED");
    });

    it("should return 200 when valid viewer token is provided (TENANTS_JSON present)", async () => {
      setTestEnv({
        TENANTS_JSON: JSON.stringify({
          "tenant-a": {
            apps: { "app-a": "token-a" },
            dashboards: { "viewer-a": true }
          }
        }),
        AUTH_MODE: "strict"
      });
      await setupServer();

      const res = await request(app)
        .get("/api/traces")
        .set("X-Tenant-Id", "tenant-a")
        .set("Authorization", "Bearer viewer-a");

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });
  });

  describe("GET /api/insights/:traceId", () => {
    it("should return 400 when X-Tenant-Id is missing", async () => {
      setTestEnv({ TENANTS_JSON: "", AUTH_MODE: "dev" });
      await setupServer();

      const res = await request(app).get("/api/insights/trace-123");
      // No X-Tenant-Id header

      expect(res.status).toBe(400);
      expect(res.body.error).toBe("BAD_REQUEST");
    });

    it("should return 401 when TENANTS_JSON present and Authorization header missing", async () => {
      setTestEnv({
        TENANTS_JSON: JSON.stringify({
          "tenant-a": {
            apps: { "app-a": "token-a" },
            dashboards: { "viewer-a": true }
          }
        }),
        AUTH_MODE: "strict"
      });
      await setupServer();

      const res = await request(app)
        .get("/api/insights/trace-123")
        .set("X-Tenant-Id", "tenant-a");
      // No Authorization header

      expect(res.status).toBe(401);
      expect(res.body.error).toBe("UNAUTHORIZED");
    });

    it("should pass auth and return either 200 or 404 when valid credentials provided", async () => {
      setTestEnv({
        TENANTS_JSON: JSON.stringify({
          "tenant-a": {
            apps: {},
            dashboards: { "viewer-a": true }
          }
        }),
        AUTH_MODE: "strict"
      });
      await setupServer();

      const res = await request(app)
        .get("/api/insights/trace-123")
        .set("X-Tenant-Id", "tenant-a")
        .set("Authorization", "Bearer viewer-a");

      // Auth passed - should not be 400 (missing tenant) or 401 (unauthorized)
      // Can be 200 (found) or 404 (trace not found)
      expect([200, 404]).toContain(res.status);
    });
  });
});

// ============================================================================
// 2) DEMO ROUTES AUTH — /api/demo-seed
// ============================================================================

describe("DEMO ROUTES AUTH - /api/demo-seed", () => {
  describe("POST /api/demo-seed", () => {
    it("should return 403 when DEMO_MODE_ENABLED=false", async () => {
      setTestEnv({
        TENANTS_JSON: JSON.stringify({
          "tenant-a": {
            apps: {},
            dashboards: { "viewer-a": true }
          }
        }),
        AUTH_MODE: "strict",
        DEMO_MODE_ENABLED: "false"
      });
      await setupServer();

      const res = await request(app)
        .post("/api/demo-seed")
        .set("X-Tenant-Id", "tenant-a")
        .set("Authorization", "Bearer viewer-a");

      expect(res.status).toBe(403);
      expect(res.body.error).toBe("DEMO_MODE_DISABLED");
    });

    it("should return 401 when X-Demo-Token is missing in strict mode", async () => {
      setTestEnv({
        TENANTS_JSON: JSON.stringify({
          "tenant-a": {
            apps: {},
            dashboards: { "viewer-a": true }
          }
        }),
        AUTH_MODE: "strict",
        DEMO_MODE_ENABLED: "true",
        DEMO_MODE_TOKEN: "demo-secret"
      });
      await setupServer();

      const res = await request(app)
        .post("/api/demo-seed")
        .set("X-Tenant-Id", "tenant-a")
        .set("Authorization", "Bearer viewer-a");
      // Missing X-Demo-Token

      expect(res.status).toBe(401);
      expect(res.body.error).toBe("UNAUTHORIZED");
    });

    it("should return 401 when X-Demo-Token is invalid in strict mode", async () => {
      setTestEnv({
        TENANTS_JSON: JSON.stringify({
          "tenant-a": {
            apps: {},
            dashboards: { "viewer-a": true }
          }
        }),
        AUTH_MODE: "strict",
        DEMO_MODE_ENABLED: "true",
        DEMO_MODE_TOKEN: "demo-secret"
      });
      await setupServer();

      const res = await request(app)
        .post("/api/demo-seed")
        .set("X-Tenant-Id", "tenant-a")
        .set("Authorization", "Bearer viewer-a")
        .set("X-Demo-Token", "wrong-token");

      expect(res.status).toBe(401);
      expect(res.body.error).toBe("UNAUTHORIZED");
    });

    it("should return 401 when viewer Authorization is invalid even with valid demo token", async () => {
      setTestEnv({
        TENANTS_JSON: JSON.stringify({
          "tenant-a": {
            apps: {},
            dashboards: { "viewer-a": true }
          }
        }),
        AUTH_MODE: "strict",
        DEMO_MODE_ENABLED: "true",
        DEMO_MODE_TOKEN: "demo-secret"
      });
      await setupServer();

      const res = await request(app)
        .post("/api/demo-seed")
        .set("X-Tenant-Id", "tenant-a")
        .set("Authorization", "Bearer invalid-viewer")
        .set("X-Demo-Token", "demo-secret");

      expect(res.status).toBe(401);
      expect(res.body.error).toBe("UNAUTHORIZED");
    });

    it("should return 200 when both viewer auth and demo token are valid in strict mode", async () => {
      setTestEnv({
        TENANTS_JSON: JSON.stringify({
          "tenant-a": {
            apps: {},
            dashboards: { "viewer-a": true }
          }
        }),
        AUTH_MODE: "strict",
        DEMO_MODE_ENABLED: "true",
        DEMO_MODE_TOKEN: "demo-secret"
      });
      await setupServer();

      const res = await request(app)
        .post("/api/demo-seed")
        .set("X-Tenant-Id", "tenant-a")
        .set("Authorization", "Bearer viewer-a")
        .set("X-Demo-Token", "demo-secret")
        .send({ apps: ["demo-app"] });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });

    it("should not require demo token in dev mode", async () => {
      setTestEnv({
        TENANTS_JSON: JSON.stringify({
          "tenant-a": {
            apps: {},
            dashboards: { "viewer-a": true }
          }
        }),
        AUTH_MODE: "dev",
        DEMO_MODE_ENABLED: "true"
      });
      await setupServer();

      const res = await request(app)
        .post("/api/demo-seed")
        .set("X-Tenant-Id", "tenant-a")
        .set("Authorization", "Bearer viewer-a");
      // No X-Demo-Token required in dev mode

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });

    it("should still require X-Tenant-Id in dev mode", async () => {
      setTestEnv({
        TENANTS_JSON: JSON.stringify({
          "tenant-a": {
            apps: {},
            dashboards: { "viewer-a": true }
          }
        }),
        AUTH_MODE: "dev",
        DEMO_MODE_ENABLED: "true"
      });
      await setupServer();

      const res = await request(app)
        .post("/api/demo-seed")
        .set("Authorization", "Bearer viewer-a");
      // Missing X-Tenant-Id

      expect(res.status).toBe(400);
      expect(res.body.error).toBe("BAD_REQUEST");
    });
  });

  describe("DELETE /api/demo-seed", () => {
    it("should return 403 when DEMO_MODE_ENABLED=false", async () => {
      setTestEnv({
        TENANTS_JSON: JSON.stringify({
          "tenant-a": {
            apps: {},
            dashboards: { "viewer-a": true }
          }
        }),
        AUTH_MODE: "strict",
        DEMO_MODE_ENABLED: "false"
      });
      await setupServer();

      const res = await request(app)
        .delete("/api/demo-seed")
        .set("X-Tenant-Id", "tenant-a")
        .set("Authorization", "Bearer viewer-a");

      expect(res.status).toBe(403);
      expect(res.body.error).toBe("DEMO_MODE_DISABLED");
    });

    it("should return 401 when X-Demo-Token is missing in strict mode", async () => {
      setTestEnv({
        TENANTS_JSON: JSON.stringify({
          "tenant-a": {
            apps: {},
            dashboards: { "viewer-a": true }
          }
        }),
        AUTH_MODE: "strict",
        DEMO_MODE_ENABLED: "true",
        DEMO_MODE_TOKEN: "demo-secret"
      });
      await setupServer();

      const res = await request(app)
        .delete("/api/demo-seed")
        .set("X-Tenant-Id", "tenant-a")
        .set("Authorization", "Bearer viewer-a");

      expect(res.status).toBe(401);
      expect(res.body.error).toBe("UNAUTHORIZED");
    });

    it("should return 200 when both viewer auth and demo token are valid", async () => {
      setTestEnv({
        TENANTS_JSON: JSON.stringify({
          "tenant-a": {
            apps: {},
            dashboards: { "viewer-a": true }
          }
        }),
        AUTH_MODE: "strict",
        DEMO_MODE_ENABLED: "true",
        DEMO_MODE_TOKEN: "demo-secret"
      });
      await setupServer();

      const res = await request(app)
        .delete("/api/demo-seed")
        .set("X-Tenant-Id", "tenant-a")
        .set("Authorization", "Bearer viewer-a")
        .set("X-Demo-Token", "demo-secret");

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });
  });
});

// ============================================================================
// 3) SOCKET AUTH — join_tenant
// ============================================================================

describe("SOCKET AUTH - join_tenant", () => {
  let client: ClientSocket;

  afterEach(() => {
    if (client?.connected) {
      client.disconnect();
    }
  });

  it("should emit auth_error and disconnect when tenantId is missing", async () => {
    setTestEnv({
      TENANTS_JSON: JSON.stringify({
        "tenant-a": {
          apps: {},
          dashboards: { "viewer-a": true }
        }
      }),
      AUTH_MODE: "strict"
    });
    await setupServer();

    return new Promise<void>((resolve, reject) => {
      client = ioClient(`http://localhost:${serverPort}`);

      client.on("auth_error", (data) => {
        expect(data.error).toBe("MISSING_TENANT_ID");
        resolve();
      });

      client.on("connect", () => {
        client.emit("join_tenant", {}); // Missing tenantId
      });

      setTimeout(
        () => reject(new Error("Timeout waiting for auth_error")),
        2000
      );
    });
  });

  it("should emit auth_error when TENANTS_JSON is empty", async () => {
    setTestEnv({ TENANTS_JSON: "", AUTH_MODE: "dev" });
    await setupServer();

    return new Promise<void>((resolve, reject) => {
      client = ioClient(`http://localhost:${serverPort}`);

      client.on("auth_error", (data) => {
        expect(data.error).toBe("TENANTS_NOT_CONFIGURED");
        resolve();
      });

      client.on("connect", () => {
        client.emit("join_tenant", {
          tenantId: "any-tenant",
          token: "any-token"
        });
      });

      setTimeout(
        () => reject(new Error("Timeout waiting for auth_error")),
        2000
      );
    });
  });

  it("should emit auth_error and disconnect when tenant is unknown", async () => {
    setTestEnv({
      TENANTS_JSON: JSON.stringify({
        "tenant-a": {
          apps: {},
          dashboards: { "viewer-a": true }
        }
      }),
      AUTH_MODE: "strict"
    });
    await setupServer();

    return new Promise<void>((resolve, reject) => {
      client = ioClient(`http://localhost:${serverPort}`);

      client.on("auth_error", (data) => {
        expect(data.error).toBe("UNAUTHORIZED");
        resolve();
      });

      client.on("connect", () => {
        client.emit("join_tenant", {
          tenantId: "unknown-tenant",
          token: "viewer-a"
        });
      });

      setTimeout(
        () => reject(new Error("Timeout waiting for auth_error")),
        2000
      );
    });
  });

  it("should emit auth_error and disconnect when viewer token is missing", async () => {
    setTestEnv({
      TENANTS_JSON: JSON.stringify({
        "tenant-a": {
          apps: {},
          dashboards: { "viewer-a": true }
        }
      }),
      AUTH_MODE: "strict"
    });
    await setupServer();

    return new Promise<void>((resolve, reject) => {
      client = ioClient(`http://localhost:${serverPort}`);

      client.on("auth_error", (data) => {
        expect(data.error).toBe("UNAUTHORIZED");
        resolve();
      });

      client.on("connect", () => {
        client.emit("join_tenant", { tenantId: "tenant-a" }); // No token
      });

      setTimeout(
        () => reject(new Error("Timeout waiting for auth_error")),
        2000
      );
    });
  });

  it("should emit auth_error and disconnect when viewer token is invalid", async () => {
    setTestEnv({
      TENANTS_JSON: JSON.stringify({
        "tenant-a": {
          apps: {},
          dashboards: { "viewer-a": true }
        }
      }),
      AUTH_MODE: "strict"
    });
    await setupServer();

    return new Promise<void>((resolve, reject) => {
      client = ioClient(`http://localhost:${serverPort}`);

      client.on("auth_error", (data) => {
        expect(data.error).toBe("UNAUTHORIZED");
        resolve();
      });

      client.on("connect", () => {
        client.emit("join_tenant", {
          tenantId: "tenant-a",
          token: "invalid-token"
        });
      });

      setTimeout(
        () => reject(new Error("Timeout waiting for auth_error")),
        2000
      );
    });
  });

  it("should join tenant room when valid tenant and token are provided", async () => {
    setTestEnv({
      TENANTS_JSON: JSON.stringify({
        "tenant-a": {
          apps: {},
          dashboards: { "viewer-a": true }
        }
      }),
      AUTH_MODE: "strict"
    });
    await setupServer();

    return new Promise<void>((resolve, reject) => {
      client = ioClient(`http://localhost:${serverPort}`);

      client.on("agents", (agents) => {
        // If we receive agents list, we successfully joined the room
        expect(Array.isArray(agents)).toBe(true);
        resolve();
      });

      client.on("auth_error", () => {
        reject(new Error("Should not receive auth_error"));
      });

      client.on("connect", () => {
        client.emit("join_tenant", { tenantId: "tenant-a", token: "viewer-a" });
      });

      setTimeout(() => reject(new Error("Timeout waiting for agents")), 2000);
    });
  });
});

// ============================================================================
// 4) SOCKET AUTH — register (agent)
// ============================================================================

describe("SOCKET AUTH - register (agent)", () => {
  let client: ClientSocket;

  afterEach(() => {
    if (client?.connected) {
      client.disconnect();
    }
  });

  it("should reject when TENANTS_JSON is empty", async () => {
    setTestEnv({ TENANTS_JSON: "", AUTH_MODE: "dev" });
    await setupServer();

    return new Promise<void>((resolve, reject) => {
      client = ioClient(`http://localhost:${serverPort}`);

      client.on("auth_error", (data) => {
        expect(data.error).toBe("TENANTS_NOT_CONFIGURED");
        resolve();
      });

      client.on("connect", () => {
        client.emit("register", { appName: "app-a", token: "token-a" });
      });

      setTimeout(
        () => reject(new Error("Timeout waiting for auth_error")),
        2000
      );
    });
  });

  it("should reject when appName is missing", async () => {
    setTestEnv({
      TENANTS_JSON: JSON.stringify({
        "tenant-a": {
          apps: { "app-a": "token-a" },
          dashboards: {}
        }
      }),
      AUTH_MODE: "strict"
    });
    await setupServer();

    return new Promise<void>((resolve, reject) => {
      client = ioClient(`http://localhost:${serverPort}`);

      client.on("auth_error", (data) => {
        expect(data.error).toBe("MISSING_APP_NAME");
        resolve();
      });

      client.on("connect", () => {
        client.emit("register", { token: "token-a" }); // Missing appName
      });

      setTimeout(
        () => reject(new Error("Timeout waiting for auth_error")),
        2000
      );
    });
  });

  it("should reject when appName is unknown", async () => {
    setTestEnv({
      TENANTS_JSON: JSON.stringify({
        "tenant-a": {
          apps: { "app-a": "token-a" },
          dashboards: {}
        }
      }),
      AUTH_MODE: "strict"
    });
    await setupServer();

    return new Promise<void>((resolve, reject) => {
      client = ioClient(`http://localhost:${serverPort}`);

      client.on("auth_error", (data) => {
        expect(data.error).toBe("UNAUTHORIZED");
        resolve();
      });

      client.on("connect", () => {
        client.emit("register", { appName: "unknown-app", token: "token-a" });
      });

      setTimeout(
        () => reject(new Error("Timeout waiting for auth_error")),
        2000
      );
    });
  });

  it("should reject when agent token is invalid", async () => {
    setTestEnv({
      TENANTS_JSON: JSON.stringify({
        "tenant-a": {
          apps: { "app-a": "token-a" },
          dashboards: {}
        }
      }),
      AUTH_MODE: "strict"
    });
    await setupServer();

    return new Promise<void>((resolve, reject) => {
      client = ioClient(`http://localhost:${serverPort}`);

      client.on("auth_error", (data) => {
        expect(data.error).toBe("UNAUTHORIZED");
        resolve();
      });

      client.on("connect", () => {
        client.emit("register", { appName: "app-a", token: "wrong-token" });
      });

      setTimeout(
        () => reject(new Error("Timeout waiting for auth_error")),
        2000
      );
    });
  });

  it("should register agent and join tenant room when valid credentials provided", async () => {
    setTestEnv({
      TENANTS_JSON: JSON.stringify({
        "tenant-a": {
          apps: { "app-a": "token-a" },
          dashboards: {}
        }
      }),
      AUTH_MODE: "strict"
    });
    await setupServer();

    return new Promise<void>((resolve, reject) => {
      const agent = ioClient(`http://localhost:${serverPort}`);

      agent.on("auth_error", () => {
        reject(new Error("Agent should not receive auth_error"));
      });

      agent.on("connect", async () => {
        agent.emit("register", { appName: "app-a", token: "token-a" });

        // Give agent time to register
        await new Promise((r) => setTimeout(r, 100));

        const { connectedAgents } = await import("../state");
        try {
          expect(connectedAgents.size).toBe(1);
          const agentData = Array.from(connectedAgents.values())[0];
          expect(agentData.appName).toBe("app-a");
          expect(agentData.tenantId).toBe("tenant-a");

          agent.disconnect();
          resolve();
        } catch (err) {
          agent.disconnect();
          reject(err);
        }
      });

      setTimeout(() => {
        agent.disconnect();
        reject(new Error("Timeout waiting for agent registration"));
      }, 2000);
    });
  });
});

// ============================================================================
// 5) TENANT ISOLATION (CRITICAL)
// ============================================================================

describe("TENANT ISOLATION - Critical Data Leakage Prevention", () => {
  let clientA: ClientSocket;
  let clientB: ClientSocket;
  let agentA: ClientSocket;
  let agentB: ClientSocket;

  afterEach(() => {
    [clientA, clientB, agentA, agentB].forEach((c) => {
      if (c?.connected) c.disconnect();
    });
  });

  it("should never leak events from tenant A to tenant B via HTTP", async () => {
    setTestEnv({
      TENANTS_JSON: JSON.stringify({
        "tenant-a": {
          apps: { "app-a": "token-a" },
          dashboards: { "viewer-a": true }
        },
        "tenant-b": {
          apps: { "app-b": "token-b" },
          dashboards: { "viewer-b": true }
        }
      }),
      AUTH_MODE: "strict"
    });
    await setupServer();

    // Create event for tenant-a
    await EventModel.create({
      tenantId: "tenant-a",
      appName: "app-a",
      type: "express",
      operation: "GET /test-a",
      traceId: "trace-a",
      ts: Date.now(),
      id: "event-a"
    });

    // Create event for tenant-b
    await EventModel.create({
      tenantId: "tenant-b",
      appName: "app-b",
      type: "express",
      operation: "GET /test-b",
      traceId: "trace-b",
      ts: Date.now(),
      id: "event-b"
    });

    // Tenant A should only see their events
    const resA = await request(app)
      .get("/api/traces")
      .set("X-Tenant-Id", "tenant-a")
      .set("Authorization", "Bearer viewer-a");

    expect(resA.status).toBe(200);
    expect(resA.body.length).toBe(1);
    expect(resA.body[0].tenantId).toBe("tenant-a");
    expect(resA.body[0].id).toBe("event-a");

    // Tenant B should only see their events
    const resB = await request(app)
      .get("/api/traces")
      .set("X-Tenant-Id", "tenant-b")
      .set("Authorization", "Bearer viewer-b");

    expect(resB.status).toBe(200);
    expect(resB.body.length).toBe(1);
    expect(resB.body[0].tenantId).toBe("tenant-b");
    expect(resB.body[0].id).toBe("event-b");
  });

  it("should never leak events from tenant A to tenant B via Socket.IO", async () => {
    setTestEnv({
      TENANTS_JSON: JSON.stringify({
        "tenant-a": {
          apps: { "app-a": "token-a" },
          dashboards: { "viewer-a": true }
        },
        "tenant-b": {
          apps: { "app-b": "token-b" },
          dashboards: { "viewer-b": true }
        }
      }),
      AUTH_MODE: "strict"
    });
    await setupServer();

    return new Promise<void>((resolve, reject) => {
      let clientAReady = false;
      let clientBReady = false;
      let eventReceivedByB = false;

      // Setup tenant A client
      clientA = ioClient(`http://localhost:${serverPort}`);
      clientA.on("connect", () => {
        clientA.emit("join_tenant", {
          tenantId: "tenant-a",
          token: "viewer-a"
        });
      });
      clientA.on("agents", () => {
        clientAReady = true;
        checkReady();
      });

      // Setup tenant B client
      clientB = ioClient(`http://localhost:${serverPort}`);
      clientB.on("connect", () => {
        clientB.emit("join_tenant", {
          tenantId: "tenant-b",
          token: "viewer-b"
        });
      });
      clientB.on("agents", () => {
        clientBReady = true;
        checkReady();
      });

      // Tenant B should NEVER receive events from tenant A
      clientB.on("event", (evt) => {
        if (evt.tenantId === "tenant-a") {
          eventReceivedByB = true;
          reject(new Error("CRITICAL: Tenant B received tenant A's event!"));
        }
      });

      function checkReady() {
        if (clientAReady && clientBReady) {
          // Setup agent for tenant A
          agentA = ioClient(`http://localhost:${serverPort}`);
          agentA.on("connect", () => {
            agentA.emit("register", { appName: "app-a", token: "token-a" });
          });
          agentA.on("agents", () => {
            // Agent registered, send event
            agentA.emit("event", {
              type: "express",
              operation: "GET /test-a",
              traceId: "trace-a",
              ts: Date.now(),
              payload: {}
            });

            // Wait a bit to ensure event would have been received if isolation was broken
            setTimeout(() => {
              if (!eventReceivedByB) {
                resolve(); // Test passed - no leakage
              }
            }, 500);
          });
        }
      }

      setTimeout(() => reject(new Error("Timeout")), 3000);
    });
  });

  it("should isolate demo events per tenant and never affect real events", async () => {
    setTestEnv({
      TENANTS_JSON: JSON.stringify({
        "tenant-a": {
          apps: {},
          dashboards: { "viewer-a": true }
        },
        "tenant-b": {
          apps: {},
          dashboards: { "viewer-b": true }
        }
      }),
      AUTH_MODE: "strict",
      DEMO_MODE_ENABLED: "true",
      DEMO_MODE_TOKEN: "demo-secret"
    });
    await setupServer();

    // Create real event for tenant-a
    await EventModel.create({
      tenantId: "tenant-a",
      appName: "real-app-a",
      type: "express",
      operation: "GET /real-a",
      traceId: "real-trace-a",
      ts: Date.now(),
      id: "real-event-a"
    });

    // Seed demo data for tenant-a
    await request(app)
      .post("/api/demo-seed")
      .set("X-Tenant-Id", "tenant-a")
      .set("Authorization", "Bearer viewer-a")
      .set("X-Demo-Token", "demo-secret")
      .send({ apps: ["demo-app-a"] });

    // Verify tenant-a has both real and demo events
    const resA = await request(app)
      .get("/api/traces")
      .set("X-Tenant-Id", "tenant-a")
      .set("Authorization", "Bearer viewer-a");

    expect(resA.status).toBe(200);
    const realEventsA = resA.body.filter((e: any) => e.source !== "demo");
    const demoEventsA = resA.body.filter((e: any) => e.source === "demo");

    expect(realEventsA.length).toBeGreaterThan(0);
    expect(demoEventsA.length).toBeGreaterThan(0);
    expect(realEventsA[0].id).toBe("real-event-a");

    // Verify tenant-b has no events from tenant-a
    const resB = await request(app)
      .get("/api/traces")
      .set("X-Tenant-Id", "tenant-b")
      .set("Authorization", "Bearer viewer-b");

    expect(resB.status).toBe(200);
    expect(resB.body.length).toBe(0); // No events for tenant-b

    // Delete demo data for tenant-a
    await request(app)
      .delete("/api/demo-seed")
      .set("X-Tenant-Id", "tenant-a")
      .set("Authorization", "Bearer viewer-a")
      .set("X-Demo-Token", "demo-secret");

    // Verify real event still exists for tenant-a
    const resAfterDelete = await request(app)
      .get("/api/traces")
      .set("X-Tenant-Id", "tenant-a")
      .set("Authorization", "Bearer viewer-a");

    expect(resAfterDelete.status).toBe(200);
    const realEventsAfter = resAfterDelete.body.filter(
      (e: any) => e.source !== "demo"
    );
    const demoEventsAfter = resAfterDelete.body.filter(
      (e: any) => e.source === "demo"
    );

    expect(realEventsAfter.length).toBe(1); // Real event preserved
    expect(realEventsAfter[0].id).toBe("real-event-a");
    expect(demoEventsAfter.length).toBe(0); // Demo events deleted
  });

  it("should mark all demo events with source=demo", async () => {
    setTestEnv({
      TENANTS_JSON: JSON.stringify({
        "tenant-a": {
          apps: {},
          dashboards: { "viewer-a": true }
        }
      }),
      AUTH_MODE: "strict",
      DEMO_MODE_ENABLED: "true",
      DEMO_MODE_TOKEN: "demo-secret"
    });
    await setupServer();

    // Seed demo data
    await request(app)
      .post("/api/demo-seed")
      .set("X-Tenant-Id", "tenant-a")
      .set("Authorization", "Bearer viewer-a")
      .set("X-Demo-Token", "demo-secret")
      .send({ apps: ["demo-app"] });

    // Verify all demo events have source="demo"
    const res = await request(app)
      .get("/api/traces")
      .set("X-Tenant-Id", "tenant-a")
      .set("Authorization", "Bearer viewer-a");

    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThan(0);

    res.body.forEach((event: any) => {
      expect(event.source).toBe("demo");
      expect(event.tenantId).toBe("tenant-a");
    });
  });
});
