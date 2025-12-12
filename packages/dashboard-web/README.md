# @syncflow/dashboard-web

Real-time dashboard for monitoring MERN applications.  
Built with **Vite**, **React**, **TypeScript**, and **Tailwind CSS v4**.

## Features

- 📊 Live trace stream from instrumented MERN applications
- 🧵 Traces grouped by `traceId` (Express + Mongoose in a single timeline)
- 🧠 Trace summary badges: status code, `slow`, `error`
- 🔍 Search + filters (slow only, errors only, type filters)
- 📤 Export currently filtered traces to JSON
- 🎨 Modern UI with Tailwind CSS v4
- ⚡ Fast development with Vite
- 🔌 Socket.IO server on port `5050`
- 📱 Responsive design

---

## Development

From this package directory:

```bash
pnpm dev
```
This runs both:
- Vite dev server (UI) on ***http://localhost:5173***
- Socket.IO + REST API server on ***http://localhost:5050***



## Build
```bash
pnpm build
```


This compiles the TypeScript server and builds the React frontend for production.



## Architecture

**Frontend (port 5173)**
- Vite + React + TypeScript + Tailwind v4
- Live traces grouped by traceId
- Collapsible per-trace timelines (Express + Mongoose events)
- Status / slow / error badges in the trace header
- Search box (route, model, payload text, app name)
- Filters:
- All / Express / Mongoose / Error
- “Slow only”
- “Errors only”
- Export **currently filtered** traces to a JSON file
- Keyboard shortcuts:
- E — toggle latest event payload
- Shift+E — expand/collapse all payloads

**Backend (port 5050)**
- Express + Socket.IO server
- Receives events from @syncflow/agent-node and broadcasts them to connected dashboards
- Persists events to MongoDB (syncflow-dashboard database)
- Maintains a small in-memory buffer of recent events for fast history streaming

**REST API**
- GET /api/traces
Returns the latest persisted events (used to hydrate the dashboard on load).
- GET /api/traces/:traceId
Returns all events belonging to a specific trace, ordered by timestamp.
- DELETE /api/traces
Clears **all** traces from:
- MongoDB (syncflow-dashboard)
- The dashboard server’s in-memory event buffer
This endpoint powers the **Clear** button in the UI, so after clearing, a page refresh will still show an empty state until new events arrive.

The Socket.IO server receives events from agent-instrumented applications and broadcasts them to all connected dashboard clients in real time.

> MongoDB must be running locally on mongodb://localhost:27017 for persistence to work.