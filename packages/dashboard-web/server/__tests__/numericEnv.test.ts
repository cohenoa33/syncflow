import { describe, it, expect, afterEach } from "vitest";
import {
  NumericEnvError,
  SPECS,
  readNumericEnv,
  validateNumericConfig,
  type NumericEnvSpec
} from "../config/numericEnv";

const TEST_NAME = "__NUMERIC_ENV_TEST__";

function spec(overrides: Partial<NumericEnvSpec> = {}): NumericEnvSpec {
  return {
    name: TEST_NAME,
    default: 10,
    kind: "int",
    min: 1,
    max: 100,
    ...overrides
  };
}

afterEach(() => {
  delete process.env[TEST_NAME];
  delete process.env.PORT;
  delete process.env.AI_RATE_LIMIT_WINDOW_MS;
  delete process.env.AI_RATE_LIMIT_MAX;
  delete process.env.INSIGHT_TIMEOUT_MS;
  delete process.env.INSIGHT_RETRIES;
});

describe("readNumericEnv — defaults", () => {
  it("returns default when env var is undefined", () => {
    expect(readNumericEnv(spec())).toBe(10);
  });

  it("returns default when env var is empty string", () => {
    process.env[TEST_NAME] = "";
    expect(readNumericEnv(spec())).toBe(10);
  });
});

describe("readNumericEnv — invalid input raises NumericEnvError", () => {
  it("whitespace-only is a misconfiguration, not a default", () => {
    process.env[TEST_NAME] = "   ";
    expect(() => readNumericEnv(spec())).toThrow(NumericEnvError);
  });

  it("tab/newline-only is rejected", () => {
    process.env[TEST_NAME] = "\t\n ";
    expect(() => readNumericEnv(spec())).toThrow(NumericEnvError);
  });

  it("non-numeric text is rejected", () => {
    process.env[TEST_NAME] = "abc";
    expect(() => readNumericEnv(spec())).toThrow(NumericEnvError);
  });

  it("Infinity is rejected", () => {
    process.env[TEST_NAME] = "Infinity";
    expect(() => readNumericEnv(spec())).toThrow(NumericEnvError);
  });

  it("NaN literal is rejected", () => {
    process.env[TEST_NAME] = "NaN";
    expect(() => readNumericEnv(spec())).toThrow(NumericEnvError);
  });

  it("hex literal is rejected", () => {
    process.env[TEST_NAME] = "0x10";
    expect(() => readNumericEnv(spec())).toThrow(NumericEnvError);
  });

  it("int kind rejects decimals", () => {
    process.env[TEST_NAME] = "3.14";
    expect(() => readNumericEnv(spec({ kind: "int" }))).toThrow(NumericEnvError);
  });

  it("float kind accepts decimals", () => {
    process.env[TEST_NAME] = "0.5";
    expect(
      readNumericEnv(spec({ kind: "float", min: 0, max: 1, default: 1 }))
    ).toBe(0.5);
  });

  it("float kind accepts leading dot", () => {
    process.env[TEST_NAME] = ".5";
    expect(
      readNumericEnv(spec({ kind: "float", min: 0, max: 1, default: 1 }))
    ).toBe(0.5);
  });

  it("float kind rejects non-numeric text", () => {
    process.env[TEST_NAME] = "abc";
    expect(() =>
      readNumericEnv(spec({ kind: "float", min: 0, max: 1, default: 1 }))
    ).toThrow(NumericEnvError);
  });
});

describe("readNumericEnv — boundaries", () => {
  it("accepts inclusive lower boundary", () => {
    process.env[TEST_NAME] = "1";
    expect(readNumericEnv(spec({ min: 1, max: 100 }))).toBe(1);
  });

  it("accepts inclusive upper boundary", () => {
    process.env[TEST_NAME] = "100";
    expect(readNumericEnv(spec({ min: 1, max: 100 }))).toBe(100);
  });

  it("rejects value below min", () => {
    process.env[TEST_NAME] = "0";
    expect(() => readNumericEnv(spec({ min: 1, max: 100 }))).toThrow(
      NumericEnvError
    );
  });

  it("rejects value above max", () => {
    process.env[TEST_NAME] = "101";
    expect(() => readNumericEnv(spec({ min: 1, max: 100 }))).toThrow(
      NumericEnvError
    );
  });

  it("rejects negative value when min >= 0", () => {
    process.env[TEST_NAME] = "-1";
    expect(() => readNumericEnv(spec({ min: 0 }))).toThrow(NumericEnvError);
  });

  it("retries=0 is accepted (min: 0)", () => {
    process.env[TEST_NAME] = "0";
    expect(readNumericEnv(spec({ min: 0, max: undefined }))).toBe(0);
  });
});

