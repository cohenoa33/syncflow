import mongoose from "mongoose";

const MONGODB_URI =
  process.env.MONGODB_URI || "mongodb://localhost:27017/syncflow-dashboard";

export async function connectMongo() {
  await mongoose.connect(MONGODB_URI);
  console.log("[Dashboard] ✅ Mongo connected");
}

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
    receivedAt: Number,
    tenantId: { type: String, required: true, index: true },
    source: { type: String, index: true } // "demo" for demo-seeded events, undefined for real
  },
  { timestamps: true }
);
EventSchema.index({ tenantId: 1, traceId: 1, ts: 1 });

const InsightSchema = new mongoose.Schema(
  {
    tenantId: { type: String, required: true, index: true },
    traceId: { type: String, required: true, index: true },
    insight: mongoose.Schema.Types.Mixed,
    computedAt: { type: Number, required: true, index: true }
  },
  { timestamps: true }
);

InsightSchema.index({ tenantId: 1, traceId: 1 }, { unique: true });

export const EventModel = mongoose.model("SyncFlowEvent", EventSchema);
export const InsightModel = mongoose.model("SyncFlowInsight", InsightSchema);
