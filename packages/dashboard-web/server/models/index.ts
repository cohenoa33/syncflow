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

const AlertRuleSchema = new mongoose.Schema(
  {
    tenantId:    { type: String, required: true, index: true },
    name:        { type: String, required: true },
    metric:      { type: String, required: true },
    threshold:   { type: Number, required: true },
    window:      { type: String, required: true, default: "1h" },
    appName:     { type: String, default: null },
    enabled:     { type: Boolean, required: true, default: true },
    cooldownMs:  { type: Number, default: 3_600_000 },
    lastFiredAt: { type: Number, default: null },
    createdAt:   { type: Number, required: true },
  },
  { collection: "alertrules" }
);
AlertRuleSchema.index({ tenantId: 1 });
AlertRuleSchema.index({ tenantId: 1, enabled: 1 });

const AlertFireSchema = new mongoose.Schema(
  {
    tenantId:  { type: String, required: true, index: true },
    ruleId:    { type: String, required: true, index: true },
    ruleName:  { type: String, required: true },
    metric:    { type: String, required: true },
    value:     { type: Number, required: true },
    threshold: { type: Number, required: true },
    window:    { type: String, required: true },
    appName:   { type: String, default: null },
    firedAt:   { type: Number, required: true, index: true },
  },
  { collection: "alertfires" }
);
AlertFireSchema.index({ tenantId: 1, firedAt: -1 });
AlertFireSchema.index({ tenantId: 1, ruleId: 1, firedAt: -1 });

export const AlertRuleModel = mongoose.model("AlertRule", AlertRuleSchema);
export const AlertFireModel = mongoose.model("AlertFire", AlertFireSchema);
