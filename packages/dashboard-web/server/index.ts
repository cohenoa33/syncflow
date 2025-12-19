// packages/dashboard-web/server/index.ts
import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import cors from "cors";
import { fileURLToPath } from "url";
import mongoose from "mongoose";
import { buildInsightForTrace } from "./insights";
import path from "path";


/* -----------------------------
   Mongo
----------------------------- */

const MONGODB_URI =
  process.env.MONGODB_URI || "mongodb://localhost:27017/syncflow-dashboard";

mongoose
  .connect(MONGODB_URI)
  .then(() => console.log("[Dashboard] ✅ Mongo connected"))
  .catch((err) => console.error("[Dashboard] ❌ Mongo error", err));

const EventSchema = new mongoose.Schema(
  {
    id: { type: String, required: true, index: true },
    traceId: { type: String, index: true },
    appName: { type: String, index: true },
    type: { type: String, required: true },
    operation: { type: String, required: true },
    ts: { type: Number, required: true, index: true },
    durationMs: Number,
    level: String,
    payload: mongoose.Schema.Types.Mixed,
    receivedAt: Number
  },
  { timestamps: true }
);

const EventModel = mongoose.model("SyncFlowEvent", EventSchema);
const InsightSchema = new mongoose.Schema(
  {
    traceId: { type: String, required: true, unique: true, index: true },
    insight: mongoose.Schema.Types.Mixed,
    computedAt: { type: Number, required: true, index: true }
  },
  { timestamps: true }
);

const InsightModel = mongoose.model("SyncFlowInsight", InsightSchema);

/* -----------------------------
   Helpers
----------------------------- */

function randId() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function makeTraceId() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function nowMinus(ms: number) {
  return Date.now() - ms;
}

/* -----------------------------
   Demo seed
----------------------------- */

function generateDemoTraces(appName: string) {
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

/* -----------------------------
   Server setup
----------------------------- */

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json());

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: "*", methods: ["GET", "POST"] }
});

// In-memory buffer (live only)
const events: any[] = [];
const connectedAgents = new Map<string, any>();

/* -----------------------------
   Socket.IO
----------------------------- */

io.on("connection", (socket) => {
  console.log("[Dashboard] Client connected:", socket.id);

  socket.on("register", (data) => {
    connectedAgents.set(socket.id, {
      appName: data.appName,
      socketId: socket.id
    });
    io.emit("agents", Array.from(connectedAgents.values()));
  });

  socket.on("event", async (data) => {
    const evt = {
      ...data,
      id: data.id ?? randId(),
      receivedAt: Date.now()
    };

    events.push(evt);
    if (events.length > 1000) events.shift();

    EventModel.create(evt).catch((err) =>
      console.error("[Dashboard] Mongo save failed", err)
    );

    io.emit("event", evt);
  });

  socket.on("disconnect", () => {
    connectedAgents.delete(socket.id);
    io.emit("agents", Array.from(connectedAgents.values()));
  });
});

/* -----------------------------
   REST API
----------------------------- */

// Load history
app.get("/api/traces", async (_req, res) => {
  const latest = await EventModel.find().sort({ ts: -1 }).limit(1000).lean();
  res.json(latest);
});

// Clear everything
app.delete("/api/traces", async (_req, res) => {
  await EventModel.deleteMany({});
  await InsightModel.deleteMany({});
  events.length = 0;

  io.emit("eventHistory", []); // 🔥 force-clear all dashboards

  console.log("[Dashboard] Cleared all traces");
  res.json({ ok: true });
});

// Demo seed (manual)
app.post("/api/demo-seed", async (req, res) => {
  try {
    const apps =
      Array.isArray(req.body?.apps) && req.body.apps.length > 0
        ? req.body.apps
        : ["mern-sample-app"];

    const all: any[] = [];
    const traceIdsByApp: Record<string, string[]> = {};

    for (const appName of apps) {
      const seeded = generateDemoTraces(appName);
      all.push(...seeded);
      traceIdsByApp[appName] = Array.from(
        new Set(seeded.map((e) => e.traceId).filter(Boolean))
      );
    }

    // 1) persist
    await EventModel.insertMany(all);

    // 2) in-memory buffer
    for (const e of all) events.push(e);
    while (events.length > 1000) events.shift();

    // 3) broadcast
    for (const e of all) io.emit("event", e);

    console.log(`[Dashboard] Seeded demo traces: ${all.length} events`);
    res.json({ ok: true, count: all.length, traceIdsByApp });
  } catch (err) {
    console.error("[Dashboard] Failed to seed demo traces", err);
    res.status(500).json({ ok: false });
  }
});
  const INSIGHT_TTL_MS = 1000 * 60 * 60; // 1 hour 

  app.get("/api/insights/:traceId", async (req, res) => {
  try {
    const traceId = req.params.traceId;

    // 1) try cache
    const cached = await InsightModel.findOne({ traceId }).lean();
    const fresh =
      cached?.computedAt && Date.now() - cached.computedAt < INSIGHT_TTL_MS;

    if (cached?.insight && fresh) {
      return res.json({ ok: true, insight: cached.insight, cached: true });
    }

    // 2) compute (from events)
    const traceEvents = await EventModel.find({ traceId })
      .sort({ ts: 1 })
      .lean();

    if (traceEvents.length === 0) {
      return res.status(404).json({
        ok: false,
        error: "TRACE_NOT_FOUND",
        message: `No events found for traceId=${traceId}`
      });
    }

const insight = await buildInsightForTrace(traceId, traceEvents as any, {
  allowFallback: true
});
    // 3) upsert cache
    await InsightModel.updateOne(
      { traceId },
      { $set: { traceId, insight, computedAt: Date.now() } },
      { upsert: true }
    );

    return res.json({ ok: true, insight, cached: false });
  } catch (err) {
    console.error("[Dashboard] Failed to build insight", err);
    res.status(500).json({ ok: false });
  }
});

app.post("/api/insights/:traceId/regenerate", async (req, res) => {
  try {
    const traceId = req.params.traceId;

    const traceEvents = await EventModel.find({ traceId })
      .sort({ ts: 1 })
      .lean();

    if (traceEvents.length === 0) {
      return res.status(404).json({
        ok: false,
        error: "TRACE_NOT_FOUND",
        message: `No events found for traceId=${traceId}`
      });
    }
    const insight = await buildInsightForTrace(traceId, traceEvents as any, {
      allowFallback: false
    });
    await InsightModel.updateOne(
      { traceId },
      { $set: { traceId, insight, computedAt: Date.now() } },
      { upsert: true }
    );

    res.json({ ok: true, insight });
  } catch (err: any) {
    console.error("[Dashboard] Failed to regenerate insight", err);

    res.status(503).json({
      ok: false,
      error: "AI_INSIGHT_FAILED",
      message: err?.message ?? "Failed to regenerate insight"
    });
  }
});
/* -----------------------------
   Static UI (production)
----------------------------- */

const distPath = path.resolve(__dirname, "../dist");
app.use(express.static(distPath));

app.get("*", (_req, res) => {
  res.sendFile(path.join(distPath, "index.html"));
});

/* -----------------------------
   Start
----------------------------- */

const PORT = Number(process.env.PORT || 5050);

httpServer.listen(PORT, () => {


  console.log(`[Dashboard] running on port ${PORT}`);
});
