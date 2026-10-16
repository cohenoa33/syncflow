export class NumericEnvError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NumericEnvError";
  }
}

export type NumericEnvSpec = {
  name: string;
  default: number;
  kind: "int" | "float";
  min?: number;
  max?: number;
};

const INT_RE = /^-?\d+$/;
const FLOAT_RE = /^-?(?:\d+\.?\d*|\.\d+)$/;

function describeConstraint(spec: NumericEnvSpec): string {
  const type = spec.kind === "int" ? "integer" : "number";
  if (spec.min !== undefined && spec.max !== undefined) {
    return `${type} between ${spec.min} and ${spec.max}`;
  }
  if (spec.min !== undefined) return `${type} >= ${spec.min}`;
  if (spec.max !== undefined) return `${type} <= ${spec.max}`;
  return type;
}

function invalid(spec: NumericEnvSpec): never {
  throw new NumericEnvError(
    `${spec.name} must be an ${describeConstraint(spec)}`
  );
}

export function readNumericEnv(spec: NumericEnvSpec): number {
  const raw = process.env[spec.name];
  if (raw === undefined || raw === "") return spec.default;
  // Whitespace-only is a misconfiguration (accidental quoting), not a default.
  if (raw.trim() === "") invalid(spec);

  const re = spec.kind === "int" ? INT_RE : FLOAT_RE;
  if (!re.test(raw)) invalid(spec);

  const n = Number(raw);
  if (!Number.isFinite(n)) invalid(spec);
  if (spec.min !== undefined && n < spec.min) invalid(spec);
  if (spec.max !== undefined && n > spec.max) invalid(spec);

  return n;
}

export const SPECS = {
  PORT: {
    name: "PORT",
    default: 5050,
    kind: "int",
    min: 1,
    max: 65535
  },
  AI_RATE_LIMIT_WINDOW_MS: {
    name: "AI_RATE_LIMIT_WINDOW_MS",
    default: 60_000,
    kind: "int",
    min: 1
  },
  AI_RATE_LIMIT_MAX: {
    name: "AI_RATE_LIMIT_MAX",
    default: 20,
    kind: "int",
    min: 1
  },
  INSIGHT_TIMEOUT_MS: {
    name: "INSIGHT_TIMEOUT_MS",
    default: 12_000,
    kind: "int",
    min: 1
  },
  INSIGHT_RETRIES: {
    name: "INSIGHT_RETRIES",
    default: 2,
    kind: "int",
    min: 0
  }
} satisfies Record<string, NumericEnvSpec>;

export function validateNumericConfig(): void {
  for (const spec of Object.values(SPECS)) {
    readNumericEnv(spec);
  }
}
