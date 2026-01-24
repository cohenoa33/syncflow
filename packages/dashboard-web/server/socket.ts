import { Server } from "socket.io";
import type { Server as HttpServer } from "http";
import { EventModel } from "./models";
import { eventsBuffer, connectedAgents } from "./state";
import { randId } from "./utils/ids";
import {
  APP_INDEX,
  REQUIRE_AUTH,
  getTenantFromHeaders
} from "./tenants";
import { validateDashboardViewerToken } from "./auth";

export function attachSocketServer(httpServer: HttpServer) {
  console.log("[Socket] Attaching Socket.IO server...");
  const io = new Server(httpServer, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"],
      exposedHeaders: ["X-RateLimit-Remaining", "X-RateLimit-Reset"]
    }
  });

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
        // Strict mode: validate appName+token against APP_INDEX
        const rec = APP_INDEX[appName]; // { tenantId, token }

        const expected = rec?.token;
        if (!expected || token !== expected) {
          console.warn("[Dashboard] Unauthorized agent:", socket.id, appName);
          socket.emit("auth_error", { ok: false, error: "UNAUTHORIZED" });
          socket.disconnect(true);
          return;
        }

        // Derive tenantId from APP_INDEX, ignore any tenantId sent by agent
        socket.data.tenantId = rec.tenantId;
      } else {
        // Dev mode: accept tenantId from data or fallback
        socket.data.tenantId = getTenantFromHeaders(data);
      }

      // mark as authenticated + registered (AFTER auth)
      authedSockets.add(socket.id);
      socket.data.registered = true;
      socket.data.appName = appName;
      const tenantId = socket.data.tenantId as string;

      // Join tenant room
      socket.join(`tenant:${tenantId}`);

      // Emit agents list to tenant room only
      io.to(`tenant:${tenantId}`).emit(
        "agents",
        Array.from(connectedAgents.values()).filter(
          (a) => a.tenantId === tenantId
        )
      );

      // Add to connected agents tracker
      connectedAgents.set(socket.id, {
        appName,
        socketId: socket.id,
        tenantId
      });

      console.log(
        "[Dashboard] Agent registered:",
        appName,
        socket.id,
        "tenant:",
        tenantId
      );
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
      });

      // Emit event to tenant room ONLY (not global)
      const room = `tenant:${evt.tenantId}`;
      io.to(room).emit("event", evt);
    });

    socket.on("disconnect", () => {
      authedSockets.delete(socket.id);
      const tenantId = socket.data.tenantId as string;
      connectedAgents.delete(socket.id);

      // Emit updated agents list to tenant room only
      if (tenantId) {
        io.to(`tenant:${tenantId}`).emit(
          "agents",
          Array.from(connectedAgents.values()).filter(
            (a) => a.tenantId === tenantId
          )
        );
      }

      socket.data.registered = false;
      socket.data.appName = undefined;
      socket.data.tenantId = undefined;
      console.log("[Dashboard] Client disconnected:", socket.id);
    });

    socket.on("join_tenant", (data) => {
      const tenantIdFromHeader = getTenantFromHeaders(data?.headers || {});
      const tenantIdFromData = data?.tenantId;

      // Prefer explicit tenantId in data, fallback to header
      const tenantId = tenantIdFromData || tenantIdFromHeader;

      // In strict mode, validate viewer token
      if (REQUIRE_AUTH) {
        const token = data?.token || socket.handshake.auth?.token;

        if (!token) {
          socket.emit("auth_error", {
            ok: false,
            error: "UNAUTHORIZED",
            message: "Missing or invalid viewer token"
          });
          return;
        }

        if (!validateDashboardViewerToken(tenantId, token)) {
          socket.emit("auth_error", {
            ok: false,
            error: "UNAUTHORIZED",
            message: "Missing or invalid viewer token"
          });
          return;
        }
      }

      socket.data.tenantId = tenantId;
      socket.join(`tenant:${tenantId}`);

      // Emit tenant-scoped agents list to this socket
      socket.emit(
        "agents",
        Array.from(connectedAgents.values()).filter(
          (a) => a.tenantId === tenantId
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
