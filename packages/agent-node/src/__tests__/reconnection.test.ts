import { describe, it, expect, vi, beforeEach } from "vitest";
import { EventEmitter } from "node:events";

// Fake Socket: EventEmitter under the hood for inbound events via _fire(),
// but overrides emit() to capture outbound emissions instead of dispatching
// to local listeners (matching socket.io-client's wire semantics).
class FakeSocket extends EventEmitter {
  sentEmissions: Array<{ event: string; args: unknown[] }> = [];
  emit(event: string, ...args: unknown[]): boolean {
    this.sentEmissions.push({ event, args });
    return true;
  }
  _fire(event: string, ...args: unknown[]): boolean {
    return super.emit(event, ...args);
  }
  disconnect(): this {
    return this;
  }
}

const ioMock = vi.fn();

vi.mock("socket.io-client", () => ({
  io: (...args: unknown[]) => ioMock(...args)
}));

// Imported after vi.mock is registered so the mocked `io` is used.
import { SyncFlowAgent } from "../index";

beforeEach(() => {
  ioMock.mockReset();
  ioMock.mockImplementation(() => new FakeSocket());
});

describe("agent reconnection reliability", () => {
  it("configures reconnectionAttempts: Infinity so retries never exhaust", () => {
    const agent = new SyncFlowAgent({
      dashboardUrl: "http://localhost:9",
      appName: "a",
      agentKey: "k",
      tenantId: "local"
    });
    agent.connect();

    expect(ioMock).toHaveBeenCalledTimes(1);
    const [, opts] = ioMock.mock.calls[0] as [string, Record<string, unknown>];
    expect(opts.reconnection).toBe(true);
    expect(opts.reconnectionAttempts).toBe(Infinity);
    // Explicit check that the previous finite cap is not in effect.
    expect(opts.reconnectionAttempts).toBeGreaterThan(5);
  });

  it("re-emits register on every reconnect, including beyond the old 5-attempt cap", () => {
    const agent = new SyncFlowAgent({
      dashboardUrl: "http://localhost:9",
      appName: "my-app",
      agentKey: "k",
      tenantId: "local"
    });
    agent.connect();
    const sock = ioMock.mock.results[0].value as FakeSocket;

    // Simulate 10 consecutive outage/reconnect cycles — well past the old cap.
    for (let i = 0; i < 10; i++) {
      sock._fire("connect");
      sock._fire("disconnect");
    }
    // One final reconnect (settled state).
    sock._fire("connect");

    const registers = sock.sentEmissions.filter((e) => e.event === "register");
    expect(registers.length).toBe(11);
    // Payload shape preserved across all re-registrations.
    for (const r of registers) {
      expect(r.args[0]).toEqual({
        appName: "my-app",
        token: "k",
        tenantId: "local"
      });
    }
  });

  it("resumes telemetry after a reconnect: events drop while disconnected, flow once reconnected", () => {
    const agent = new SyncFlowAgent({
      dashboardUrl: "http://localhost:9",
      appName: "a",
      agentKey: "k",
      tenantId: "local"
    });
    agent.connect();
    const sock = ioMock.mock.results[0].value as FakeSocket;

    // Initial connect establishes the registered + connected state.
    sock._fire("connect");

    // Lose the connection; events emitted now must be dropped.
    sock._fire("disconnect");
    (agent as unknown as {
      emitEvent: (ev: Record<string, unknown>) => void;
    }).emitEvent({
      type: "express",
      operation: "GET /during-outage",
      ts: Date.now(),
      level: "info",
      payload: {}
    });
    expect(
      sock.sentEmissions.filter((e) => e.event === "event").length
    ).toBe(0);

    // Reconnect — register fires again, and new events flow through.
    sock._fire("connect");
    (agent as unknown as {
      emitEvent: (ev: Record<string, unknown>) => void;
    }).emitEvent({
      type: "express",
      operation: "GET /after-reconnect",
      ts: Date.now(),
      level: "info",
      payload: {}
    });

    const eventEmits = sock.sentEmissions.filter((e) => e.event === "event");
    expect(eventEmits.length).toBe(1);
    expect((eventEmits[0].args[0] as { operation: string }).operation).toBe(
      "GET /after-reconnect"
    );
  });
});
