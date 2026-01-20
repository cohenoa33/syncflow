# @syncflow/dashboard-web

Real-time monitoring dashboard for MERN applications. Combines a **React UI** and **Express API server** to display live traces, search/filter events, and generate AI-powered insights.

Built with: **Vite**, **React**, **TypeScript**, **Tailwind CSS v4**, **Express**, **Socket.IO**, and **MongoDB**.

---

## ✨ Features

### Monitoring & Search

- 📊 **Live trace stream** from instrumented MERN apps via Socket.IO
- 🧵 **Traces grouped by traceId** — visualize Express and Mongoose operations in a single timeline
- 🔍 **Full-text search** across routes, DB operations, app names, and payload text
- 🏷️ **Type filters**: Express, Mongoose, Error (combined or individual)
- 🎯 **App filtering** via multi-select chips (smart toggle: all → all except clicked)
- ⚡ **Fast filters**: slow traces only, errors only
- 📤 **Export** currently filtered traces as JSON

### AI Insights (Optional)

- 🤖 **AI-powered root cause analysis** per trace (OpenAI-powered)
- 💾 **Cached in MongoDB** with freshness window (default: 1 hour)
- 🔄 **Manual regenerate** button to force recomputation
- 🎛️ **Sampling** for production safety — skip insights for N% of traces or errors-only
- 🚦 **Rate limiting** — configurable max requests per time window
- 🚫 **Graceful degradation** — clear error codes (INSIGHT_SAMPLED_OUT, AI_RATE_LIMITED, etc.)

### UX

- 🎨 **Modern Tailwind CSS v4** responsive design
- ⚡ **Instant feedback** — live traces without page refresh
- ⌨️ **Keyboard shortcuts**:
  - `E` → toggle latest event payload
  - `Shift+E` → expand/collapse all payloads
- 🎭 **Demo Mode** — seed realistic traces for UI testing/demoing

---

## ⚡ Quickstart

### Prerequisites

- **Node.js** 18+, **pnpm** (monorepo package manager)
- **MongoDB** running: `brew services start mongodb-community` (macOS) or `docker run -d -p 27017:27017 mongo:latest`

### Setup & Run

```bash
# 1. Navigate to package
cd packages/dashboard-web

# 2. Copy and edit environment config
cp .env.example .env.local
# Edit .env.local if needed (default values work for local dev)

# 3. Start dashboard (both UI + API server)
pnpm dev
```

**Done!** Open http://localhost:5173 (UI) and http://localhost:5050 (API).

### Next Steps

