import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  vi
} from "vitest";
import express from "express";
import { createServer } from "http";
import request from "supertest";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { SyncFlowAgent, sanitize, limitString } from "../index";

// ============================================================
// sanitize
// ============================================================

describe("sanitize", () => {
  it("redacts password, token, authorization, and cookie fields", () => {
    const result = sanitize({
      username: "alice",
      password: "hunter2",
      token: "abc123",
      authorization: "Bearer xyz",
      cookie: "session=s3cr3t"
    });
    expect(result.username).toBe("alice");
    expect(result.password).toBe("[REDACTED]");
    expect(result.token).toBe("[REDACTED]");
    expect(result.authorization).toBe("[REDACTED]");
    expect(result.cookie).toBe("[REDACTED]");
  });

  it("limits depth to 4 — values at depth 5 become [TruncatedDepth]", () => {
    // depth 0: root obj, depth 1: a, depth 2: b, depth 3: c, depth 4: d (object), depth 5: e → truncated
    const deep = { a: { b: { c: { d: { e: "too-deep" } } } } };
    const result = sanitize(deep);
    expect(result.a.b.c.d.e).toBe("[TruncatedDepth]");
  });

  it("handles circular references without throwing", () => {
    const obj: Record<string, unknown> = { name: "test" };
    obj.self = obj;
    expect(() => sanitize(obj)).not.toThrow();
    const result = sanitize(obj);
    expect(result.self).toBe("[Circular]");
  });

  it("preserves non-sensitive string values unchanged", () => {
    const result = sanitize({ greeting: "hello world" });
    expect(result.greeting).toBe("hello world");
  });

  it("handles null and undefined values without throwing", () => {
    expect(() => sanitize(null)).not.toThrow();
    expect(() => sanitize(undefined)).not.toThrow();
    expect(sanitize(null)).toBeNull();
    expect(sanitize(undefined)).toBeUndefined();
  });

  it("passes through primitive (non-object) values unchanged", () => {
    expect(sanitize(42)).toBe(42);
    expect(sanitize("plain string")).toBe("plain string");
    expect(sanitize(true)).toBe(true);
  });

  it("sanitizes array elements and respects sensitive keys inside array objects", () => {
    const arr = [{ user: "bob", password: "secret" }, { user: "alice" }];
    const result = sanitize(arr);
    expect(Array.isArray(result)).toBe(true);
    expect(result[0].password).toBe("[REDACTED]");
    expect(result[0].user).toBe("bob");
    expect(result[1].user).toBe("alice");
  });

  it("key matching is case-insensitive (Authorization header)", () => {
    const result = sanitize({ Authorization: "Bearer token123" });
    expect(result.Authorization).toBe("[REDACTED]");
  });

  it("depth=4 value (plain object) is walked, not truncated", () => {
    // depth 0-4 should all be walked; only depth >4 truncates
    const obj = { a: { b: { c: { d: "ok-at-depth-4" } } } };
    const result = sanitize(obj);
    expect(result.a.b.c.d).toBe("ok-at-depth-4");
  });
});

// ============================================================
// limitString
// ============================================================

describe("limitString", () => {
  it("returns strings shorter than 2000 chars unchanged", () => {
    const s = "a".repeat(100);
    expect(limitString(s)).toBe(s);
  });

  it("returns string of exactly 2000 chars unchanged", () => {
    const s = "x".repeat(2000);
    expect(limitString(s)).toBe(s);
  });

  it("truncates strings longer than 2000 chars and appends marker", () => {
    const s = "x".repeat(2500);
    const result = limitString(s);
    expect(result.length).toBeLessThan(s.length);
    expect(result).toContain("[truncated]");
    expect(result.startsWith("x".repeat(2000))).toBe(true);
  });

  it("custom maxLen is respected", () => {
    const s = "a".repeat(50);
    const result = limitString(s, 20);
    expect(result.startsWith("a".repeat(20))).toBe(true);
    expect(result).toContain("[truncated]");
  });
});

// ============================================================
// instrumentExpress
// ============================================================

