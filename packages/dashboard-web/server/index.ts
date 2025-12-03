import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
});

// Store connected agents and clients
const connectedAgents = new Map<string, any>();
const events: any[] = [];

io.on('connection', (socket) => {
  console.log('[Dashboard] Client connected:', socket.id);

  // Handle agent registration
  socket.on('register', (data) => {
    const { appName } = data;
    console.log('[Dashboard] Agent registered:', appName);
    connectedAgents.set(socket.id, { appName, socketId: socket.id });
    
    // Broadcast agent list to all clients
    io.emit('agents', Array.from(connectedAgents.values()));
  });

  // Handle events from agents
  socket.on('event', (data) => {
    console.log('[Dashboard] Event received:', data.operation);
    
    // Store event
    const event = {
      ...data,
      id: `${Date.now()}-${Math.random()}`,
      receivedAt: Date.now(),
    };
    events.push(event);
    
    // Keep only last 1000 events
    if (events.length > 1000) {
      events.shift();
    }
    
    // Broadcast event to all connected dashboard clients
    io.emit('event', event);
  });

  // Send existing events to newly connected clients
  socket.on('getEvents', () => {
    socket.emit('eventHistory', events);
  });

  socket.on('disconnect', () => {
    console.log('[Dashboard] Client disconnected:', socket.id);
    connectedAgents.delete(socket.id);
    io.emit('agents', Array.from(connectedAgents.values()));
  });
});

const PORT = 5050;

httpServer.listen(PORT, () => {
  console.log(`[Dashboard] Socket.IO server running on port ${PORT}`);
  console.log(`[Dashboard] Dashboard UI available at http://localhost:5173`);
});
