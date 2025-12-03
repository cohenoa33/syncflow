import { io, Socket } from "socket.io-client";
import { v4 as uuid } from "uuid";
import { z } from "zod";

// ---- types ----
const AgentConfigSchema = z.object({
  serverUrl: z.url(),
  projectId: z.string(),
  apiKey: z.string().optional()
});

export type AgentConfig = z.infer<typeof AgentConfigSchema>;

export type SyncEvent = {
  type: string;
  payload: any;
  ts: number;
  traceId: string;
};

// ---- agent ----
export class SyncFlowAgent {
  private socket: Socket;
  private projectId: string;

  constructor(config: AgentConfig) {
    const parsed = AgentConfigSchema.parse(config);
    this.projectId = parsed.projectId;

    this.socket = io(parsed.serverUrl, {
      auth: {
        projectId: parsed.projectId,
        apiKey: parsed.apiKey
      },
      transports: ["websocket"]
    });

    this.socket.on("connect", () => {
      console.log(`[SyncFlowAgent] connected: ${this.socket.id}`);
      this.emit("agent_connected", { projectId: this.projectId });
    });

    this.socket.on("disconnect", () => {
      console.log("[SyncFlowAgent] disconnected");
    });
  }

  emit(type: string, payload: any = {}) {
    const event: SyncEvent = {
      type,
      payload,
      ts: Date.now(),
      traceId: uuid()
    };

    this.socket.emit("event", event);
  }
}
