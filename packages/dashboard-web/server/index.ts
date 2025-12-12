import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from "cors";

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

const PORT = 5050;

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

httpServer.listen(PORT, () => {
  console.log(`[Dashboard] Socket.IO server running on port ${PORT}`);
  console.log(`[Dashboard] Dashboard UI available at http://localhost:5173`);
});
