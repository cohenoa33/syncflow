import { createServer } from "http";
import { Server } from "socket.io";

const httpServer = createServer();

const io = new Server(httpServer, {
  cors: { origin: "*" }
});

io.on("connection", (socket) => {
  const { projectId } = socket.handshake.auth || {};
  console.log(
    `[SyncFlow Server] agent connected: ${socket.id} project=${projectId}`
  );

  socket.on("event", (event) => {
    io.emit("event", event);
  });

  socket.on("disconnect", () => {
    console.log(`[SyncFlow Server] disconnected: ${socket.id}`);
  });
});

httpServer.listen(5050, () => {
  console.log("[SyncFlow Server] listening on ws://localhost:5050");
});

