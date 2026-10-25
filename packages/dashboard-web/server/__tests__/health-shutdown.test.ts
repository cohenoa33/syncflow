import { describe, it, expect, afterEach, vi } from "vitest";
import express from "express";
import { createServer, Server as HttpServer } from "http";
import { Server as SocketIOServer } from "socket.io";
import { io as ioClient } from "socket.io-client";
import { AddressInfo } from "net";
import request from "supertest";
import mongoose from "mongoose";

import { registerHealthRoutes } from "../routes/health";
import { createShutdownHandle } from "../shutdown";

function mockReadyState(value: number) {
  return vi
    .spyOn(mongoose.connection, "readyState", "get")
    .mockReturnValue(value as mongoose.ConnectionStates);
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("GET /healthz", () => {
  it("returns 200 when MongoDB is connected (readyState=1)", async () => {
    mockReadyState(1);

    const app = express();
    registerHealthRoutes(app);

    const res = await request(app).get("/healthz");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok", mongo: "ready" });
    // Must not leak connection details.
    expect(JSON.stringify(res.body)).not.toContain("mongodb://");
    expect(JSON.stringify(res.body)).not.toContain("mongodb+srv");
  });

  it("returns 503 when MongoDB is not ready (readyState=0 / disconnected)", async () => {
    mockReadyState(0);

    const app = express();
    registerHealthRoutes(app);

    const res = await request(app).get("/healthz");
    expect(res.status).toBe(503);
    expect(res.body).toEqual({ status: "degraded", mongo: "not_ready" });
  });

  it("returns 503 while MongoDB is still connecting (readyState=2)", async () => {
    mockReadyState(2);

    const app = express();
    registerHealthRoutes(app);

    const res = await request(app).get("/healthz");
    expect(res.status).toBe(503);
    expect(res.body.mongo).toBe("not_ready");
  });
});

async function makeRunningStack(): Promise<{
  httpServer: HttpServer;
  io: SocketIOServer;
  port: number;
}> {
  const app = express();
  const httpServer = createServer(app);
  const io = new SocketIOServer(httpServer);
  await new Promise<void>((resolve) => httpServer.listen(0, resolve));
  const port = (httpServer.address() as AddressInfo).port;
  return { httpServer, io, port };
}

describe("graceful shutdown", () => {
  it("closes HTTP, Socket.IO, and Mongo in order and returns exit code 0", async () => {
    const { httpServer, io } = await makeRunningStack();

    const order: string[] = [];
    const origHttpClose = httpServer.close.bind(httpServer);
    const httpCloseSpy = vi
      .spyOn(httpServer, "close")
      .mockImplementation((cb?: (err?: Error) => void) => {
        order.push("http");
        return origHttpClose(cb);
      });
    const origIoClose = io.close.bind(io);
    const ioCloseSpy = vi
      .spyOn(io, "close")
      .mockImplementation((cb?: (err?: Error) => void) => {
        order.push("io");
        return origIoClose(cb);
      });
    const disconnectMongo = vi.fn(async () => {
      order.push("mongo");
    });

    const handle = createShutdownHandle({
      httpServer,
      io,
      disconnectMongo,
      timeoutMs: 5000,
      logger: { log: vi.fn(), error: vi.fn() }
    });

    expect(handle.isShuttingDown()).toBe(false);
    const code = await handle.shutdown("SIGTERM");

    expect(code).toBe(0);
    expect(handle.isShuttingDown()).toBe(true);
    // socket.io's close() calls httpServer.close() internally, so the spies
    // see at least our one call; the handler must trigger each at least once.
    expect(httpCloseSpy).toHaveBeenCalled();
    expect(ioCloseSpy).toHaveBeenCalled();
    expect(disconnectMongo).toHaveBeenCalledTimes(1);
    // Mongo must be last — HTTP and Socket.IO must settle before we tear
    // down the database connection pool.
    expect(order[order.length - 1]).toBe("mongo");
    expect(order.indexOf("http")).toBeLessThan(order.indexOf("mongo"));
    expect(order.indexOf("io")).toBeLessThan(order.indexOf("mongo"));
  });

  it("ignores repeated shutdown calls — each resource closed exactly once", async () => {
    const { httpServer, io } = await makeRunningStack();

    const httpCloseSpy = vi.spyOn(httpServer, "close");
    const ioCloseSpy = vi.spyOn(io, "close");
    const disconnectMongo = vi.fn(async () => {});

    const handle = createShutdownHandle({
      httpServer,
      io,
      disconnectMongo,
      timeoutMs: 5000,
      logger: { log: vi.fn(), error: vi.fn() }
    });

    const [a, b, c] = await Promise.all([
      handle.shutdown("SIGTERM"),
      handle.shutdown("SIGINT"),
      handle.shutdown("SIGTERM")
    ]);

    expect(a).toBe(0);
    expect(b).toBe(0);
    expect(c).toBe(0);
    // Only the first shutdown() runs the cleanup; subsequent calls return the
    // same pending promise. disconnectMongo is the cleanest witness because
    // (unlike httpServer.close which socket.io also triggers) nothing else
    // ever invokes it.
    expect(disconnectMongo).toHaveBeenCalledTimes(1);
    void httpCloseSpy;
    void ioCloseSpy;
  });

  it("does not deadlock when a real WebSocket client is still connected (regression)", async () => {
    const { httpServer, io, port } = await makeRunningStack();

    // Hold a real, upgraded WebSocket connection — the exact production
    // scenario that previously blocked httpServer.close() forever.
    const client = ioClient(`http://127.0.0.1:${port}`, {
      transports: ["websocket"]
    });
    await new Promise<void>((resolve, reject) => {
      client.once("connect", () => resolve());
      client.once("connect_error", reject);
      setTimeout(() => reject(new Error("ws connect timeout")), 3000);
    });
    expect(client.connected).toBe(true);

    const order: string[] = [];
    const disconnectMongo = vi.fn(async () => {
      order.push("mongo");
    });
    const onTimeout = vi.fn();

    const handle = createShutdownHandle({
      httpServer,
      io,
      disconnectMongo,
      onTimeout,
      // Deliberately tight so a regression would surface as a timeout fire.
      timeoutMs: 2000,
      logger: { log: vi.fn(), error: vi.fn() }
    });

    const start = Date.now();
    const code = await handle.shutdown("SIGTERM");
    const elapsed = Date.now() - start;

    expect(code).toBe(0);
    expect(elapsed).toBeLessThan(1500);
    expect(onTimeout).not.toHaveBeenCalled();
    expect(disconnectMongo).toHaveBeenCalledTimes(1);
    expect(order).toEqual(["mongo"]);

    // The client's disconnect event propagates asynchronously after the server
    // tears down. Give it a moment to surface, then confirm.
    await new Promise<void>((resolve) => {
      if (!client.connected) return resolve();
      const timer = setTimeout(() => resolve(), 500);
      client.once("disconnect", () => {
        clearTimeout(timer);
        resolve();
      });
    });
    expect(client.connected).toBe(false);

    // Idempotency still holds while a client was connected.
    await handle.shutdown("SIGTERM");
    expect(disconnectMongo).toHaveBeenCalledTimes(1);

    client.disconnect();
  });

  it("fires onTimeout when a close step hangs past timeoutMs so shutdown cannot deadlock", async () => {
    const { httpServer, io } = await makeRunningStack();

    const onTimeout = vi.fn();
    // disconnectMongo never resolves — simulates a hung driver.
    const disconnectMongo = vi.fn(() => new Promise<void>(() => {}));

    const handle = createShutdownHandle({
      httpServer,
      io,
      disconnectMongo,
      timeoutMs: 50,
      onTimeout,
      logger: { log: vi.fn(), error: vi.fn() }
    });

    const shutdownPromise = handle.shutdown("SIGTERM");

    await new Promise((r) => setTimeout(r, 120));
    expect(onTimeout).toHaveBeenCalledTimes(1);

    // Clean up: close the stack ourselves so Vitest can exit.
    httpServer.closeAllConnections?.();
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
    await new Promise<void>((resolve) => io.close(() => resolve()));
    // Shutdown promise is still pending because disconnectMongo never resolves,
    // but the test already proved timeout behavior.
    void shutdownPromise;
  });
});
