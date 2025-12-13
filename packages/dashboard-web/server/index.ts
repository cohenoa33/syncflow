import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import mongoose from "mongoose";

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
function randId() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function makeTraceId() {
  // simple uuid-ish without adding deps (fine for demo)
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function nowMinus(ms: number) {
  return Date.now() - ms;
}

function generateDemoTraces() {
const appName = "mern-sample-app";

  // build 4 traces with nice variety
  const t1 = makeTraceId(); // success create user
  const t2 = makeTraceId(); // slow list users
  const t3 = makeTraceId(); // error duplicate email
  const t4 = makeTraceId(); // ok update user

  const eventsToInsert: any[] = [];

  // ---- Trace 1: POST /api/users (201) + mongoose save
  eventsToInsert.push(
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
        request: {
          method: "POST",
          path: "/api/users",
          params: {},
          query: {},
          body: { name: "John", email: "john+demo@test.com" },
          headers: {
            "content-type": "application/json",
            authorization: "[REDACTED]"
          },
          ip: "127.0.0.1",
          userAgent: "demo-seed"
        },
        response: { statusCode: 201, ok: true, contentLength: 128 }
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
      payload: {
        modelName: "User",
        collection: "users",
        operation: "save",
        kind: "write",
        docId: "6939a5cba853cdd5ec951a7a"
      },
      receivedAt: nowMinus(11970)
    }
  );

  // ---- Trace 2: GET /api/users (200) + mongoose find (slow)
  eventsToInsert.push(
    {
      id: randId(),
      traceId: t2,
      appName,
      type: "express",
      operation: "GET /api/users",
      ts: nowMinus(9000),
      durationMs: 840,
      level: "warn",
      payload: {
        request: {
          method: "GET",
          path: "/api/users",
          params: {},
          query: { page: "1" },
          body: {},
          headers: { accept: "*/*" },
          ip: "127.0.0.1",
          userAgent: "demo-seed"
        },
        response: { statusCode: 200, ok: true, contentLength: 420 }
      },
      receivedAt: nowMinus(8980)
    },
    {
      id: randId(),
      traceId: t2,
      appName,
      type: "mongoose",
      operation: "find User",
      ts: nowMinus(8990),
      durationMs: 610,
      level: "warn",
      payload: {
        modelName: "User",
        collection: "users",
        operation: "find",
        kind: "read",
        filter: { active: true }
      },
      receivedAt: nowMinus(8970)
    }
  );

  // ---- Trace 3: POST /api/users (400) + mongoose save error
  eventsToInsert.push(
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
        request: {
          method: "POST",
          path: "/api/users",
          params: {},
          query: {},
          body: { name: "John", email: "dup@test.com" },
          headers: { "content-type": "application/json" },
          ip: "127.0.0.1",
          userAgent: "demo-seed"
        },
        response: { statusCode: 400, ok: false, contentLength: 96 }
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
        modelName: "User",
        collection: "users",
        operation: "save",
        kind: "write",
        error:
          "E11000 duplicate key error collection: users index: email_1 dup key"
      },
      receivedAt: nowMinus(5970)
    }
  );

  // ---- Trace 4: PUT /api/users/:id (200) + mongoose update
  eventsToInsert.push(
    {
      id: randId(),
      traceId: t4,
      appName,
      type: "express",
      operation: "PUT /api/users/:id",
      ts: nowMinus(3000),
      durationMs: 58,
      level: "info",
      payload: {
        request: {
          method: "PUT",
          path: "/api/users/6939a5cba853cdd5ec951a7a",
          params: { id: "6939a5cba853cdd5ec951a7a" },
          query: {},
          body: { name: "John Updated" },
          headers: { "content-type": "application/json" },
          ip: "127.0.0.1",
          userAgent: "demo-seed"
        },
        response: { statusCode: 200, ok: true, contentLength: 156 }
      },
      receivedAt: nowMinus(2980)
    },
    {
      id: randId(),
      traceId: t4,
      appName,
      type: "mongoose",
      operation: "findOneAndUpdate User",
      ts: nowMinus(2990),
      durationMs: 18,
      level: "info",
      payload: {
        modelName: "User",
        collection: "users",
        operation: "findOneAndUpdate",
        kind: "write",
        filter: { _id: "6939a5cba853cdd5ec951a7a" },
        update: { $set: { name: "John Updated" } }
      },
      receivedAt: nowMinus(2970)
    }
  );

  return eventsToInsert;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
