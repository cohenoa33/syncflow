# 🔄 SyncFlow

SyncFlow is an AI-powered debugging assistant for MERN applications. It automatically captures Express requests and Mongoose operations in real-time, streams them to a React dashboard, and uses AI to generate root-cause analysis per trace.

**Status:** MVP (Phase 1–3 complete). See [Roadmap](#roadmap).

## 🌐 Live Demo

Dashboard: https://syncflow-demo.onrender.com/

## 🚀 Quick Start

**Prerequisites:** Node.js 18+, pnpm, MongoDB 6+, OpenAI API key (optional)

**Terminal 1: Start MongoDB (Docker)**

```bash
# First time (creates the container)
docker run --name syncflow-mongo -p 27017:27017 -d mongo:7
```

```bash
# If the container already exists
docker start syncflow-mongo
```

**Terminal 2: Install & Start Dashboard**

```bash
pnpm install && pnpm build:agent
cd packages/dashboard-web && pnpm dev
# UI: http://localhost:5173
# API: http://localhost:5050
```

**Terminal 3: Start Sample App**

```bash
cd examples/mern-sample-app && pnpm dev
# Server: http://localhost:4000
```

**Trigger Events:**

```bash
curl -X POST http://localhost:4000/api/users \
  -H "Content-Type: application/json" \
  -d '{"name":"User","email":"user@test.com"}'
```

**Terminal 4: Start Sample App-2 (optional)**

```bash
cd examples/mern-sample-app-2 && pnpm dev
# Server: http://localhost:4001
```

**Trigger Events:**

```bash
curl -X POST http://localhost:4001/api/users \
  -H "Content-Type: application/json" \
  -d '{"name":"User","email":"user+-app-2@test.com"}'
```

Open **http://localhost:5173** to see live traces.

---

## 📦 Monorepo Structure

```
syncflow/
├── packages/
│   ├── agent-node/        # TypeScript agent (Express + Mongoose hooks)
│   └── dashboard-web/     # React UI + Express server + AI insights
├── examples/
│   └── mern-sample-app*/  # Demo MERN backends (ports 4000, 4001)
└── pnpm-workspace.yaml
```

---

## ⚙️ Configuration

**Dashboard `.env.local`:**

Create `packages/dashboard-web/.env.local`:

| Variable                 | Required | Default                                        | Notes                                 |
| ------------------------ | -------- | ---------------------------------------------- | ------------------------------------- |
| `MONGODB_URI`            | No       | `mongodb://localhost:27017/syncflow-dashboard` | —                                     |
| `PORT`                   | No       | `5050`                                         | Dashboard server                      |
| `OPENAI_API_KEY`         | No       | —                                              | Required for AI Insights              |
| `ENABLE_AI_INSIGHTS`     | No       | `true`                                         | Disable to use heuristic analysis     |
| `INSIGHT_MODEL`          | No       | `gpt-5.2`                                      | OpenAI model to use                   |
| `DASHBOARD_API_KEY`      | No       | —                                              | Optional API key for server endpoints |
| `VITE_API_BASE`          | No       | `http://localhost:5050`                        | Frontend API endpoint                 |
| `VITE_SOCKET_URL`        | No       | `http://localhost:5050`                        | Frontend WebSocket endpoint           |
| `VITE_DASHBOARD_API_KEY` | No       | —                                              | Optional auth key exposed to frontend |

See [.env.example](./packages/dashboard-web/.env.example) for all variables (AI rate limiting, sampling, multi-tenant config, etc.).

**Sample app `.env`** (pre-configured):

- `SYNCFLOW_APP_NAME` — App identifier
- `SYNCFLOW_DASHBOARD_SOCKET_URL` — Points to dashboard server
- `SYNCFLOW_AGENT_KEY` — Agent authentication with dashboard
- `SYNCFLOW_TENANT_ID` — Optional, defaults to `local`

⚠️ **Never commit `.env` files.** Keep `OPENAI_API_KEY` and `DASHBOARD_API_KEY` private.

---

## 📜 Scripts

```bash
pnpm install          # Install dependencies
pnpm build            # Build all packages
pnpm dev              # Run everything in parallel
pnpm dev:agent        # Watch agent TypeScript
pnpm dev:dashboard    # Dashboard dev server
pnpm dev:server       # Express server only (no UI)
pnpm typecheck        # TypeScript check across all packages
pnpm format           # Format with Prettier
pnpm clean            # Remove node_modules and dist/
```

---

## 🏗️ Architecture

**Data Flow:**

```
MERN Backend (Express + Mongoose)
    ↓ Events via Socket.IO
Dashboard Server (Node + Socket.IO + MongoDB)
    ├─ Persists events
    ├─ Broadcasts to UIs
    └─ Generates AI insights (rate-limited, cached)
    ↓
Dashboard UI (React + Tailwind)
    ├─ Groups events into traces
    ├─ Full-text search + filters
    └─ Display AI insights
```

**Key Directories:**

- `packages/agent-node/` — Express/Mongoose hooks, Socket.IO client
- `packages/dashboard-web/src/` — React UI
- `packages/dashboard-web/server/` — Express API, MongoDB models
- `packages/dashboard-web/server/insights/` — AI insight engine

---

## 🤖 Features

**Agent:** Auto-instruments Express (requests/responses, latency) and Mongoose (queries, duration). Captures events with `traceId` correlation, event levels (`info`/`warn`/`error`), and redacts sensitive data (passwords, tokens, API keys).

**Dashboard:**

- Real-time trace streaming via Socket.IO
- Trace grouping by `traceId` (HTTP request + related DB operations)
- Search + filters: type (Express/Mongoose/Error), app, slow (>500ms), errors
- Export traces as JSON
- MongoDB persistence of all events

**AI Insights** (optional, with OpenAI API):

- Per-trace analysis: summary, severity, root cause, signals, suggestions
- Heuristic fallback (no API call) if OpenAI key is missing
- Rate-limited (default: 20/min) and sampled (configurable %) for production safety
- Cached in MongoDB, regenerate on demand
- Rate-limit countdown UI when throttled

---

## 🐛 Troubleshooting

| Issue                                         | Solution                                                                                                                                                                           |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **MongoDB connection error**                  | Ensure `mongod` or Docker container is running on port 27017. Check `MONGODB_URI` env var.                                                                                         |
| **Dashboard UI blank / doesn't load**         | Is Vite server running on 5173? Check browser console for CORS errors.                                                                                                             |
| **Traces not appearing**                      | Verify sample app is sending events: check `/api/traces` endpoint (`curl http://localhost:5050/api/traces`). Check agent `SYNCFLOW_DASHBOARD_SOCKET_URL` matches dashboard server. |
| **"Cannot find module @syncflow/agent-node"** | Run `pnpm build:agent` first to compile the package.                                                                                                                               |
| **Port already in use**                       | Change `PORT` (dashboard) or ports in `package.json` scripts. Example: `PORT=5051 pnpm dev:server`.                                                                                |
| **AI Insights disabled / not generating**     | Set `OPENAI_API_KEY` and `ENABLE_AI_INSIGHTS=true`. Check dashboard logs for API errors. Heuristic insights (no API) always work.                                                  |
| **Rate-limit error on insights**              | Wait for countdown or increase `AI_RATE_LIMIT_MAX` / `AI_RATE_LIMIT_WINDOW_MS`.                                                                                                    |
| **CORS errors from UI**                       | Ensure `VITE_API_BASE` and `VITE_SOCKET_URL` match your dashboard server URL. In production, set them to empty (`""`) to use same-origin.                                          |

---

## 📚 Package Documentation

Each package has its own detailed README:

- [**@syncflow/agent-node**](./packages/agent-node/README.md) — How to install and use the agent in your own MERN app
- [**dashboard-web**](./packages/dashboard-web/README.md) — Dashboard UI and server internals
- [**mern-sample-app**](./examples/mern-sample-app/README.md) — Minimal demo backend (port 4000)
- [**mern-sample-app-2**](./examples/mern-sample-app-2/README.md) — Second demo backend (port 4001)

---

## ✅ What's Implemented

**Agent:** Express/Mongoose auto-instrumentation, trace correlation, event levels, sensitive data redaction

**Dashboard:** Real-time Socket.IO streaming, trace grouping, search/filters, JSON export, MongoDB persistence, AI insights with caching and regeneration, rate limiting, multi-tenant support

---

## 🗺️ Roadmap

### ✅ Phase 1: Core Infrastructure

- Monorepo setup with pnpm workspaces
- TypeScript agent package with Socket.IO client
- React dashboard (Vite + TS + Tailwind v4)
- Socket.IO server on port 5050
- Express auto-instrumentation
- Mongoose hooks for DB event capture
- Sample MERN apps demonstrating integration (multi-app)

### ✅ Phase 2: Enhanced Monitoring

- Rich request/response + DB payloads
- Event levels + slow request detection
- Trace correlation (traceId)
- Trace grouping UI
- Search / filters
- Export JSON
- Trace persistence (MongoDB)

### ✅ Phase 3: AI Insights

- Server-powered AI insights per trace
- Cached insights + regenerate endpoint
- Better model/tooling prompts & structured output validation
- Rate limiting + sampling for production safety (implemented)

### 🚧 Phase 4: Production Ready

- Authentication and multi-tenant support
- Distributed tracing for microservices
- Historical metrics dashboards
- Alerting and notifications

## Deployment Notes

SyncFlow is currently deployed on Render for demo and internal testing purposes.

## 🤝 Contributing

1. Open an issue to discuss your idea
2. Fork and create a feature branch
3. Follow the code style (`pnpm format`)
4. Submit a pull request with a clear description

---

## 📄 License

MIT License — see [LICENSE](./LICENSE) for details.

Copyright (c) 2025 Noa Rabin Cohen
