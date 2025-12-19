import { makeTraceId, nowMinus, randId } from "../utils/ids";

export function generateDemoTraces(appName: string) {
  const t1 = makeTraceId();
  const t2 = makeTraceId();
  const t3 = makeTraceId();
  const t4 = makeTraceId();

  const events: any[] = [];

  // Trace 1 – success
  events.push(
    {
      id: randId(),
      traceId: t1,
      appName,
      type: "express",
      operation: "POST /api/users",
      ts: nowMinus(12000),
      durationMs: 32,
      level: "info",
      payload: {
        response: { statusCode: 201, ok: true }
      },
      receivedAt: nowMinus(11980)
    },
    {
      id: randId(),
      traceId: t1,
      appName,
      type: "mongoose",
      operation: "save User",
      ts: nowMinus(11990),
      durationMs: 9,
      level: "info",
      payload: { modelName: "User", operation: "save" },
      receivedAt: nowMinus(11970)
    }
  );

  // Trace 2 – slow
  events.push({
    id: randId(),
    traceId: t2,
    appName,
    type: "express",
    operation: "GET /api/users",
    ts: nowMinus(9000),
    durationMs: 840,
    level: "warn",
    payload: {
      response: { statusCode: 200, ok: true }
    },
    receivedAt: nowMinus(8980)
  });

  // Trace 3 – error
  events.push(
    {
      id: randId(),
      traceId: t3,
      appName,
      type: "express",
      operation: "POST /api/users",
      ts: nowMinus(6000),
      durationMs: 41,
      level: "error",
      payload: {
        response: { statusCode: 400, ok: false }
      },
      receivedAt: nowMinus(5980)
    },
    {
      id: randId(),
      traceId: t3,
      appName,
      type: "mongoose",
      operation: "save User",
      ts: nowMinus(5990),
      durationMs: 12,
      level: "error",
      payload: {
        error:
          "E11000 duplicate key error collection: users index: email_1 dup key"
      },
      receivedAt: nowMinus(5970)
    }
  );

  // Trace 4 – update
  events.push({
    id: randId(),
    traceId: t4,
    appName,
    type: "express",
    operation: "PUT /api/users/:id",
    ts: nowMinus(3000),
    durationMs: 58,
    level: "info",
    payload: {
      response: { statusCode: 200, ok: true }
    },
    receivedAt: nowMinus(2980)
  });

  return events;
}