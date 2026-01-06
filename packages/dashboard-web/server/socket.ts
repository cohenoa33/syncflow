import { Server } from "socket.io";
import type { Server as HttpServer } from "http";
import { EventModel } from "./models";
import { eventsBuffer, connectedAgents } from "./state";
import { randId } from "./utils/ids";

function parseAgentKeys(): Record<string, string> {
  try {
    const raw = process.env.AGENT_KEYS_JSON ?? "{}";
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object"
      ? (parsed as Record<string, string>)
      : {};
  } catch (e) {
    console.warn("[Dashboard] Failed to parse AGENT_KEYS_JSON");
    return {};
  }
}

export function attachSocketServer(httpServer: HttpServer) {
  const io = new Server(httpServer, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"],
      exposedHeaders: ["X-RateLimit-Remaining", "X-RateLimit-Reset"]
    }
  });

  const AGENT_KEYS = parseAgentKeys();
  const REQUIRE_AUTH = Object.keys(AGENT_KEYS).length > 0;

  const authedSockets = new Set<string>();

  io.on("connection", (socket) => {
    socket.data.registered = false;
    socket.data.appName = undefined as string | undefined;
    console.log(
      "[Dashboard] Client connected:",
      socket.id,
      socket.data
    );
    socket.on("register", (data) => {
      const appName = data?.appName;
      const token = data?.token;

      console.log("[Dashboard] register:", socket.id,data, {
        appName,
        hasToken: !!token,
      });

      if (!appName || typeof appName !== "string") {
        socket.emit("auth_error", { ok: false, error: "MISSING_APP_NAME" });
        socket.disconnect(true);
        return;
      }

      if (REQUIRE_AUTH) {
        const expected = AGENT_KEYS[appName];
        console.log(
          "[Dashboard] Authenticating agent:",
          socket.id,
          appName,expected===token,
        );
        if (!expected || token !== expected) {
          console.warn("[Dashboard] Unauthorized agent:", socket.id, appName);
          socket.emit("auth_error", { ok: false, error: "UNAUTHORIZED" });
          socket.disconnect(true);
          return;
        }
      }

      // ✅ mark as authenticated + registered
      authedSockets.add(socket.id);
      socket.data.registered = true;
      socket.data.appName = appName;

      connectedAgents.set(socket.id, { appName, socketId: socket.id });
      io.emit("agents", Array.from(connectedAgents.values()));

      console.log("[Dashboard] Agent registered:", appName, socket.id);
    });

    socket.on("event", async (data) => {
      if (!authedSockets.has(socket.id)) {
        console.warn(
          "[Dashboard] Dropping event from unauthed socket:",
          socket.id
        );
        socket.disconnect(true);
        return;
      }

      if (!socket.data.registered || !socket.data.appName) return;

      const evt = {
        ...data,
        appName: socket.data.appName as string, // enforce server-side
        id: data?.id ?? randId(),
        receivedAt: Date.now()
      };

      eventsBuffer.push(evt);
      if (eventsBuffer.length > 1000) eventsBuffer.shift();

      EventModel.create(evt).catch((err) =>
        console.error("[Dashboard] Mongo save failed", err)
      );

      io.emit("event", evt);
    });

    socket.on("disconnect", () => {
      authedSockets.delete(socket.id);
      connectedAgents.delete(socket.id);
      io.emit("agents", Array.from(connectedAgents.values()));
      console.log("[Dashboard] Client disconnected:", socket.id);
    });
  });

  return io;
}
