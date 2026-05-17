# @syncflow/dashboard-web

Real-time monitoring dashboard for MERN applications. Combines a **React UI** and **Express API server** to display live traces, search/filter events, and generate AI-powered insights.

Built with: **Vite**, **React**, **TypeScript**, **Tailwind CSS v4**, **Express**, **Socket.IO**, and **MongoDB**.

---

## ✨ Features

### Monitoring & Search

- 📈 **Historical Metrics** — error rate, p95/p50 latency, and request volume over 1h / 24h / 7d, with per-app filtering
- 📊 **Live trace stream** from instrumented MERN apps via Socket.IO
- 🧵 **Traces grouped by traceId** — visualize Express and Mongoose operations in a single timeline
- 🔍 **Full-text search** across routes, DB operations, app names, and payload text
- 🏷️ **Type filters**: Express, Mongoose, Error (combined or individual)
- 🎯 **App filtering** via multi-select chips (smart toggle: all → all except clicked)
- ⚡ **Fast filters**: slow traces only, errors only
- 📤 **Export** currently filtered traces as JSON
- 🔗 **Distributed trace detection** — traces spanning multiple services are visually flagged; upstream caller shown per event

### AI Insights (Optional)

- 🤖 **AI-powered root cause analysis** per trace (OpenAI-powered)
- 💾 **Cached in MongoDB** with freshness window (default: 1 hour)
- 🔄 **Manual regenerate** button to force recomputation
- 🎛️ **Sampling** for production safety — skip insights for N% of traces or errors-only
- 🚦 **Rate limiting** — configurable max requests per time window
- 🚫 **Graceful degradation** — clear error codes (INSIGHT_SAMPLED_OUT, AI_RATE_LIMITED, etc.)

### Alerting

- 🚨 **Threshold-based alert rules** — error rate, p95 latency, slow rate, request volume
- 🔔 **Real-time in-app toast notifications** via Socket.IO (top-right corner, auto-dismiss after 8s)
- 📋 **Paginated alert history** — 25 rows per page, next/previous navigation, total count
- 🔍 **Filter history** by metric type and rule name (live substring search with debounce)
- 🗑️ **Automatic 7-day history cleanup** — daily cron deletes alert fires older than 7 days
- ⏱️ **Per-rule cooldown** to prevent notification spam (default: 1 hour)
- 🔇 **Enable/disable rules** without deleting them
- ⚙️ **Configurable evaluation schedule** via `ALERT_EVAL_CRON` (default: every 5 minutes)
- 🎭 **Demo-data fallback** — alert evaluator falls back to demo traffic when no real events exist in the window

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
- `CORS_ALLOWED_ORIGINS` — Comma-separated list of allowed request origins. Default: `http://localhost:5173`. Set to your production dashboard URL(s) in production (e.g. `https://dashboard.example.com`).
- `VITE_API_BASE` — Default: same-origin (empty uses current origin)
- `VITE_SOCKET_URL` — Default: same-origin

**Viewer Authentication** (when `TENANTS_JSON` is configured):

- `VITE_DASHBOARD_API_KEY` — Viewer token sent as `Authorization: Bearer <viewer-token>`

**Multi-Tenant Configuration** (REQUIRED):

⚠️ **Tenant ID is now REQUIRED everywhere** - no default fallbacks