describe("instrumentExpress", () => {
  it("emits an event with correct type, operation, durationMs, traceId, and statusCode", async () => {
    const emitted: unknown[] = [];
    const agent = new SyncFlowAgent({ appName: "express-test-app" });
    vi.spyOn(agent as any, "emitEvent").mockImplementation((ev: unknown) => {
      emitted.push(ev as any);
    });

    const app = express();
    agent.instrumentExpress(app);
    app.get("/hello", (_req, res) => res.status(200).json({ ok: true }));

    await request(app).get("/hello");

    expect(emitted).toHaveLength(1);
    const ev = emitted[0] as any;
    expect(ev.type).toBe("express");
    expect(ev.operation).toBe("GET /hello");
    expect(ev.durationMs).toBeTypeOf("number");
    expect(ev.durationMs).toBeGreaterThanOrEqual(0);
    expect(ev.traceId).toBeDefined();
    expect(ev.payload.response.statusCode).toBe(200);
  });

  it("emits level=warn for slow requests (durationMs >= slowMsThreshold)", async () => {
    const emitted: unknown[] = [];
    // Set a very low threshold so the request always qualifies as slow
    const agent = new SyncFlowAgent({ appName: "slow-app", slowMsThreshold: 0 });
    vi.spyOn(agent as any, "emitEvent").mockImplementation((ev: unknown) => {
      emitted.push(ev);
    });

    const app = express();
    agent.instrumentExpress(app);
    app.get("/slow", (_req, res) => res.status(200).json({ ok: true }));

    await request(app).get("/slow");

    expect(emitted).toHaveLength(1);
    expect((emitted[0] as any).level).toBe("warn");
  });

  it("emits level=info for fast requests (durationMs < slowMsThreshold)", async () => {
    const emitted: unknown[] = [];
    const agent = new SyncFlowAgent({ appName: "fast-app", slowMsThreshold: 9999 });
    vi.spyOn(agent as any, "emitEvent").mockImplementation((ev: unknown) => {
      emitted.push(ev);
    });

    const app = express();
    agent.instrumentExpress(app);
    app.get("/fast", (_req, res) => res.json({ ok: true }));

    await request(app).get("/fast");

    expect((emitted[0] as any).level).toBe("info");
  });

  it("sensitive request headers are redacted in the emitted payload", async () => {
    const emitted: unknown[] = [];
    const agent = new SyncFlowAgent({ appName: "security-app" });
    vi.spyOn(agent as any, "emitEvent").mockImplementation((ev: unknown) => {
      emitted.push(ev);
    });

    const app = express();
    agent.instrumentExpress(app);
    app.get("/secure", (_req, res) => res.json({ ok: true }));

    await request(app)
      .get("/secure")
      .set("Authorization", "Bearer super-secret-token")
      .set("Cookie", "session=abc");

    const payload = (emitted[0] as any).payload;
    expect(payload.request.headers.authorization).toBe("[REDACTED]");
    expect(payload.request.headers.cookie).toBe("[REDACTED]");
  });

  it("response statusCode is captured correctly for 4xx responses", async () => {
    const emitted: unknown[] = [];
    const agent = new SyncFlowAgent({ appName: "error-app" });
    vi.spyOn(agent as any, "emitEvent").mockImplementation((ev: unknown) => {
      emitted.push(ev);
    });

    const app = express();
    agent.instrumentExpress(app);
    app.get("/not-found", (_req, res) => res.status(404).json({ error: "not found" }));

    await request(app).get("/not-found");

    expect((emitted[0] as any).payload.response.statusCode).toBe(404);
    expect((emitted[0] as any).payload.response.ok).toBe(false);
  });
});

// ============================================================
// instrumentMongoose
// ============================================================

let mongoServer: MongoMemoryServer;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("instrumentMongoose", () => {
  it("emits a mongoose event with correct operation and modelName after a query", async () => {
    const mongoEvents: unknown[] = [];
    const agent = new SyncFlowAgent({ appName: "db-test-app" });
    vi.spyOn(agent as any, "emitEvent").mockImplementation((ev: unknown) => {
      mongoEvents.push(ev);
    });

    agent.instrumentMongoose(mongoose);

    const WidgetSchema = new mongoose.Schema({ label: String });
    const Widget =
      (mongoose.models["Widget"] as mongoose.Model<{ label: string }>) ||
      mongoose.model("Widget", WidgetSchema);

    await Widget.find({});

    expect(mongoEvents.length).toBeGreaterThan(0);
    const ev = mongoEvents[0] as any;
    expect(ev.type).toBe("mongoose");
    expect(ev.operation).toContain("find");
    expect(ev.payload.modelName).toBe("Widget");
  });
});

