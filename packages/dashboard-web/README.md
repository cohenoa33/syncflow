# @syncflow/dashboard-web

Real-time dashboard for monitoring MERN applications. Built with Vite, React, TypeScript, and Tailwind CSS v4.

## Features

- 📊 Live event stream from instrumented applications
- 🎨 Modern UI with Tailwind CSS v4
- ⚡ Fast development with Vite
- 🔌 Socket.IO server on port 5050
- 📱 Responsive design

## Development

```bash
pnpm dev
```

This runs both the Vite dev server (port 5173) and the Socket.IO server (port 5050).

## Build

```bash
pnpm build
```
## Architecture

### Frontend (port 5173)
- Vite + React + TypeScript + Tailwind v4
- Live traces grouped by `traceId`
- Search / filters (slow only, errors only)
- Export traces to JSON

### Backend (port 5050)
- Express + Socket.IO server
- Receives events from agents and broadcasts to clients
- Persists events to MongoDB (`syncflow-dashboard`)
- REST API:
  - `GET /api/traces` → latest events
  - `GET /api/traces/:traceId` → events for a trace
  - `DELETE /api/traces` → dev-only clear

The Socket.IO server receives events from agent-instrumented applications and broadcasts them to connected dashboard clients.

> Mongo must be running locally on `mongodb://localhost:27017`.