See [Multi-Tenant Setup](#multi-tenant-setup) below for detailed examples.

- `AUTH_MODE` — `strict` (production) or `dev` (default, local dev only)
- `TENANTS_JSON` — JSON config for all tenants and their apps
- `VITE_TENANT_ID` — Dashboard UI tenant (REQUIRED - must be explicitly set)

**Important**:

- All HTTP API requests MUST include `X-Tenant-Id` header
- All Socket.IO connections MUST provide explicit `tenantId`
- Instrumented apps MUST set `SYNCFLOW_TENANT_ID` environment variable
- UI will fail to start if `VITE_TENANT_ID` is not set


**Real data vs Demo Mode**: If `TENANTS_JSON` is not configured, the dashboard UI will start but real traces from agents will not appear.
In this mode:
- Viewer routes return empty results.-
- Agent connections are not accepted.
- Demo Mode is the intended way to explore the UI.


To see real traces from instrumented apps, configure `TENANTS_JSON` and matching agent credentials.


**Demo Mode** (optional):

- `DEMO_MODE_ENABLED` — Enable/disable demo mode toggle (default: `false`)
- `DEMO_MODE_TOKEN` — Server-only demo token (strict mode: required to enable demo; placement depends on `TENANTS_JSON`)
- `VITE_DEMO_MODE_TOKEN` — Frontend demo token (must match `DEMO_MODE_TOKEN` in strict mode)

**AI Insights** (optional):

- `ENABLE_AI_INSIGHTS` — Default: `true`
- `OPENAI_API_KEY` — Required if insights enabled
- `INSIGHT_MODEL` — Default: `gpt-5.2`
- `INSIGHT_TIMEOUT_MS`, `INSIGHT_RETRIES` — Defaults: `12000`, `2`

**Sampling & Rate Limiting**:

- `AI_INSIGHT_SAMPLE_RATE` — Default: `1` (generate all)
- `AI_INSIGHT_SAMPLE_ERRORS_ONLY` — Default: `false`
- `AI_RATE_LIMIT_MAX`, `AI_RATE_LIMIT_WINDOW_MS` — Defaults: `20`, `60000`

**Alerting**:

- `ALERT_EVAL_CRON` — Cron expression for alert evaluation. Default: `*/5 * * * *` (every 5 minutes)

⚠️ Never commit `.env.local` or API keys.

---

## 🔐 Auth & Demo Mode (test-aligned)

### Environment variables (auth/demo)

- `TENANTS_JSON`: Non-empty enables tenant-aware viewer auth. Empty/absent means no viewer token required; `/api/traces` returns `[]`.
- `AUTH_MODE`: `dev` or `strict`.
- `DEMO_MODE_ENABLED`
- `DEMO_MODE_TOKEN`

### Public config endpoint

`GET /api/config` is public (no auth) and returns only: `demoModeEnabled`, `requiresDemoToken`, `hasTenantsConfig`.

`demoModeEnabled` is true only when:

- `DEMO_MODE_ENABLED=true`, and
- (`AUTH_MODE=dev`) OR (`AUTH_MODE=strict` AND `DEMO_MODE_TOKEN` is non-empty)

### Auth failure rate limiting

The server tracks failed auth attempts per client IP. After **20 failed attempts within 60 seconds**, the IP receives a `429 Too Many Requests` response until the window resets. This applies to: missing/unknown tenant, missing/invalid Bearer token.

### Header requirements (HTTP + Socket.IO)

- All `/api/*` routes require `X-Tenant-Id` (including demo routes).
- Viewer routes: `/api/traces`, `/api/insights/*`
  - If `TENANTS_JSON` is configured: require `Authorization: Bearer <viewer-token>`.
  - If `TENANTS_JSON` is empty/absent and `AUTH_MODE=dev`: no `Authorization` required.
- Socket.IO (UI):
  - Handshake auth payload: `{ kind: "ui", tenantId, token? }`
  - `tenantId` is always required
  - `token` is required when `TENANTS_JSON` is configured
  - `join_tenant` remains allowed in dev mode with empty `TENANTS_JSON`

### Demo routes (`/api/demo-seed`)

- If `DEMO_MODE_ENABLED=false`: demo routes return 403 (`DEMO_MODE_DISABLED`).
- Strict mode:
  - If `DEMO_MODE_TOKEN` is empty:
    - `/api/config` reports `demoModeEnabled=false`, `requiresDemoToken=false`
    - demo routes behave as disabled (403)
  - If `DEMO_MODE_TOKEN` is set:
    - If `TENANTS_JSON` is configured:
      - Require BOTH:
        - `Authorization: Bearer <viewer-token>`
        - `X-Demo-Token: <demo-token>`
      - Reject demo token in `Authorization`
      - Reject `X-Demo-Token` without viewer `Authorization`
      - Invalid `X-Demo-Token` → 401
      - Invalid viewer token → 401 even if demo token is valid
    - If `TENANTS_JSON` is NOT configured:
      - Require demo token ONLY via `Authorization: Bearer <demo-token>`
      - Reject `X-Demo-Token` usage (401)
- Dev mode: demo routes do not require a demo token (but still require `X-Tenant-Id`).

### Auth matrix (compact)

- **dev + TENANTS_JSON empty** → `X-Tenant-Id` → `/api/traces` returns `[]`, demo ok without demo token.
- **dev + TENANTS_JSON configured** → `X-Tenant-Id` + `Authorization: Bearer <viewer-token>` → viewer routes ok; demo routes require viewer auth only.
- **strict + TENANTS_JSON configured** → `X-Tenant-Id` + `Authorization: Bearer <viewer-token>` → viewer routes ok; demo routes also require `X-Demo-Token`.
- **strict + TENANTS_JSON empty** → `X-Tenant-Id` → `/api/traces` returns `[]`; demo routes require `Authorization: Bearer <demo-token>` if demo is enabled.

### Minimal examples

Viewer routes:

```bash
# strict + TENANTS_JSON configured
curl http://localhost:5050/api/traces \
  -H "X-Tenant-Id: tenant-a" \
  -H "Authorization: Bearer viewer-token"

# dev + TENANTS_JSON empty
curl http://localhost:5050/api/traces \
  -H "X-Tenant-Id: any-tenant"
```

Demo routes:

```bash
# strict + TENANTS_JSON configured (requires BOTH viewer + demo)
curl -X POST http://localhost:5050/api/demo-seed \
  -H "X-Tenant-Id: tenant-a" \
  -H "Authorization: Bearer viewer-token" \
  -H "X-Demo-Token: demo-token"

# strict + TENANTS_JSON empty (demo token ONLY in Authorization)
curl -X POST http://localhost:5050/api/demo-seed \
  -H "X-Tenant-Id: any-tenant" \
  -H "Authorization: Bearer demo-token"
```

Socket.IO auth payloads:

```ts
// dev + TENANTS_JSON empty
{ kind: "ui", tenantId: "tenant-a" }

// strict + TENANTS_JSON configured
{ kind: "ui", tenantId: "tenant-a", token: "viewer-token" }
```

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
- **routes/**: REST endpoints (`/api/traces`, `/api/insights`, `/api/metrics`, `/api/alerts`, `/api/demo-seed`)
- **socket.ts**: Real-time event broadcast and agent registry
- **insights/**: OpenAI integration with sampling & rate limiting
- **alerts/**: Alert rule evaluator (cron, every 5 min) and daily history cleanup cron
- **models/**: MongoDB schemas (EventModel, InsightModel, AlertRuleModel, AlertFireModel)

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

#### **Config**

```http
GET /api/config
```

Public (no auth). Returns only:

```json
{
  "demoModeEnabled": true,
  "requiresDemoToken": true,
  "hasTenantsConfig": true
}
```

#### **Traces**

```http
GET /api/traces
```

Returns up to 1000 most recent events, sorted by timestamp.  
**Headers**: `X-Tenant-Id` (required), `Authorization: Bearer <viewer-token>` (when `TENANTS_JSON` is configured)

**Example:**

```bash
curl http://localhost:5050/api/traces \
  -H "X-Tenant-Id: my-tenant" \
  -H "Authorization: Bearer viewer-token"
```

**Response**: Array of Event objects.

```http
DELETE /api/traces
```

Deletes all events and insights for the current tenant.  
**Headers**: `X-Tenant-Id` (required), `Authorization: Bearer <viewer-token>` (when `TENANTS_JSON` is configured)

**Example:**

```bash
curl -X DELETE http://localhost:5050/api/traces \
  -H "X-Tenant-Id: my-tenant" \
  -H "Authorization: Bearer viewer-token"
```

**Response**: `{ "ok": true }`

#### **Insights**

```http
GET /api/insights/:traceId
```

Fetches insight for a trace. Returns cached if fresh (< 1 hour), else computes and caches.

**Headers**: `X-Tenant-Id` (required), `Authorization: Bearer <viewer-token>` (when `TENANTS_JSON` is configured)

**Example:**

```bash
curl http://localhost:5050/api/insights/abc123 \
  -H "X-Tenant-Id: my-tenant" \
  -H "Authorization: Bearer viewer-token"
```

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
  "tenantId": "my-tenant"
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

**Headers**: `X-Tenant-Id` (required), `Authorization: Bearer <viewer-token>` (when `TENANTS_JSON` is configured)

**Example:**

```bash
curl -X POST http://localhost:5050/api/insights/abc123/regenerate \
  -H "X-Tenant-Id: my-tenant" \
  -H "Authorization: Bearer viewer-token"
```

**Response**: Same as GET.

#### **Metrics**

```http
GET /api/metrics
```

Returns time-bucketed statistics for `express` events within the requested window.

**Headers**: `X-Tenant-Id` (required), `Authorization: Bearer <viewer-token>` (when `TENANTS_JSON` is configured)

**Query params**:

| Param | Values | Default | Description |
|-------|--------|---------|-------------|
| `window` | `1h` \| `24h` \| `7d` | `24h` | Time window. Bucket sizes: 5 min / 1 hr / 6 hr |
| `appName` | string | — | Filter to a single app (omit for all apps) |

**Example:**

```bash
curl "http://localhost:5050/api/metrics?window=24h" \
  -H "X-Tenant-Id: my-tenant" \
  -H "Authorization: Bearer viewer-token"
```

**Response:**

```json
{
  "ok": true,
  "window": "24h",
  "buckets": [
    {
      "ts": 1700000000000,
      "total": 42,
      "errors": 2,
      "errorRate": 0.047,
      "p50": 120,
      "p95": 480,
      "p99": 950,
      "slowCount": 3
    }
  ],
  "summary": {
    "totalRequests": 1024,
    "errorRate": 0.032,
    "p95Latency": 450,
    "slowRate": 0.08
  },
  "appName": null
}
```

Returns `buckets: []` and zeroed summary when no data exists in the window.

#### **Alerts**

```http
GET /api/alerts/rules
```

List all alert rules for the current tenant, sorted by creation date descending.

**Headers**: `X-Tenant-Id` (required), `Authorization: Bearer <viewer-token>` (when `TENANTS_JSON` is configured)

**Response**: `{ "ok": true, "rules": [...] }`

```http
POST /api/alerts/rules
```

Create a new alert rule.

**Body**:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string (1–100 chars) | ✅ | Human-readable label |
| `metric` | `"errorRate"` \| `"p95Latency"` \| `"slowRate"` \| `"requestVolume"` | ✅ | Metric to watch |
| `threshold` | number (> 0) | ✅ | Trigger when metric exceeds this value |
| `window` | `"1h"` \| `"24h"` \| `"7d"` | — | Evaluation window (default: `"1h"`) |
| `appName` | string \| null | — | Scope to one app; null = all apps (default: `null`) |
| `enabled` | boolean | — | Whether rule is active (default: `true`) |
| `cooldownMs` | integer (> 0) | — | Min ms between repeated fires (default: `3600000`) |

**Response**: `{ "ok": true, "rule": {...} }` or `400 { "ok": false, "error": "VALIDATION_ERROR", "issues": [...] }`

```http
PUT /api/alerts/rules/:id
```

Update any fields of an existing rule (partial update). Returns 404 if not found or belongs to another tenant.

**Response**: `{ "ok": true, "rule": {...} }`

```http
DELETE /api/alerts/rules/:id
```

Delete a rule. Returns 404 if not found or belongs to another tenant.

**Response**: `{ "ok": true }`

```http
GET /api/alerts/history
```

Paginated list of fired alerts, sorted newest first.

**Headers**: `X-Tenant-Id` (required), `Authorization: Bearer <viewer-token>` (when `TENANTS_JSON` is configured)

**Query params**:

| Param | Default | Description |
|-------|---------|-------------|
| `page` | `0` | 0-indexed page number |
| `pageSize` | `25` | Rows per page (max 100) |
| `metric` | — | Filter by metric: `errorRate`, `p95Latency`, `slowRate`, `requestVolume` |
| `q` | — | Case-insensitive substring match on rule name |
| `ruleId` | — | Filter to fires from a specific rule |

**Response**: `{ "ok": true, "history": [...], "total": 142, "page": 0, "pageSize": 25 }`

> Alert fires older than 7 days are automatically deleted by a daily cleanup cron (runs at 02:00).

#### **Demo**

```http
POST /api/demo-seed
```

Seeds demo traces for testing. Clears existing demo traces first.

**Headers**:

- Always: `X-Tenant-Id`
- Strict + `TENANTS_JSON` configured: `Authorization: Bearer <viewer-token>` **and** `X-Demo-Token: <demo-token>`
- Strict + `TENANTS_JSON` empty: `Authorization: Bearer <demo-token>` (rejects `X-Demo-Token`)
- Dev mode: no demo token required

**Body** (optional):

```json
{
  "apps": ["demo-my-tenant-app", "demo-app-my-tenant"]
}
```

**Example:**

```bash
curl -X POST http://localhost:5050/api/demo-seed \
  -H "X-Tenant-Id: my-tenant" \
  -H "Authorization: Bearer viewer-token" \
  -H "X-Demo-Token: demo-token" \
  -H "Content-Type: application/json" \
  -d '{"apps": ["demo-my-tenant-app"]}'
```

**Response**:

```json
{
  "ok": true,
  "count": 15,
  "traceIdsByApp": { "demo-my-tenant-app": [...] },
  "tenantId": "my-tenant"
}
```

### Socket.IO Events

**UI handshake auth payload**:

- `{ kind: "ui", tenantId, token? }`
- `tenantId` is required
- `token` is required when `TENANTS_JSON` is configured

**Client → Server:**

- `join_tenant({ tenantId })` — Join room for real-time updates
- `register({ appName, token, tenantId })` — Agent registers itself

**Server → Client:**

- `event(Event)` — New event from instrumented app
- `agents(Agent[])` — List of connected agents
- `eventHistory(Event[])` — Full event history (on clear)
- `alert_fired(InAppAlertNotification)` — Emitted to the tenant room when an alert rule fires; triggers an in-app toast and refreshes the history list

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

Demo mode is a **tenant-scoped toggle** that switches the UI between real and demo data.

### Setup

```bash
DEMO_MODE_ENABLED=true
DEMO_MODE_TOKEN=demo-secret-key
VITE_DEMO_MODE_TOKEN=demo-secret-key
```

### Rules (test-aligned)

- If `DEMO_MODE_ENABLED=false`: demo routes return 403 (`DEMO_MODE_DISABLED`).
- Strict mode: demo is enabled only when `DEMO_MODE_TOKEN` is non-empty.
- Token placement:
  - `TENANTS_JSON` configured → `Authorization: Bearer <viewer-token>` **and** `X-Demo-Token: <demo-token>`
  - `TENANTS_JSON` empty → `Authorization: Bearer <demo-token>` only (`X-Demo-Token` rejected)
- Dev mode: no demo token required (still requires `X-Tenant-Id`).

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
- Viewer auth required when `TENANTS_JSON` is configured (use `Authorization: Bearer <viewer-token>`)
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