1. Start an instrumented app (e.g., `examples/mern-sample-app`)
2. Or click **Load Demo Data** button to seed test traces
3. See [Configuration](#configuration) for env vars and features

---

## ⚙️ Configuration

### Environment Setup

**Development**: Copy `.env.example` to `.env.local` and edit as needed:

```bash
cp .env.example .env.local
```

The `pnpm dev` command automatically loads `.env.local` via `dotenv.config()` in `server/dev.ts`.

**Production**: Set env vars at runtime (via Docker, environment variables, or deployment platform):

```bash
export MONGODB_URI="mongodb://..."
export PORT=5050
export OPENAI_API_KEY="sk-proj-..."
# etc.
pnpm start
```

### Environment Variables

All env vars go in `.env.local` (dev) or are set at runtime (prod). See [`.env.example`](.env.example) for full list.

**Core**:

- `MONGODB_URI` — Default: `mongodb://localhost:27017/syncflow-dashboard`
- `PORT` — Default: `5050`
- `VITE_API_BASE` — Default: same-origin (empty uses current origin)
- `VITE_SOCKET_URL` — Default: same-origin

**API Authentication** (optional):

- `DASHBOARD_API_KEY`, `VITE_DASHBOARD_API_KEY` — Protect `/api/` endpoints and browser requests

**Multi-Tenant** (optional):

- `DEFAULT_TENANT_ID`, `VITE_TENANT_ID` — Default: `local`
- `TENANTS_JSON` — JSON config for multiple tenants

**AI Insights** (optional):

- `ENABLE_AI_INSIGHTS` — Default: `true`
- `OPENAI_API_KEY` — Required if insights enabled
- `INSIGHT_MODEL` — Default: `gpt-5.2`
- `INSIGHT_TIMEOUT_MS`, `INSIGHT_RETRIES` — Defaults: `12000`, `2`

**Sampling & Rate Limiting**:

- `AI_INSIGHT_SAMPLE_RATE` — Default: `1` (generate all)
- `AI_INSIGHT_SAMPLE_ERRORS_ONLY` — Default: `false`
- `AI_RATE_LIMIT_MAX`, `AI_RATE_LIMIT_WINDOW_MS` — Defaults: `20`, `60000`

⚠️ Never commit `.env.local` or API keys.

---

## 📜 Scripts

Run from `packages/dashboard-web`:

```bash
# Development (Vite + Server with hot-reload)
pnpm dev

# Development (Vite only, port 5173)
pnpm dev:vite

# Development (Server only with tsx watch, port 5050)
pnpm dev:server

# Build for production (compiles frontend + server)
pnpm build

# Type-check (without emitting)
pnpm typecheck

# Preview production build (static preview, no server)
pnpm preview

# Run production server (compiled)
pnpm start
```

---

## 🏗️ Architecture

**High-level**: React UI (Vite) → Express + Socket.IO server → MongoDB + OpenAI

### Frontend (`src/`)

- **App.tsx**: State management, real-time Socket.IO connection
- **components/**: UI for traces, filters, insights
- **lib/**: Utilities for tracing, filtering, API calls

### Backend (`server/`)

- **index.ts**: Express + Socket.IO server
- **routes/**: REST endpoints (`/api/traces`, `/api/insights`, `/api/demo-seed`)
- **socket.ts**: Real-time event broadcast and agent registry
- **insights/**: OpenAI integration with sampling & rate limiting
- **models/**: MongoDB schemas (EventModel, InsightModel)

### Data Flow

1. **Agent connects** → Socket.IO registration → added to agent list
2. **Agent sends event** → broadcast to all dashboards via Socket.IO + persisted to MongoDB
3. **User clicks insight** → API fetches cached insight or generates new one (respecting sampling & rate limits)
4. **Load Demo Data** → clears DB and seeds 4 sample traces with realistic data

**Key defaults**:

- Max 1000 events in-memory buffer
- 1-hour insight cache TTL
- Multi-tenant isolation via `tenantId`

---

## 🔌 API Reference

### REST Endpoints

#### **Traces**

```http
GET /api/traces
```

Returns up to 1000 most recent events, sorted by timestamp.  
**Headers**: `X-Tenant-Id`, `Authorization: Bearer <DASHBOARD_API_KEY>`  
**Response**: Array of Event objects.

```http
DELETE /api/traces
```

Deletes all events and insights for the current tenant.  
**Headers**: `X-Tenant-Id`, `Authorization: Bearer <DASHBOARD_API_KEY>`  
**Response**: `{ "ok": true }`

#### **Insights**

```http
GET /api/insights/:traceId
```

Fetches insight for a trace. Returns cached if fresh (< 1 hour), else computes and caches.

**Headers**: `X-Tenant-Id`, `Authorization: Bearer <DASHBOARD_API_KEY>`

**Response (Success):**

```json
{
  "ok": true,
  "insight": {
    "rootCause": "...",
    "signals": [...],
    "suggestions": [...]
  },
  "cached": true,
  "computedAt": 1234567890,
  "tenantId": "local"
}
```

**Response (Sampled Out):**

```json
{
  "ok": false,
  "error": "INSIGHT_SAMPLED_OUT",
  "message": "This trace was excluded by sampling policy."
}
```

**Response (Rate Limited):**

```json
{
  "ok": false,
  "error": "AI_RATE_LIMITED",
  "message": "Rate limit exceeded.",
  "retryAfterMs": 30000
}
```

**Response (Trace Not Found):**

```json
{
  "ok": false,
  "error": "TRACE_NOT_FOUND",
  "message": "No events found for this trace."
}
```

```http
POST /api/insights/:traceId/regenerate
```

Force regenerate insight (bypasses cache, respects sampling & rate limits).

**Headers**: `X-Tenant-Id`, `Authorization: Bearer <DASHBOARD_API_KEY>`  
**Response**: Same as GET.

#### **Demo**

```http
POST /api/demo-seed
```

Seeds demo traces for testing. Clears existing traces first.

**Body** (optional):

```json
{
  "apps": ["mern-sample-app", "mern-sample-app-2"]
}
```

**Headers**: `X-Tenant-Id`, `Authorization: Bearer <DASHBOARD_API_KEY>`  
**Response**:

```json
{
  "ok": true,
  "count": 15,
  "traceIdsByApp": { "mern-sample-app": [...] },
  "tenantId": "local"
}
```

### Socket.IO Events

**Client → Server:**

- `join_tenant({ tenantId })` — Join room for real-time updates
- `register({ appName, token, tenantId })` — Agent registers itself

**Server → Client:**

- `event(Event)` — New event from instrumented app
- `agents(Agent[])` — List of connected agents
- `eventHistory(Event[])` — Full event history (on clear)

---

## 🚀 Running in Production

### Build

```bash
pnpm build
```

Outputs:

- Compiled frontend → `dist/`
- Ready-to-serve static files in `dist/`

### Start

```bash
# Set env vars from .env.production, then start server:
pnpm start
```

Or via Docker:

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY . .
RUN pnpm install && pnpm build
EXPOSE 5050
# Pass env vars at runtime (e.g., docker run -e MONGODB_URI=... -e PORT=5050)
CMD ["pnpm", "start"]
```

### Key Differences from Dev

- UI is served statically from `dist/` (no separate Vite server)
- Env vars must be set externally at runtime (not loaded from `.env.production` file)
- Set `VITE_API_BASE=` (empty) to use same-origin for API calls
- Set `VITE_SOCKET_URL=` (empty) to use same-origin for Socket.IO

---

## 🧪 Demo Mode

Click **Load Demo Data** button to seed 4 sample traces with realistic data. Useful for walkthroughs, testing filters, and validating insights without live agents.

---

## 🐛 Troubleshooting

**MongoDB won't connect**: Ensure MongoDB is running. Try `brew services start mongodb-community` or Docker: `docker run -d -p 27017:27017 mongo:latest`

**Dashboard won't load (404)**: `pnpm dev` must be running. Check terminal for Vite/Express output. Visit http://localhost:5173 directly.

**Traces don't appear**: Start an instrumented agent (`examples/mern-sample-app`) or click **Load Demo Data** button in dashboard.

**AI Insights failing**: Add `OPENAI_API_KEY=sk-proj-...` to `.env.local` and restart `pnpm dev`. Insights are optional.

**Port already in use**: Kill the process or change `PORT` in `.env.local`. Example: `lsof -ti:5050 | xargs kill -9`

**`INSIGHT_SAMPLED_OUT` error**: Not an error—just means your sampling settings excluded this trace. Increase `AI_INSIGHT_SAMPLE_RATE` to 1.0 to fix.

---

## 📚 Related Packages

- [**@syncflow/agent-node**](../../packages/agent-node/README.md) — Instrumentation library
- [**examples/mern-sample-app**](../../examples/mern-sample-app/README.md) — Sample app

---

## 📝 Notes

- MongoDB must run before dashboard starts
- Node.js 18+ required
- pnpm is the monorepo package manager
- OPENAI_API_KEY optional (insights gracefully skip if missing)
- Full-stack design: UI + API server in one package for simplicity
- API key auth optional (set `DASHBOARD_API_KEY` to enable)
- Multi-tenant support via `X-Tenant-Id` header

---

## � Scope & External Dependencies

**This package owns:**

- React UI (Vite + TypeScript + Tailwind)
- Express server with Socket.IO
- MongoDB models and schema
- OpenAI integration for insights (via `openai` npm package)

**This package does NOT own:**

- MongoDB instance (you run it separately or via Docker)
- OpenAI account/keys (you provide your own)
- Agent instrumentation (provided by `@syncflow/agent-node` package)
- Monorepo package management (handled by root `pnpm-workspace.yaml`)

---

## �📄 License

MIT. See [LICENSE](../../LICENSE).

© 2025 Noa Rabin Cohen
