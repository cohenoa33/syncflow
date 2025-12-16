import express from "express";
import cors from "cors";
import mongoose from "mongoose";
import { SyncFlowAgent } from "@syncflow/agent-node";

const app = express();
app.use(cors());
app.use(express.json());

// ---- connect agent ----
const agent = new SyncFlowAgent({
  dashboardUrl: "http://localhost:5050",
  appName: "mern-sample-app"
});

// ---- mongo ----
mongoose
  .connect("mongodb://localhost:27017/syncflow-demo")
  .then(() => console.log("Mongo connected"))
  .catch((err) => console.error("Mongo error", err));

// Simple model
const NoteSchema = new mongoose.Schema({
  text: String
});

const Note = mongoose.model("Note", NoteSchema);

// ---- routes ----
app.get("/notes", async (_req, res) => {
  const notes = await Note.find();
  res.json(notes);
});

app.post("/notes", async (req, res) => {
  const note = await Note.create({ text: req.body.text });

  res.json(note);
});

app.listen(4000, () => console.log("API running on 4000"));