describe("NumericEnvError messages", () => {
  it("names the variable and the expected constraint; echoes nothing else", () => {
    process.env[TEST_NAME] = "abc";
    try {
      readNumericEnv(spec({ min: 1, max: 100 }));
      expect.fail("expected throw");
    } catch (err) {
      expect(err).toBeInstanceOf(NumericEnvError);
      const msg = (err as Error).message;
      expect(msg).toBe(
        `${TEST_NAME} must be an integer between 1 and 100`
      );
      expect(msg).not.toContain("abc");
    }
  });

  it("min-only constraint phrasing", () => {
    process.env[TEST_NAME] = "0";
    try {
      readNumericEnv(spec({ min: 1, max: undefined }));
      expect.fail("expected throw");
    } catch (err) {
      expect((err as Error).message).toBe(
        `${TEST_NAME} must be an integer >= 1`
      );
    }
  });

  it("max-only constraint phrasing", () => {
    process.env[TEST_NAME] = "10";
    try {
      readNumericEnv(spec({ min: undefined, max: 5 }));
      expect.fail("expected throw");
    } catch (err) {
      expect((err as Error).message).toBe(
        `${TEST_NAME} must be an integer <= 5`
      );
    }
  });

  it("float constraint phrasing", () => {
    process.env[TEST_NAME] = "abc";
    try {
      readNumericEnv(
        spec({ kind: "float", min: 0, max: 1, default: 1 })
      );
      expect.fail("expected throw");
    } catch (err) {
      expect((err as Error).message).toBe(
        `${TEST_NAME} must be an number between 0 and 1`
      );
    }
  });
});

describe("validateNumericConfig", () => {
  it("passes when all vars are unset (defaults apply)", () => {
    expect(() => validateNumericConfig()).not.toThrow();
  });

  it("passes with valid values across all SPECS", () => {
    process.env.PORT = "5050";
    process.env.AI_RATE_LIMIT_WINDOW_MS = "60000";
    process.env.AI_RATE_LIMIT_MAX = "20";
    process.env.INSIGHT_TIMEOUT_MS = "12000";
    process.env.INSIGHT_RETRIES = "0";
    expect(() => validateNumericConfig()).not.toThrow();
  });

  it("fails on bad PORT", () => {
    process.env.PORT = "abc";
    expect(() => validateNumericConfig()).toThrow(NumericEnvError);
  });

  it("fails on PORT above 65535", () => {
    process.env.PORT = "65536";
    expect(() => validateNumericConfig()).toThrow(NumericEnvError);
  });

  it("fails on whitespace-only INSIGHT_RETRIES", () => {
    process.env.INSIGHT_RETRIES = "  ";
    expect(() => validateNumericConfig()).toThrow(NumericEnvError);
  });

  it("fails on AI_RATE_LIMIT_MAX=0", () => {
    process.env.AI_RATE_LIMIT_MAX = "0";
    expect(() => validateNumericConfig()).toThrow(NumericEnvError);
  });
});

describe("SPECS — individual contract", () => {
  it("PORT default is 5050, min 1, max 65535", () => {
    expect(SPECS.PORT.default).toBe(5050);
    expect(SPECS.PORT.min).toBe(1);
    expect(SPECS.PORT.max).toBe(65535);
    expect(SPECS.PORT.kind).toBe("int");
  });

  it("INSIGHT_RETRIES allows 0", () => {
    expect(SPECS.INSIGHT_RETRIES.min).toBe(0);
    process.env.INSIGHT_RETRIES = "0";
    expect(readNumericEnv(SPECS.INSIGHT_RETRIES)).toBe(0);
  });

  it("AI_RATE_LIMIT_MAX requires >= 1", () => {
    expect(SPECS.AI_RATE_LIMIT_MAX.min).toBe(1);
  });
});
