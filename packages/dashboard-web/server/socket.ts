import { Server } from "socket.io";
import type { Server as HttpServer } from "http";
import { EventModel } from "./models";
import { eventsBuffer, connectedAgents } from "./state";
import { randId } from "./utils/ids";

export function attachSocketServer(httpServer: HttpServer) {
  const io = new Server(httpServer, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"],
      exposedHeaders: ["X-RateLimit-Remaining", "X-RateLimit-Reset"]
    }
  });

  type TenantsConfig = Record<
    string,
    { apps?: Record<string, string> } // appName -> token
  >;

  function parseTenantsConfig(): TenantsConfig {
    const raw = process.env.TENANTS_JSON ?? "";
    if (!raw) return {};
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      console.warn("[Dashboard] Failed to parse TENANTS_JSON");
      return {};
    }
  }

  const TENANTS = parseTenantsConfig();

  // appName -> { tenantId, token }
  const APP_INDEX: Record<string, { tenantId: string; token: string }> = {};
  for (const [tenantId, t] of Object.entries(TENANTS)) {
    const apps = t?.apps ?? {};
    for (const [appName, token] of Object.entries(apps)) {
      APP_INDEX[appName] = { tenantId, token };
    }
  }

  const REQUIRE_AUTH = Object.keys(APP_INDEX).length > 0;

  const authedSockets = new Set<string>();

  io.on("connection", (socket) => {
    socket.data.registered = false;
    socket.data.appName = undefined as string | undefined;
    socket.data.tenantId = undefined as string | undefined;
    console.log(
      "[Dashboard] Client connected:",
      socket.id,
      "- awaiting register with token validation..."
    );
    socket.on("register", (data) => {
      console.log("[Socket] register", socket.id, data);
      const appName = data?.appName;
      const token = data?.token;

      if (!appName || typeof appName !== "string") {
        console.warn(
          "[Dashboard] Unauthorized agent:",
          socket.id,
          "[MISSING_APP_NAME]"
        );
        socket.emit("auth_error", { ok: false, error: "MISSING_APP_NAME" });
        socket.disconnect(true);
        return;
      }

      if (REQUIRE_AUTH) {
        const rec = APP_INDEX[appName]; // { tenantId, token }

        const expected = rec?.token;
        if (!expected || token !== expected) {
          console.warn("[Dashboard] Unauthorized agent:", socket.id, appName);
          socket.emit("auth_error", { ok: false, error: "UNAUTHORIZED" });
          socket.disconnect(true);
          return;
        }

        socket.data.tenantId = rec.tenantId;
      } else {
        socket.data.tenantId =
          (typeof data?.tenantId === "string" && data.tenantId.trim()
            ? data.tenantId.trim()
            : process.env.DEFAULT_TENANT_ID) || "local";
      }

      // ✅ mark as authenticated + registered
      authedSockets.add(socket.id);
      socket.data.registered = true;
      socket.data.appName = appName;
      const room = `tenant:${socket.data.tenantId}`;
      io.to(room).emit(
        "agents",
        Array.from(connectedAgents.values()).filter(
          (a) => a.tenantId === socket.data.tenantId
        )
      );
      // tenantId already set above (from APP_INDEX or fallback)

      connectedAgents.set(socket.id, {
        appName,
        socketId: socket.id,
        tenantId: socket.data.tenantId as string
      });
      const tenantId = socket.data.tenantId as string;
io.to(`tenant:${tenantId}`).emit(
  "agents",
  Array.from(connectedAgents.values()).filter((a) => a.tenantId === tenantId)
);

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
      if (!socket.data.tenantId) {
        console.warn("[Dashboard] Missing tenantId for socket:", socket.id);
        socket.disconnect(true);
        return;
      }

      // Validate event structure
      if (!data || typeof data !== "object" || !data.type || !data.operation) {
        console.warn("[Dashboard] Invalid event data from socket:", socket.id);
        return;
      }

      const evt = {
        ...data,
        tenantId: socket.data.tenantId as string,
        appName: socket.data.appName as string,
        id: data?.id ?? randId(),
        receivedAt: Date.now()
      };

      eventsBuffer.push(evt);
      if (eventsBuffer.length > 1000) eventsBuffer.shift();
      console.log("[Dashboard] saving event", {
        tenantId: evt.tenantId,
        appName: evt.appName,
        type: evt.type,
        traceId: evt.traceId
      });
      // Persist to database (non-blocking)
      EventModel.create(evt).catch((err) => {
        console.error(
          "[Dashboard] Failed to persist event to MongoDB:",
          evt.id,
          err instanceof Error ? err.message : err
        );
        // Event is still in buffer and broadcast, so UI won't be affected
      });

 const room = `tenant:${evt.tenantId}`;

      io.to(room).emit("event", evt);
    });

    socket.on("disconnect", () => {
      authedSockets.delete(socket.id);
      connectedAgents.delete(socket.id);
      const tenantId = socket.data.tenantId as string;
io.to(`tenant:${tenantId}`).emit(
  "agents",
  Array.from(connectedAgents.values()).filter((a) => a.tenantId === tenantId)
);

      socket.data.registered = false;
      socket.data.appName = undefined;
      socket.data.tenantId = undefined;
      console.log("[Dashboard] Client disconnected:", socket.id);
    });

    socket.on("join_tenant", (data) => {
      const tenantIdRaw = data?.tenantId;
      const tenantId =
        typeof tenantIdRaw === "string" && tenantIdRaw.trim()
          ? tenantIdRaw.trim()
          : process.env.DEFAULT_TENANT_ID || "local";

      socket.data.tenantId = tenantId;

      const room = `tenant:${socket.data.tenantId}`;
      socket.join(room);

      io.to(room).emit(
        "agents",
        Array.from(connectedAgents.values()).filter(
          (a) => a.tenantId === socket.data.tenantId
        )
      );

      console.log("[Dashboard] UI joined tenant room:", tenantId, socket.id);
    });
    socket.on("connect_error", (err) => {
      console.log("[Socket] connect_error", socket.id, err?.message);
    });
  });

  return io;
}
