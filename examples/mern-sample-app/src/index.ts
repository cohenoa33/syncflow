import express from "express";
import mongoose from "mongoose";
import { SyncFlowAgent } from "@syncflow/agent-node";

const app = express();
app.use(express.json());

// MongoDB connection
const MONGODB_URI =
  process.env.MONGODB_URI || "mongodb://localhost:27017/syncflow-demo";

mongoose
  .connect(MONGODB_URI)
  .then(() => console.log("✅ Connected to MongoDB"))
  .catch((err) => console.error("❌ MongoDB connection error:", err));

// Define User model
const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  createdAt: { type: Date, default: Date.now },
});

const User = mongoose.model("User", userSchema);

// ✅ Current MVP agent API
const agent = new SyncFlowAgent({
  serverUrl: "http://localhost:5050",
  projectId: "mern-sample-app",
});

// API Routes
app.get("/", (_req, res) => {
  res.json({
    message: "SyncFlow MERN Sample App",
    status: "running",
  });
});

// Get all users
app.get("/api/users", async (_req, res) => {
  const users = await User.find();
  agent.emit("route_hit", { route: "/api/users", count: users.length });
  res.json(users);
});

// Create user
app.post("/api/users", async (req, res) => {
  try {
    const user = await User.create(req.body);
    agent.emit("user_created", { id: user._id, email: user.email });
    res.status(201).json(user);
  } catch (error: any) {
    agent.emit("user_create_error", { message: error.message });
    res.status(400).json({ error: error.message });
  }
});

// Get user by ID
app.get("/api/users/:id", async (req, res) => {
  const user = await User.findById(req.params.id);
  agent.emit("route_hit", { route: "/api/users/:id", id: req.params.id });
  if (!user) return res.status(404).json({ error: "User not found" });
  res.json(user);
});

// Update user
app.put("/api/users/:id", async (req, res) => {
  const user = await User.findByIdAndUpdate(req.params.id, req.body, {
    new: true,
  });
  agent.emit("user_updated", { id: req.params.id });
  if (!user) return res.status(404).json({ error: "User not found" });
  res.json(user);
});

// Delete user
app.delete("/api/users/:id", async (req, res) => {
  const user = await User.findByIdAndDelete(req.params.id);
  agent.emit("user_deleted", { id: req.params.id });
  if (!user) return res.status(404).json({ error: "User not found" });
  res.json({ message: "User deleted successfully" });
});

// Start server
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`📊 SyncFlow dashboard: http://localhost:5173`);
});