// ============================================================
// Distributed tracing
// ============================================================

describe("distributed tracing", () => {
  it("downstream agent reuses the traceId injected via X-Syncflow-Trace-Id header", async () => {
    const downEvents: unknown[] = [];
    const agentDown = new SyncFlowAgent({ appName: "downstream" });
    vi.spyOn(agentDown as any, "emitEvent").mockImplementation((ev: unknown) => {
      downEvents.push(ev);
    });

    const downApp = express();
    agentDown.instrumentExpress(downApp);
    downApp.get("/ping", (_req, res) => res.send("pong"));

    const UPSTREAM_TRACE = "upstream-generated-trace-id-abc123";
    await request(downApp)
      .get("/ping")
      .set("x-syncflow-trace-id", UPSTREAM_TRACE);

    expect(downEvents).toHaveLength(1);
    expect((downEvents[0] as any).traceId).toBe(UPSTREAM_TRACE);
  });

  it("a fresh request without a trace header gets its own generated traceId", async () => {
    const events: unknown[] = [];
    const agent = new SyncFlowAgent({ appName: "fresh" });
    vi.spyOn(agent as any, "emitEvent").mockImplementation((ev: unknown) => {
      events.push(ev);
    });

    const app = express();
    agent.instrumentExpress(app);
    app.get("/ping", (_req, res) => res.send("pong"));

    await request(app).get("/ping");
    await request(app).get("/ping");

    expect(events).toHaveLength(2);
    const id1 = (events[0] as any).traceId;
    const id2 = (events[1] as any).traceId;
    expect(id1).toBeDefined();
    expect(id2).toBeDefined();
    // Each request should get a unique traceId
    expect(id1).not.toBe(id2);
  });

  it("upstream agent injects its ALS traceId into outgoing HTTP requests", async () => {
    const upEvents: unknown[] = [];
    const downEvents: unknown[] = [];

    const agentUp = new SyncFlowAgent({ appName: "upstream" });
    vi.spyOn(agentUp as any, "emitEvent").mockImplementation((ev: unknown) => {
      upEvents.push(ev);
    });

    const agentDown = new SyncFlowAgent({ appName: "downstream" });
    vi.spyOn(agentDown as any, "emitEvent").mockImplementation((ev: unknown) => {
      downEvents.push(ev);
    });

    // Downstream server (needs a real port so the upstream can HTTP-connect to it)
    const downApp = express();
    agentDown.instrumentExpress(downApp);
    downApp.get("/ping", (_req, res) => res.send("pong"));
    const downServer = createServer(downApp);
    await new Promise<void>((resolve) => downServer.listen(0, resolve));
    const downPort = (downServer.address() as any).port as number;

    // Upstream app — instrumentHttp patches http.request so the outgoing call
    // carries the ALS-stored traceId in the x-syncflow-trace-id header.
    const upApp = express();
    agentUp.instrumentExpress(upApp);
    agentUp.instrumentHttp();
    upApp.get("/start", (_req, res) => {
      // http.get uses a local `request` closure, not exports.request, so the
      // instrumentHttp patch (which replaces exports.request) wouldn't fire
      // via http.get. Call exports.request directly to go through the patch.
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const httpCjs = require("node:http") as typeof import("http");
      const req = httpCjs.request(
        { hostname: "127.0.0.1", port: downPort, path: "/ping" },
        (r) => {
          r.resume();
          r.on("end", () => res.send("done"));
        }
      );
      req.end();
    });

    await request(upApp).get("/start");
    // Give the downstream request a moment to complete
    await new Promise((r) => setTimeout(r, 150));

    expect(upEvents).toHaveLength(1);
    expect(downEvents).toHaveLength(1);

    const upTrace = (upEvents[0] as any).traceId;
    const downTrace = (downEvents[0] as any).traceId;
    expect(upTrace).toBeDefined();
    expect(upTrace).toBe(downTrace);

    await new Promise<void>((r) => downServer.close(() => r()));
  });
});
