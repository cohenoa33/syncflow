import { io, Socket } from "socket.io-client";
import { v4 as uuidv4 } from "uuid";
import { AsyncLocalStorage } from "node:async_hooks";
export interface SyncFlowAgentOptions {
  dashboardUrl?: string;
  appName?: string;
  slowMsThreshold?: number;
  agentKey?: string;
  tenantId?: string;
}

export type SyncFlowEventType = "express" | "mongoose" | "error";
export type SyncFlowEventLevel = "info" | "warn" | "error";

export interface SyncFlowEvent {
  id: string;
  appName: string;
  type: SyncFlowEventType;
  operation: string;
  ts: number;
  durationMs?: number;
  traceId?: string;
  level: SyncFlowEventLevel;
  payload: Record<string, any>;
}

// keys we should never ship out
const SENSITIVE_KEYS = new Set([
  "password",
  "pass",
  "pwd",
  "token",
  "access_token",
  "refresh_token",
  "authorization",
  "cookie",
  "set-cookie",
  "apiKey",
  "apikey",
  "secret",
  "client_secret"
]);

function isPlainObject(v: any) {
  return v && typeof v === "object" && v.constructor === Object;
}

function redactValue(_key: string, value: any) {
  if (value == null) return value;
  if (typeof value === "string") return "[REDACTED]";
  if (typeof value === "number") return 0;
  if (typeof value === "boolean") return false;
  return "[REDACTED]";
}

/**
 * Deep-sanitize an object:
 * - redacts common sensitive keys
 * - prevents huge payloads
 * - avoids circulars
 */
function sanitize(input: any, maxDepth = 4, maxKeys = 50): any {
  const seen = new WeakSet();

  function walk(v: any, depth: number): any {
    if (depth > maxDepth) return "[TruncatedDepth]";
    if (v == null) return v;

    if (typeof v !== "object") return v;

    if (seen.has(v)) return "[Circular]";
    seen.add(v);

    if (Array.isArray(v)) {
      return v.slice(0, maxKeys).map((item) => walk(item, depth + 1));
    }

    // mongoose documents / errors / buffers etc
    if (!isPlainObject(v)) {
      try {
        if (typeof (v as any).toJSON === "function") {
          return walk((v as any).toJSON(), depth + 1);
        }
        return String(v);
      } catch {
        return "[Unserializable]";
      }
    }

    const out: Record<string, any> = {};
    const keys = Object.keys(v).slice(0, maxKeys);
    for (const k of keys) {
      if (SENSITIVE_KEYS.has(k.toLowerCase())) {
        out[k] = redactValue(k, v[k]);
      } else {
        out[k] = walk(v[k], depth + 1);
      }
    }
    if (Object.keys(v).length > maxKeys) out.__truncatedKeys = true;
    return out;
  }

  return walk(input, 0);
}

/** best-effort size guard */
function limitString(s: string, maxLen = 2000) {
  if (s.length <= maxLen) return s;
  return s.slice(0, maxLen) + "…[truncated]";
}

// Mongoose operations to track
const MONGOOSE_OPERATIONS = [
  "find",
  "findOne",
  "findOneAndUpdate",
  "findOneAndDelete",
  "updateOne",
  "updateMany",
  "deleteOne",
  "deleteMany",
  "save"
] as const;

export class SyncFlowAgent {
  private socket: Socket | null = null;
  private dashboardUrl: string;
  private appName: string;
  private connected = false;
  private slowMsThreshold: number;
  private agentKey: string | undefined;
  private tenantId?: string ;

  private als = new AsyncLocalStorage<{ traceId: string }>();

  private currentTraceId(): string | undefined {
    return this.als.getStore()?.traceId;
  }


  constructor(options: SyncFlowAgentOptions = {}) {
    this.dashboardUrl = options.dashboardUrl || "http://localhost:5050";
    this.appName = options.appName || "unnamed-app";
    this.slowMsThreshold = options.slowMsThreshold ?? 500;
    this.agentKey = options.agentKey;
    this.tenantId = options.tenantId;
  }

  connect(): void {
    if (this.connected) {
      console.log("[SyncFlow] Already connected");
      return;
    }

    this.socket = io(this.dashboardUrl, {
      transports: ["websocket"],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 5
    });

    this.socket.on("connect", () => {
      this.connected = true;
      console.log("[SyncFlow] Connected to dashboard at", this.dashboardUrl);
      this.socket?.emit("register", {
        appName: this.appName,
        token: this.agentKey,
        tenantId: this.tenantId
      });
    });

    this.socket.on("disconnect", () => {
      this.connected = false;
      console.log("[SyncFlow] Disconnected from dashboard");
    });

    this.socket.on("connect_error", (error) => {
      console.error("[SyncFlow] Connection error:", error.message);
    });
  }

  disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
      this.connected = false;
    }
  }

  private emitEvent(
    event: Omit<SyncFlowEvent, "id" | "appName" | "traceId"> & {
      traceId?: string;
    }
  ): void {
    if (!this.socket || !this.connected) return;

    const fullEvent: SyncFlowEvent = {
      id: uuidv4(),
      appName: this.appName,
      traceId: event.traceId ?? this.currentTraceId(),
      ...event
    };

    console.log(
      "[SyncFlow emit]",
      fullEvent.type,
      fullEvent.operation,
      fullEvent.traceId
    );

    this.socket.emit("event", fullEvent);
  }

  /**
   * Instrument an Express application
   */
  instrumentExpress(app: any): void {
    if (!app || typeof app.use !== "function") {
      console.error("[SyncFlow] Invalid Express app provided");
      return;
    }

    app.use((req: any, res: any, next: any) => {
      const traceId = uuidv4();

      this.als.run({ traceId }, () => {
        const start = Date.now();
        const originalSend = res.send;
        const agent = this;

        let responseSize: number | undefined;

        res.send = function (this: any, body: any) {
          const durationMs = Date.now() - start;
          res.send = originalSend;

          try {
            if (body != null) {
              responseSize =
                typeof body === "string"
                  ? body.length
                  : JSON.stringify(body).length;
            }
          } catch {
            responseSize = undefined;
          }

          const result = originalSend.call(this, body);

          const level = durationMs >= agent.slowMsThreshold ? "warn" : "info";

          agent.emitEvent({
            type: "express",
            operation: `${req.method} ${req.path}`,
            ts: start,
            durationMs,
            level,
            traceId: agent.currentTraceId(),
            payload: {
              request: {
                method: req.method,
                path: req.path,
                params: sanitize(req.params),
                query: sanitize(req.query),
                body: sanitize(req.body),
                headers: sanitize(req.headers),
                ip: req.ip,
                userAgent: req.headers?.["user-agent"]
              },
              response: {
                statusCode: res.statusCode,
                ok: res.statusCode < 400,
                contentLength: responseSize
              }
            }
          });

          return result;
        };

        next();
      });
    });

    console.log("[SyncFlow] Express instrumentation enabled");
  }

  /**
   * Instrument Mongoose for database operations
   */
  instrumentMongoose(mongoose: any): void {
    if (!mongoose || typeof mongoose.plugin !== "function") {
      console.error("[SyncFlow] Invalid Mongoose instance provided");
      return;
    }

    const agent = this;

    mongoose.plugin((schema: any) => {
      MONGOOSE_OPERATIONS.forEach((op) => {
        schema.pre(op, function (this: any) {
          this._syncflowStartTime = Date.now();
        });

        // Success path
        schema.post(op, function (this: any, doc: any, next: any) {
          const start = this._syncflowStartTime || Date.now();
          const durationMs = Date.now() - start;

          const modelName =
            this.model?.modelName ||
            this.constructor?.modelName ||
            doc?.constructor?.modelName ||
            "Unknown";

          const collection =
            this.model?.collection?.name ||
            this.constructor?.collection?.name ||
            undefined;

          // best-effort query/update extraction
          let filter: any = undefined;
          let update: any = undefined;
          try {
            if (typeof this.getFilter === "function") {
              filter = this.getFilter();
            }
            if (typeof this.getUpdate === "function") {
              update = this.getUpdate();
            }
          } catch {
            // ignore
          }

          const level: SyncFlowEventLevel =
            durationMs >= agent.slowMsThreshold ? "warn" : "info";

          agent.emitEvent({
            type: "mongoose",
            operation: `${op} ${modelName}`,
            ts: start,
            durationMs,
            level,
            traceId: agent.currentTraceId(),
            payload: {
              modelName,
              collection,
              operation: op,
              kind: op.startsWith("find")
                ? "read"
                : op.startsWith("delete")
                  ? "write"
                  : op.startsWith("update")
                    ? "write"
                    : op === "save"
                      ? "write"
                      : "other",
              filter: sanitize(filter),
              update: sanitize(update),
              docId: doc?._id?.toString?.()
            }
          });

          if (typeof next === "function") next();
        });

        // Error path
        schema.post(op, function (this: any, err: any, next: any) {
          if (!err) return next?.();

          const start = this._syncflowStartTime || Date.now();
          const durationMs = Date.now() - start;

          const modelName =
            this.model?.modelName || this.constructor?.modelName || "Unknown";

          agent.emitEvent({
            type: "mongoose",
            operation: `${op} ${modelName}`,
            ts: start,
            durationMs,
            level: "error",
            payload: {
              modelName,
              operation: op,
              error: limitString(err?.message || String(err))
            }
          });

          next?.();
        });
      });
    });

    console.log("[SyncFlow] Mongoose instrumentation enabled");
  }
}

export default SyncFlowAgent;
