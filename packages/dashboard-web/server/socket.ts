import { Server } from "socket.io";
import type { Server as HttpServer } from "http";
import { EventModel } from "./models";
import { eventsBuffer, connectedAgents } from "./state";
import { randId } from "./utils/ids";
import { APP_INDEX, TENANTS, getAuthConfig } from "./tenants";
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
      console.log("[Socket] register", socket.id, "appName:", data?.appName);

      const { hasTenantsConfig, requireAgentAuth } = getAuthConfig();
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

      if (!hasTenantsConfig) {
        socket.emit("auth_error", {
          ok: false,
          error: "TENANTS_NOT_CONFIGURED",
          message: "TENANTS_JSON is not configured; agents are disabled."
        });
        socket.disconnect(true);
        return;
      }
      if (requireAgentAuth) {
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
        const tenantId = data?.tenantId?.trim();
        if (!tenantId) {
          console.warn(
            "[Dashboard] Missing tenantId in agent payload:",
            socket.id
          );
          socket.emit("auth_error", { ok: false, error: "MISSING_TENANT_ID" });
          socket.disconnect(true);
          return;
        }

        if (!TENANTS[tenantId]) {
          socket.emit("auth_error", {
            ok: false,
            error: "UNAUTHORIZED",
            message: "Unknown tenant"
          });
          socket.disconnect(true);
          return;
        }

        socket.data.tenantId = tenantId;
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
      const { hasTenantsConfig } = getAuthConfig();
      if (!hasTenantsConfig) return;
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
      const { hasTenantsConfig } = getAuthConfig();

      // Step 1: Always require tenantId in payload (trim)
      const tenantId =
        typeof data?.tenantId === "string" ? data.tenantId.trim() : "";

      if (!tenantId) {
        console.warn("[Dashboard] Missing tenantId in join_tenant:", socket.id);
        socket.emit("auth_error", { ok: false, error: "MISSING_TENANT_ID" });
        socket.disconnect(true);
        return;
      }

      if (!hasTenantsConfig) {
        socket.emit("auth_error", {
          ok: false,
          error: "TENANTS_NOT_CONFIGURED",
          message:
            "TENANTS_JSON is not configured; no tenant data is available."
        });
        return; // do NOT join room
      }

      // Step 3: If TENANTS_JSON has tenants, enforce strict validation
      // 3a: Tenant must exist in TENANTS
      if (!TENANTS[tenantId]) {
        console.warn(
          `[Dashboard] ❌ join_tenant: Tenant "${tenantId}" not found in TENANTS_JSON`
        );
        socket.emit("auth_error", {
          ok: false,
          error: "UNAUTHORIZED",
          message: "Unknown tenant"
        });
        socket.disconnect(true);
        return;
      }

      // 3b: Require viewer token from data.token OR socket.handshake.auth.token
      const token =
        (typeof data?.token === "string" ? data.token.trim() : "") ||
        (typeof socket.handshake.auth?.token === "string"
          ? socket.handshake.auth.token.trim()
          : "");

      if (!token) {
        console.warn(
          `[Dashboard] ❌ join_tenant: Missing viewer token (tenant: ${tenantId})`
        );
        socket.emit("auth_error", {
          ok: false,
          error: "UNAUTHORIZED",
          message: "Missing or invalid viewer token"
        });
        socket.disconnect(true);
        return;
      }

      // 3c: Validate token against dashboards config for this tenant
      if (!validateDashboardViewerToken(tenantId, token)) {
        console.warn(
          `[Dashboard] ❌ join_tenant: Invalid viewer token (tenant: ${tenantId})`
        );
        socket.emit("auth_error", {
          ok: false,
          error: "UNAUTHORIZED",
          message: "Missing or invalid viewer token"
        });
        socket.disconnect(true);
        return;
      }

      // All validations passed
      console.log(
        `[Dashboard] ✅ join_tenant success: Valid token for tenant "${tenantId}"`
      );
      socket.data.tenantId = tenantId;
      socket.join(`tenant:${tenantId}`);

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
