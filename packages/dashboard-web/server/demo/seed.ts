import { makeTraceId, nowMinus, randId } from "../utils/ids";

type DemoEvent = {
  id: string;
  traceId: string;
  appName: string;
  type: "express" | "mongoose" | "error";
  operation: string;
  ts: number;
  durationMs?: number;
  level: "info" | "warn" | "error";
  payload: any;
  receivedAt: number;
};

function pickUnique<T>(arr: T[], n: number) {
  const copy = [...arr];
  // Fisher–Yates shuffle (partial)
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, Math.max(0, Math.min(n, copy.length)));
}

export function generateDemoTraces(appName: string): DemoEvent[] {
  const seeds: DemoEvent[][] = [];

  // Seed 1 — POST users success (express + mongoose)
  {
    const t = makeTraceId();
    seeds.push([
      {
        id: randId(),
        traceId: t,
        appName,
        type: "express",
        operation: "POST /api/users",
        ts: nowMinus(12_000),
        durationMs: 32,
        level: "info",
        payload: { response: { statusCode: 201, ok: true } },
        receivedAt: nowMinus(11_980)
      },
      {
        id: randId(),
        traceId: t,
        appName,
        type: "mongoose",
        operation: "save User",
        ts: nowMinus(11_990),
        durationMs: 9,
        level: "info",
        payload: { modelName: "User", operation: "save" },
        receivedAt: nowMinus(11_970)
      }
    ]);
  }

  // Seed 2 — GET users slow (express only)
  {
    const t = makeTraceId();
    seeds.push([
      {
        id: randId(),
        traceId: t,
        appName,
        type: "express",
        operation: "GET /api/users",
        ts: nowMinus(9_000),
        durationMs: 840,
        level: "warn",
        payload: { response: { statusCode: 200, ok: true } },
        receivedAt: nowMinus(8_980)
      }
    ]);
  }

  // Seed 3 — duplicate email error (express + mongoose error)
  {
    const t = makeTraceId();
    seeds.push([
      {
        id: randId(),
        traceId: t,
        appName,
        type: "express",
        operation: "POST /api/users",
        ts: nowMinus(6_000),
        durationMs: 41,
        level: "error",
        payload: { response: { statusCode: 400, ok: false } },
        receivedAt: nowMinus(5_980)
      },
      {
        id: randId(),
        traceId: t,
        appName,
        type: "mongoose",
        operation: "save User",
        ts: nowMinus(5_990),
        durationMs: 12,
        level: "error",
        payload: {
          error:
            "E11000 duplicate key error collection: users index: email_1 dup key"
        },
        receivedAt: nowMinus(5_970)
      }
    ]);
  }

  // Seed 4 — update user (express only)
  {
    const t = makeTraceId();
    seeds.push([
      {
        id: randId(),
        traceId: t,
        appName,
        type: "express",
        operation: "PUT /api/users/:id",
        ts: nowMinus(3_000),
        durationMs: 58,
        level: "info",
        payload: { response: { statusCode: 200, ok: true } },
        receivedAt: nowMinus(2_980)
      }
    ]);
  }

  // Seed 5 — GET user by id (express + mongoose findOne)
  {
    const t = makeTraceId();
    seeds.push([
      {
        id: randId(),
        traceId: t,
        appName,
        type: "mongoose",
        operation: "findOne User",
        ts: nowMinus(7_200),
        durationMs: 14,
        level: "info",
        payload: {
          modelName: "User",
          operation: "findOne",
          filter: { _id: "[ObjectId]" }
        },
        receivedAt: nowMinus(7_180)
      },
      {
        id: randId(),
        traceId: t,
        appName,
        type: "express",
        operation: "GET /api/users/:id",
        ts: nowMinus(7_190),
        durationMs: 29,
        level: "info",
        payload: { response: { statusCode: 200, ok: true } },
        receivedAt: nowMinus(7_170)
      }
    ]);
  }

  // Seed 6 — delete user (express + mongoose deleteOne)
  {
    const t = makeTraceId();
    seeds.push([
      {
        id: randId(),
        traceId: t,
        appName,
        type: "mongoose",
        operation: "deleteOne User",
        ts: nowMinus(4_400),
        durationMs: 18,
        level: "info",
        payload: { modelName: "User", operation: "deleteOne" },
        receivedAt: nowMinus(4_380)
      },
      {
        id: randId(),
        traceId: t,
        appName,
        type: "express",
        operation: "DELETE /api/users/:id",
        ts: nowMinus(4_390),
        durationMs: 35,
        level: "info",
        payload: { response: { statusCode: 200, ok: true } },
        receivedAt: nowMinus(4_370)
      }
    ]);
  }

  // Seed 7 — updateMany slow-ish (mongoose only)
  {
    const t = makeTraceId();
    seeds.push([
      {
        id: randId(),
        traceId: t,
        appName,
        type: "mongoose",
        operation: "updateMany User",
        ts: nowMinus(10_200),
        durationMs: 420,
        level: "warn",
        payload: {
          modelName: "User",
          operation: "updateMany",
          update: { $set: { flag: true } }
        },
        receivedAt: nowMinus(10_180)
      }
    ]);
  }

  // Seed 8 — 500 error route (express error only)
  {
    const t = makeTraceId();
    seeds.push([
      {
        id: randId(),
        traceId: t,
        appName,
        type: "express",
        operation: "GET /api/users",
        ts: nowMinus(5_200),
        durationMs: 12,
        level: "error",
        payload: { response: { statusCode: 500, ok: false } },
        receivedAt: nowMinus(5_180)
      }
    ]);
  }

  // Seed 9 — find + then update (mongoose only, 2 events)
  {
    const t = makeTraceId();
    seeds.push([
      {
        id: randId(),
        traceId: t,
        appName,
        type: "mongoose",
        operation: "find User",
        ts: nowMinus(8_400),
        durationMs: 22,
        level: "info",
        payload: { modelName: "User", operation: "find" },
        receivedAt: nowMinus(8_380)
      },
      {
        id: randId(),
        traceId: t,
        appName,
        type: "mongoose",
        operation: "findOneAndUpdate User",
        ts: nowMinus(8_360),
        durationMs: 31,
        level: "info",
        payload: { modelName: "User", operation: "findOneAndUpdate" },
        receivedAt: nowMinus(8_340)
      }
    ]);
  }

  // Seed 10 — validation error (mongoose error only)
  {
    const t = makeTraceId();
    seeds.push([
      {
        id: randId(),
        traceId: t,
        appName,
        type: "mongoose",
        operation: "save User",
        ts: nowMinus(2_200),
        durationMs: 7,
        level: "error",
        payload: { error: "ValidationError: email is required" },
        receivedAt: nowMinus(2_180)
      }
    ]);
  }

  // Return 5–6 events total by sampling seed groups (each group is 1–2 events).
  const targetEvents = Math.random() < 0.5 ? 5 : 6;

  let chosen: DemoEvent[] = [];
  let foundExact = false;
  // try up to a few times to hit the chosen target number of events without overthinking
  for (let tries = 0; tries < 20 && !foundExact; tries++) {
    // Each group has at least 1 event, so we never need to pick more groups than targetEvents.
    const maxGroups = Math.min(seeds.length, targetEvents);
    for (let groupsToPick = 1; groupsToPick <= maxGroups; groupsToPick++) {
      const groups = pickUnique(seeds, groupsToPick).flat();
      if (groups.length === targetEvents) {
        chosen = groups;
        foundExact = true;
        break;
      }
    }
    // Fallback: if we couldn't hit targetEvents exactly, build the best-fit group set.
    if (!foundExact) {
      const shuffledGroups = pickUnique(seeds, seeds.length);
      const out: DemoEvent[] = [];
      for (const g of shuffledGroups) {
        if (out.length >= targetEvents) break;
        if (out.length + g.length > targetEvents) continue;
        out.push(...g);
      }
      if (out.length > 0) {
        chosen = out;
        break;
      }
    }
  }
  // Keep ordering consistent within each trace
  chosen.sort((a, b) => a.ts - b.ts);
  return chosen;
}