app.use(
  cors({
    origin: "*",
    methods: ["GET", "POST", "DELETE", "OPTIONS"]
  })
);
app.use(express.json());
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
});

// Store connected agents and clients
const connectedAgents = new Map<string, any>();
const events: any[] = [];

io.on("connection", (socket) => {
  console.log("[Dashboard] Client connected:", socket.id);

  socket.on("register", (data) => {
    const { appName } = data;
    console.log("[Dashboard] Agent registered:", appName);
    connectedAgents.set(socket.id, { appName, socketId: socket.id });
    io.emit("agents", Array.from(connectedAgents.values()));
  });

  // ✅ Handle events from agents
  socket.on("event", (data) => {
    console.log("[Dashboard] Event received:", data.operation);

    // ✅ Build the event object FIRST
    const evt = {
      ...data,
      id: data.id ?? `${Date.now()}-${Math.random()}`,
      receivedAt: Date.now()
    };

    // Keep last 1000 in memory
    events.push(evt);
    if (events.length > 1000) events.shift();

    // ✅ Persist to Mongo
    EventModel.create(evt).catch((err) =>
      console.error("[Dashboard] Failed saving event", err)
    );

    // Broadcast to clients
    io.emit("event", evt);
  });

  socket.on("getEvents", () => {
    socket.emit("eventHistory", events);
  });

  socket.on("disconnect", () => {
    console.log("[Dashboard] Client disconnected:", socket.id);
    connectedAgents.delete(socket.id);
    io.emit("agents", Array.from(connectedAgents.values()));
  });
});

const PORT = Number(process.env.PORT || 5050);

// Get latest traces (grouped)
app.get("/api/traces", async (_req, res) => {
  const latest = await EventModel.find()
    .sort({ ts: -1 })
    .limit(1000)
    .lean();

  res.json(latest);
});

// Get a single trace by traceId
app.get("/api/traces/:traceId", async (req, res) => {
  const traceId = req.params.traceId;
  const traceEvents = await EventModel.find({ traceId })
    .sort({ ts: 1 })
    .lean();

  res.json(traceEvents);
});


app.delete("/api/traces", async (_req, res) => {
  try {
    // delete from Mongo
    await EventModel.deleteMany({});
    // clear in-memory buffer too
    events.length = 0;

    console.log("[Dashboard] Cleared all traces");
    res.json({ ok: true });
  } catch (err) {
    console.error("[Dashboard] Failed to clear traces", err);
    res.status(500).json({ ok: false });
  }
});

app.post("/api/demo-seed", async (_req, res) => {
  try {
    const seeded = generateDemoTraces();

    // 1) persist
    await EventModel.insertMany(seeded);

    // 2) update in-memory buffer + keep it capped
    for (const e of seeded) events.push(e);
    while (events.length > 1000) events.shift();

    // 3) broadcast to connected dashboards (so UI updates instantly)
    for (const e of seeded) io.emit("event", e);

    console.log(`[Dashboard] Seeded demo traces: ${seeded.length} events`);
   const traceIds = Array.from(
     new Set(seeded.map((e) => e.traceId).filter(Boolean))
   );

   res.json({ ok: true, count: seeded.length, traceIds });
  } catch (err) {
    console.error("[Dashboard] Failed to seed demo traces", err);
    res.status(500).json({ ok: false });
  }
});
// Serve built dashboard UI (production)
const distPath = path.resolve(__dirname, "../dist");
app.use(express.static(distPath));

// SPA fallback (so /route works)
app.get("*", (_req, res) => {
  res.sendFile(path.join(distPath, "index.html"));
});

httpServer.listen(PORT, () => {
  console.log(`[Dashboard] Socket.IO server running on port ${PORT}`);
  console.log(`[Dashboard] Dashboard UI available at http://localhost:5173`);
});
