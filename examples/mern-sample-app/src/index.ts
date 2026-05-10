import express from "express";
import mongoose from "mongoose";
import http from "node:http";
import { SyncFlowAgent } from "@syncflow/agent-node";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(express.json());

console.log("🔧 Setting up SyncFlow Agent...", process.env.MONGODB_URI);
// MongoDB connection
const MONGODB_URI =
  process.env.MONGODB_URI || "mongodb://localhost:27017/syncflow-demo";

mongoose
  .connect(MONGODB_URI)
  .then(() => console.log("✅ Connected to MongoDB"))
  .catch((err) => console.error("❌ MongoDB connection error:", err));

const agent = new SyncFlowAgent({
  dashboardUrl: process.env.SYNCFLOW_DASHBOARD_SOCKET_URL,
  appName: process.env.SYNCFLOW_APP_NAME,
  agentKey: process.env.SYNCFLOW_AGENT_KEY,
  tenantId: process.env.SYNCFLOW_TENANT_ID
});

// ✅ IMPORTANT: instrument mongoose BEFORE defining models
agent.connect();
agent.instrumentExpress(app);
agent.instrumentMongoose(mongoose);
agent.instrumentHttp();


// Define User model (now hooks will attach)
const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  createdAt: { type: Date, default: Date.now }
});
const User = mongoose.model("User", userSchema);
// API Routes
app.get("/", (_req, res) => {
  res.json({
    message: "SyncFlow MERN Sample App",
    status: "running",
    endpoints: [
      "GET /api/users",
      "POST /api/users",
      "GET /api/users/:id",
      "PUT /api/users/:id",
      "DELETE /api/users/:id"
    ]
  });
});

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
const randDelay = (min: number, max: number) =>
  delay(Math.floor(Math.random() * (max - min + 1)) + min);

// Slow search — simulates unindexed regex + network lag
app.get("/api/users/search", async (req, res) => {
  try {
    const q = (req.query.q as string) || "";
    const regex = new RegExp(q, "i");
    await randDelay(600, 1400); // simulate slow query
    const users = await User.find({ $or: [{ name: regex }, { email: regex }] });
    res.json(users);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Slow stats — multiple sequential DB ops + delay
app.get("/api/users/stats", async (_req, res) => {
  try {
    await randDelay(800, 2000); // simulate aggregation pipeline lag
    const total = await User.countDocuments();
    const recent = await User.find().sort({ createdAt: -1 }).limit(5);
    const oldest = await User.find().sort({ createdAt: 1 }).limit(1);
    res.json({ total, recent: recent.length, oldestEmail: oldest[0]?.email ?? null });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Slow export — simulates a heavy data dump
app.get("/api/users/export", async (_req, res) => {
  try {
    await randDelay(1000, 2500);
    const users = await User.find();
    res.json({ exported: users.length, data: users });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Get all users
app.get("/api/users", async (_req, res) => {
  try {
    const users = await User.find();
    res.json(users);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Create user
app.post("/api/users", async (req, res) => {
  try {
    const user = new User(req.body);
    await user.save();
    res.status(201).json(user);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// Get user by ID
app.get("/api/users/:id", async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ error: "User not found" });
    res.json(user);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Update user
app.put("/api/users/:id", async (req, res) => {
  try {
    const user = await User.findByIdAndUpdate(req.params.id, req.body, {
      new: true
    });
    if (!user) return res.status(404).json({ error: "User not found" });
    res.json(user);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// Delete user
app.delete("/api/users/:id", async (req, res) => {
  try {
    const user = await User.findByIdAndDelete(req.params.id);
    if (!user) return res.status(404).json({ error: "User not found" });
    res.json({ message: "User deleted successfully" });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Distributed trace demo: forward request to mern-sample-app-2
app.get("/api/forward", (_req, res) => {
  const APP2_URL = process.env.APP2_URL || "http://localhost:4001";
  const parsed = new URL(`${APP2_URL}/api/users`);
  const options = { hostname: parsed.hostname, port: parsed.port || 80, path: parsed.pathname };

  const proxyReq = http.request(options, (upstream) => {
    let body = "";
    upstream.on("data", (chunk) => (body += chunk));
    upstream.on("end", () => {
      try {
        res.json({ source: "mern-sample-app-2", data: JSON.parse(body) });
      } catch {
        res.status(502).json({ error: "Bad response from app-2", raw: body });
      }
    });
  });
  proxyReq.on("error", (err) => res.status(502).json({ error: err.message }));
  proxyReq.end();
});

// Start server
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`📊 SyncFlow dashboard: http://localhost:5173`);
});
