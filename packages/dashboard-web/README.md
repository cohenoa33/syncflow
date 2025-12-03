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

- **Frontend**: React + TypeScript + Tailwind CSS v4 (port 5173)
- **Backend**: Express + Socket.IO server (port 5050)

The Socket.IO server receives events from agent-instrumented applications and broadcasts them to connected dashboard clients.
