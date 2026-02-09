// dashboard-web/server/socket.ts

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

  // Socket.IO middleware: Enforce UI auth at connection/handshake time
  // UI clients MUST connect with kind="ui", agents with kind="agent" (or omit kind)
  io.use((socket, next) => {
    const { requireViewerAuth } = getAuthConfig();

    // Extract kind marker from handshake.auth or handshake.query
    const kind =
      (typeof socket.handshake.auth?.kind === "string"
        ? socket.handshake.auth.kind.trim()
        : "") ||
      (typeof socket.handshake.query?.kind === "string"
        ? socket.handshake.query.kind.trim()
        : "");

    // If kind is not "ui", this is an agent - will authenticate via register event
    if (kind !== "ui") {
      // Agent socket - allow through, will auth later via register
      return next();
    }

    // This is a UI client - enforce UI auth rules
    console.log("[Dashboard] UI handshake auth", socket.id);

    // Extract tenantId from handshake.auth or handshake.query
    const tenantId =
      (typeof socket.handshake.auth?.tenantId === "string"
        ? socket.handshake.auth.tenantId.trim()
        : "") ||
      (typeof socket.handshake.query?.tenantId === "string"
        ? socket.handshake.query.tenantId.trim()
        : "");

    // UI clients ALWAYS require tenantId
    if (!tenantId) {
      console.warn(
        "[Dashboard] ❌ Handshake: UI client missing tenantId",
        socket.id
      );
      const err = new Error("MISSING_TENANT_ID");
      (err as any).data = { error: "MISSING_TENANT_ID" };
      return next(err);
    }

    // Extract viewer token from handshake.auth or handshake.query
    const token =
      (typeof socket.handshake.auth?.token === "string"
        ? socket.handshake.auth.token.trim()
        : "") ||
      (typeof socket.handshake.query?.token === "string"
        ? socket.handshake.query.token.trim()
        : "");

    // If viewer auth is enabled (TENANTS_JSON present)
    if (requireViewerAuth) {
      // Tenant must exist in TENANTS
      if (!TENANTS[tenantId]) {
        console.warn(
          `[Dashboard] ❌ Handshake: Tenant "${tenantId}" not found in TENANTS_JSON`
        );
        const err = new Error("UNAUTHORIZED");
        (err as any).data = {
          error: "UNAUTHORIZED",
          message: "Unknown tenant"
        };
        return next(err);
      }

      // Token must be present
      if (!token) {
        console.warn(
          `[Dashboard] ❌ Handshake: Missing viewer token (tenant: ${tenantId})`
        );
        const err = new Error("UNAUTHORIZED");
        (err as any).data = {
          error: "UNAUTHORIZED",
          message: "Missing or invalid viewer token"
        };
        return next(err);
      }

      // Token must be valid for this tenant
      if (!validateDashboardViewerToken(tenantId, token)) {
        console.warn(
          `[Dashboard] ❌ Handshake: Invalid viewer token (tenant: ${tenantId})`
        );
        const err = new Error("UNAUTHORIZED");
        (err as any).data = {
          error: "UNAUTHORIZED",
          message: "Missing or invalid viewer token"
        };
        return next(err);
      }

      console.log(
        `[Dashboard] ✅ Handshake success: Valid token for tenant "${tenantId}"`
      );
    } else {
      // Viewer auth disabled (TENANTS_JSON empty) - allow with just tenantId
      console.log(
        `[Dashboard] ⚠️  No viewer auth required, allowing tenant "${tenantId}" through`
      );
    }

    // Set tenantId and uiAuthenticated on successful UI handshake auth
    socket.data.tenantId = tenantId;
    socket.data.uiAuthenticated = true;

    // Join tenant room immediately so UI can receive tenant-scoped events
    socket.join(`tenant:${tenantId}`);

    // Allow connection
    next();
  });

  io.on("connection", (socket) => {
    // Don't wipe handshake auth state - preserve tenantId and uiAuthenticated if set
    if (!socket.data.tenantId) {
      socket.data.tenantId = undefined as string | undefined;
    }
    if (!socket.data.uiAuthenticated) {
      socket.data.registered = false;
      socket.data.appName = undefined as string | undefined;
    }
    console.log(
      "[Dashboard] Client connected:",
      socket.id,
      socket.data.uiAuthenticated
        ? `(UI pre-authenticated for tenant: ${socket.data.tenantId})`
        : "- awaiting register or join_tenant..."
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

      // Leave any existing tenant rooms to ensure single-tenant membership
      const rooms = Array.from(socket.rooms);
      rooms.forEach((room) => {
        if (room.startsWith("tenant:") && room !== `tenant:${tenantId}`) {
          socket.leave(room);
        }
      });

      // Join tenant room
      socket.join(`tenant:${tenantId}`);

      // Add to connected agents tracker BEFORE emitting agents list
      connectedAgents.set(socket.id, {
        appName,
        socketId: socket.id,
        tenantId
      });

      // Emit agents list to tenant room only
      io.to(`tenant:${tenantId}`).emit(
        "agents",
        Array.from(connectedAgents.values()).filter(
          (a) => a.tenantId === tenantId
        )
      );

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
      // If client already authenticated during handshake, this is idempotent
      if (socket.data.uiAuthenticated && socket.data.tenantId) {
        console.log(
          "[Dashboard] join_tenant called for pre-authenticated client:",
          socket.data.tenantId,
          socket.id
        );
        // Emit agents list (client already in room)
        socket.emit(
          "agents",
          Array.from(connectedAgents.values()).filter(
            (a) => a.tenantId === socket.data.tenantId
          )
        );
        return;
      }

      // Legacy path: client connected without handshake auth (old clients without kind="ui")
      const { hasTenantsConfig, requireViewerAuth } = getAuthConfig();

      // Step A: tenantId is ALWAYS required
      const tenantId =
        typeof data?.tenantId === "string" ? data.tenantId.trim() : "";

      if (!tenantId) {
        console.warn("[Dashboard] Missing tenantId in join_tenant:", socket.id);
        socket.emit("auth_error", { ok: false, error: "MISSING_TENANT_ID" });
        socket.disconnect(true);
        return;
      }

      // Prevent tenant switching - if tenantId already set, ensure it matches
      if (socket.data.tenantId && socket.data.tenantId !== tenantId) {
        console.warn(
          `[Dashboard] ❌ join_tenant: Attempt to switch tenant from "${socket.data.tenantId}" to "${tenantId}"`,
          socket.id
        );
        socket.emit("auth_error", {
          ok: false,
          error: "UNAUTHORIZED",
          message: "Cannot switch tenants"
        });
        socket.disconnect(true);
        return;
      }

      // Step B: If requireViewerAuth === false (TENANTS_JSON empty)
      // Allow join without token, emit agents payload
      if (!requireViewerAuth) {
        console.log(
          `[Dashboard] ⚠️  No viewer auth required, allowing tenant "${tenantId}" through`
        );

        // Leave any existing tenant rooms to ensure single-tenant membership
        const rooms = Array.from(socket.rooms);
        rooms.forEach((room) => {
          if (room.startsWith("tenant:") && room !== `tenant:${tenantId}`) {
            socket.leave(room);
          }
        });

        socket.data.tenantId = tenantId;
        socket.join(`tenant:${tenantId}`);

        // Emit agents payload (empty list or existing agents for this tenant)
        socket.emit(
          "agents",
          Array.from(connectedAgents.values()).filter(
            (a) => a.tenantId === tenantId
          )
        );

        console.log("[Dashboard] UI joined tenant room:", tenantId, socket.id);
        return;
      }

      // Step C: If requireViewerAuth === true (TENANTS_JSON present)
      // Require viewer token validation

      // C1: Tenant must exist in TENANTS
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

      // C2: Require viewer token from data.token OR socket.handshake.auth.token
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

      // C3: Validate token against dashboards config for this tenant
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

      // Leave any existing tenant rooms to ensure single-tenant membership
      const rooms = Array.from(socket.rooms);
      rooms.forEach((room) => {
        if (room.startsWith("tenant:") && room !== `tenant:${tenantId}`) {
          socket.leave(room);
        }
      });

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
  });

  return io;
}
