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

  io.on("connection", (socket) => {
    console.log("[Dashboard] Client connected:", socket.id);

    socket.on("register", (data) => {
      connectedAgents.set(socket.id, {
        appName: data.appName,
        socketId: socket.id
      });
      io.emit("agents", Array.from(connectedAgents.values()));
    });

    socket.on("event", async (data) => {
      const evt = { ...data, id: data.id ?? randId(), receivedAt: Date.now() };

      eventsBuffer.push(evt);
      if (eventsBuffer.length > 1000) eventsBuffer.shift();

      EventModel.create(evt).catch((err) =>
        console.error("[Dashboard] Mongo save failed", err)
      );

      io.emit("event", evt);
    });

    socket.on("disconnect", () => {
      connectedAgents.delete(socket.id);
      io.emit("agents", Array.from(connectedAgents.values()));
    });
  });

  return io;
}
