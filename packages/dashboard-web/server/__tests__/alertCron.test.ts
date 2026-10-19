import { describe, it, expect, afterEach } from "vitest";
import {
  AlertCronError,
  DEFAULT_ALERT_EVAL_CRON,
  readAlertEvalCron,
  validateAlertCronConfig
} from "../config/alertCron";

const ENV_NAME = "ALERT_EVAL_CRON";

afterEach(() => {
  delete process.env[ENV_NAME];
});

describe("readAlertEvalCron — defaults", () => {
  it("returns the default when env var is unset", () => {
    expect(readAlertEvalCron()).toBe(DEFAULT_ALERT_EVAL_CRON);
  });
});

describe("readAlertEvalCron — valid expressions", () => {
  it("returns a valid custom expression unchanged", () => {
    process.env[ENV_NAME] = "*/10 * * * *";
    expect(readAlertEvalCron()).toBe("*/10 * * * *");
  });

  it("accepts the default expression explicitly", () => {
    process.env[ENV_NAME] = DEFAULT_ALERT_EVAL_CRON;
    expect(readAlertEvalCron()).toBe(DEFAULT_ALERT_EVAL_CRON);
  });

  it("accepts a 6-field (with seconds) expression supported by node-cron", () => {
    process.env[ENV_NAME] = "0 */5 * * * *";
    expect(readAlertEvalCron()).toBe("0 */5 * * * *");
  });
});

describe("readAlertEvalCron — rejected inputs", () => {
  it("rejects empty string", () => {
    process.env[ENV_NAME] = "";
    expect(() => readAlertEvalCron()).toThrow(AlertCronError);
  });

  it("rejects whitespace-only value", () => {
    process.env[ENV_NAME] = "   ";
    expect(() => readAlertEvalCron()).toThrow(AlertCronError);
  });

  it("rejects tab/newline-only value", () => {
    process.env[ENV_NAME] = "\t\n ";
    expect(() => readAlertEvalCron()).toThrow(AlertCronError);
  });

  it("rejects a non-cron string", () => {
    process.env[ENV_NAME] = "not-a-cron";
    expect(() => readAlertEvalCron()).toThrow(AlertCronError);
  });

  it("rejects a malformed expression", () => {
    process.env[ENV_NAME] = "* * *";
    expect(() => readAlertEvalCron()).toThrow(AlertCronError);
  });

  it("rejects an out-of-range field", () => {
    process.env[ENV_NAME] = "99 * * * *";
    expect(() => readAlertEvalCron()).toThrow(AlertCronError);
  });
});

describe("readAlertEvalCron — error message safety", () => {
  it("names ALERT_EVAL_CRON without echoing the supplied value", () => {
    const secret = "totally-bogus-secret-looking-value";
    process.env[ENV_NAME] = secret;

    try {
      readAlertEvalCron();
      throw new Error("expected readAlertEvalCron to throw");
    } catch (err) {
      expect(err).toBeInstanceOf(AlertCronError);
      const message = (err as Error).message;
      expect(message).toContain("ALERT_EVAL_CRON");
      expect(message).not.toContain(secret);
    }
  });

  it("does not echo whitespace-only input", () => {
    process.env[ENV_NAME] = "   ";
    try {
      readAlertEvalCron();
      throw new Error("expected readAlertEvalCron to throw");
    } catch (err) {
      expect(err).toBeInstanceOf(AlertCronError);
      expect((err as Error).message).toContain("ALERT_EVAL_CRON");
    }
  });
});

describe("validateAlertCronConfig", () => {
  it("returns void when env var is unset", () => {
    expect(() => validateAlertCronConfig()).not.toThrow();
  });

  it("returns void when env var is a valid expression", () => {
    process.env[ENV_NAME] = "0 * * * *";
    expect(() => validateAlertCronConfig()).not.toThrow();
  });

  it("throws AlertCronError when env var is invalid", () => {
    process.env[ENV_NAME] = "not-a-cron";
    expect(() => validateAlertCronConfig()).toThrow(AlertCronError);
  });

  it("throws AlertCronError when env var is empty", () => {
    process.env[ENV_NAME] = "";
    expect(() => validateAlertCronConfig()).toThrow(AlertCronError);
  });
});
