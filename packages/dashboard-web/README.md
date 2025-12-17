# @syncflow/dashboard-web

Real-time dashboard + server for monitoring MERN applications.  
Built with **Vite**, **React**, **TypeScript**, **Tailwind CSS v4**, **Express**, and **Socket.IO**.

This package contains **both**:
- the **Dashboard UI** (port 5173)
- the **Socket.IO + REST API server** (port 5050)

---

## ✨ Features

### Monitoring
- 📊 Live trace stream from instrumented MERN applications
- 🧵 Traces grouped by `traceId` (Express + Mongoose in a single timeline)
- 🧠 Trace summary badges: status code, `slow`, `error`
- 🔍 Search + filters:
  - Slow only
  - Errors only
  - Type filters (Express / Mongoose / Error)
  - App filtering via **multi-select chips** (no dropdown)
- 📤 Export **currently filtered** traces to JSON

### AI Insights
- 🤖 **Server-powered AI insights per trace**
- 🧠 Root cause analysis + signals + suggestions
- 💾 Cached in MongoDB with freshness window
- 🔁 **Regenerate** button to force recomputation
- ❌ Close insight panel independently from trace

### UX
- 🎨 Modern UI with Tailwind CSS v4
- ⚡ Fast dev workflow with Vite
- 📱 Responsive layout
- ⌨️ Keyboard shortcuts:
  - `E` — toggle latest event payload
  - `Shift+E` — expand / collapse all payloads

---

## 🚀 Development

From this package directory:

```bash
pnpm dev
```

This runs both:
- **Dashboard UI** → http://localhost:5173
- **Socket.IO + REST API server** → http://localhost:5050

MongoDB must be running locally `on mongodb://localhost:27017`.

## 🔐 Environment Variables
Create `packages/dashboard-web/.env.local` for local development:
```bash 
OPENAI_API_KEY=your_openai_key_here
ENABLE_AI_INSIGHTS=true
INSIGHT_MODEL=gpt-5.2
MONGODB_URI=mongodb://localhost:27017/syncflow-dashboard
```

Notes:
-	`.env.local` is used in development
- `.env` is used in production
-  **Never commit API keys**

## 🏗️ Build (Production)
```bash
pnpm build
```
This:
- Compiles the TypeScript server
- Builds the React frontend into dist/
- Serves the UI statically from the Express server

## 🧠 Architecture

### Frontend (port 5173)
- Vite + React + TypeScript + Tailwind v4
- UI components: `src/components`
- Shared helpers/config: `src/lib`
- Features:
  - Live traces grouped by `traceId`
  - Collapsible per-trace timelines
  - Status / slow / error badges
  - App filtering via **multi-select chips**
    - Default: all apps selected
    - First click switches to “all except clicked”
- Search by:
  - Route
  - DB operation
  - App name
  - Payload text
- Export filtered traces to JSON
- AI Insight panel per trace (open / close / regenerate)

### Backend (port 5050)
- Express + Socket.IO server
- Receives events from `@syncflow/agent-node`
- Broadcasts events to connected dashboards
- Persists events to MongoDB (`syncflow-dashboard`)
- Persists AI insights separately with timestamps
- Maintains a small in-memory buffer for fast live updates

## 🔌 REST API

### Traces
- **GET /api/traces** <br>
Returns latest persisted events (used to hydrate dashboard on load).
- **DELETE /api/traces** <br>
Clears **all traces and insights** from:
  - MongoDB
  - In-memory buffer<br>
Powers the **Clear** button in the UI.

### Demo
- **POST /api/demo-seed** <br>
Seeds realistic demo traces for **multiple apps**.<br>
Used by the Dashboard **Demo Mode** button.

### AI Insights

- **GET /api/insights/:traceId**<br/>
Returns cached insight if fresh, otherwise computes and stores a new one.
- **POST /api/insights/:traceId/regenerate**<br/>
Forces recomputation of insight for a trace (used by the **Regenerate** button).

If no events exist for a trace, the API returns:
```json
{
  "ok": false,
  "error": "TRACE_NOT_FOUND"
}
```
## 🧪 Demo Mode

Demo Mode:

1. Clears all traces + insights
2. Seeds demo traces for multiple apps
3. Opens the newest trace automatically

<br/>
Useful for:

- UI demos
- App filtering testing
- AI insight validation

## 📦 Related Packages


  - [@syncflow/agent-node￼](./packages/agent-node/README.md) node￼ — MERN instrumentation agent
  - [examples/mern-sample-app](./examples/mern-sample-app/README.md) - Demo backend
  - [examples/mern-sample-app-2](./examples/mern-sample-app-2/README.md) - Second demo backend

  ## 📝 Notes
- This package is both UI and server — no separate backend needed
- Designed for **local dev + demo deployments**
- Production hardening (auth, rate limiting, quotas) is planned

© 2025 Noa Rabin Cohen — MIT License