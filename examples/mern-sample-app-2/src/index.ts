import express from "express";
import mongoose from "mongoose";
import { SyncFlowAgent } from "@syncflow/agent-node";

const app = express();
app.use(express.json());
import dotenv from "dotenv";

dotenv.config();
// MongoDB connection
const MONGODB_URI =
  process.env.MONGODB_URI || "mongodb://localhost:27017/syncflow-demo-2";

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

agent.instrumentExpress(app);
agent.instrumentMongoose(mongoose);
agent.connect();

// ✅ IMPORTANT: instrument mongoose BEFORE defining models
agent.instrumentMongoose(mongoose);

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

// Start server
const PORT = process.env.PORT || 4001;
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`📊 SyncFlow dashboard: http://localhost:5173`);
});
