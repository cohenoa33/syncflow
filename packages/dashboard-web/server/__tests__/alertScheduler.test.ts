import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const scheduleMock = vi.fn();

vi.mock("node-cron", () => ({
  default: {
    schedule: scheduleMock,
    validate: (expr: string) => /^[\d*/,\-\s]+$/.test(expr)
  }
}));

const ENV_NAME = "ALERT_EVAL_CRON";

beforeEach(() => {
  scheduleMock.mockReset();
  delete process.env[ENV_NAME];
});

afterEach(() => {
  delete process.env[ENV_NAME];
});

describe("startAlertEvaluator — scheduler wiring", () => {
  it("schedules with the default expression when env is unset", async () => {
    const { startAlertEvaluator } = await import("../alerts/evaluator");
    startAlertEvaluator({ to: () => ({ emit: () => {} }) } as any);

    expect(scheduleMock).toHaveBeenCalledTimes(1);
    expect(scheduleMock.mock.calls[0][0]).toBe("*/5 * * * *");
    expect(typeof scheduleMock.mock.calls[0][1]).toBe("function");
  });

  it("schedules with the configured expression when ALERT_EVAL_CRON is set", async () => {
    process.env[ENV_NAME] = "*/10 * * * *";
    const { startAlertEvaluator } = await import("../alerts/evaluator");
    startAlertEvaluator({ to: () => ({ emit: () => {} }) } as any);

    expect(scheduleMock).toHaveBeenCalledWith(
      "*/10 * * * *",
      expect.any(Function)
    );
  });
});

describe("startAlertCleanup — scheduler wiring", () => {
  it("schedules the daily cleanup at 02:00", async () => {
    const { startAlertCleanup } = await import("../alerts/cleanup");
    startAlertCleanup();

    expect(scheduleMock).toHaveBeenCalledTimes(1);
    expect(scheduleMock.mock.calls[0][0]).toBe("0 2 * * *");
    expect(typeof scheduleMock.mock.calls[0][1]).toBe("function");
  });
});
