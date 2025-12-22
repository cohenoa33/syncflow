# 🔄 SyncFlow

SyncFlow is an AI-powered full-stack dev assistant for MERN apps. It streams real-time backend/DB events to a React dashboard, traces errors across layers, and includes **AI Insights** to help devs debug faster and ship with confidence.

## 📦 Monorepo Structure

```
syncflow/
├── packages/
│   ├── agent-node/          # TypeScript agent for MERN apps
│   └── dashboard-web/       # React dashboard + Socket.IO server + API
├── examples/
│   └── mern-sample-app/     # Demo backend using the agent (port 4000)
│   └── mern-sample-app-2/     # Demo backend using the agent (port 4001)
├── pnpm-workspace.yaml      # pnpm workspace configuration
└── package.json             # Root package with scripts
```
## 🚀 Quick Start (4 Terminals)

### Prerequisites
- Node.js 18+ and pnpm installed (`npm install -g pnpm`)
- **MongoDB running locally** on port `27017`
  - Dashboard DB: `syncflow-dashboard`
  - Sample app DBs: `syncflow-demo`, `syncflow-demo-2`


### Terminal 1: Install Dependencies
```bash
pnpm install
```

### Terminal 1: Start MongoDB (Docker)
If you haven't created the container yet:
```bash
docker run --name syncflow-mongo -p 27017:27017 -d mongo:7
```
If you already created it:
```bash
docker start syncflow-mongo
```

### Terminal 2: Start SyncFlow WebSocket Server
```bash
pnpm -C packages/agent-node build
cd packages/dashboard-web
pnpm dev:server
```
- Server (Socket + API): http://localhost:5050

  
### Terminal 3: Start SyncFlow Dashboard UI
```bash
cd packages/dashboard-web
pnpm dev
```

#### Ports
- Dashboard UI: http://localhost:5173
- Socket/API server: http://localhost:5050
- Persisted traces API: http://localhost:5050/api/traces


### Terminal 4: Start Sample MERN App(s)
App 1 (port 4000):
```bash
cd examples/mern-sample-app
pnpm dev
```

App 2 (port 4001) (optional but recommended for multi-app testing):
```bash
cd examples/mern-sample-app-2
pnpm dev
```

### Trigger events
App 1:
```bash
curl -X POST http://localhost:4000/api/users \
  -H "Content-Type: application/json" \
  -d '{"name":"AppA","email":"appa+'$(date +%s)'@test.com"}'

curl http://localhost:4000/api/users
```

App 2:
```bash
curl -X POST http://localhost:4001/api/users \
  -H "Content-Type: application/json" \
  -d '{"name":"AppB","email":"appb+'$(date +%s)'@test.com"}'

curl http://localhost:4001/api/users
```

Open the dashboard and you’ll see live traces + DB operations.


### Demo Mode (multi-app seed)

The Dashboard has a **Demo Mode** button that:
	1.	Clears stored traces
	2.	Seeds demo traces for **multiple apps**
	3.	Lets you test **app filtering** quickly (without running both sample apps)


## 🤖 AI Insights (server-powered)

The dashboard can generate **server-powered AI Insights per trace**, including root-cause analysis, detected signals, and concrete suggestions.


### Local setup
Create packages/dashboard-web/.env.local:
```env
OPENAI_API_KEY=your_key_here
ENABLE_AI_INSIGHTS=true
INSIGHT_MODEL=gpt-5.2

# AI insight behavior
INSIGHT_TIMEOUT_MS=12000
INSIGHT_RETRIES=2

# AI rate limiting
AI_RATE_LIMIT_MAX=20
AI_RATE_LIMIT_WINDOW_MS=60000
```
### Production setup (Render)
Set environment variables in Render:
- OPENAI_API_KEY
- ENABLE_AI_INSIGHTS=true
- INSIGHT_MODEL=gpt-5.2

Notes:

- Insights are cached in MongoDB with a TTL-style freshness window (server-side)
- The UI shows **Fresh vs Cached** indicators with computed timestamps
- Regeneration is **rate-limited** to protect the system
- When rate-limited, the UI shows a live countdown until retry is allowed


## 📖 How It Works (Current MVP)

1. **Agent (packages/agent-node)**  
   Install `@syncflow/agent-node` in a MERN backend, initialize it once, then call:
   - `agent.connect()` to stream events to the dashboard
   - `agent.instrumentExpress(app)` to auto-capture request/response + latency
   - `agent.instrumentMongoose(mongoose)` to auto-capture DB operations  
   No manual `emit()` calls are required.

   - Events are labeled `info` by default and upgrade to `warn` if duration exceeds the agent’s `slowMsThreshold` (default 500ms).


2. **WebSocket/API Server (packages/dashboard-web/server)**  
Socket.IO server + REST API (port **5050**) that receives events from agents, persists them to MongoDB, and broadcasts updates to connected dashboards.
3. **	Dashboard UI (packages/dashboard-web)** 
A Vite React + Tailwind dashboard (port 5173) that shows incoming events in real time.
	- Componentized UI (packages/dashboard-web/src/components)
	- Shared config + helpers (packages/dashboard-web/src/lib)
	- App filtering via **multi-select app chips** (no dropdown)
	  - Default: **All apps selected**
	  - First click when “All” is active switches into “all except clicked”
	  - If no apps are selected, traces view is empty
	- AI Insights per trace via server endpoints (with Regenerate)
  
4. **Sample MERN Apps (examples/mern-sample-app, examples/mern-sample-app-2)**  
Minimal Express + Mongoose backends using the agent to demonstrate automatic event streaming.

   


## 🛠️ Development Scripts
> **Note:** `pnpm dev:all` uses `&` to run processes in parallel, which works on macOS/Linux.  
> On Windows, run the terminals separately (as shown in Quick Start) or switch to a cross-platform runner like `concurrently`.

From the root directory:

```bash
# Install all dependencies
pnpm install

# Build all packages
pnpm build

# Run everything in parallel (requires built agent)
pnpm dev

# Run individual packages
pnpm dev:agent      # Watch agent TypeScript
pnpm dev:dashboard  # Run dashboard dev server
pnpm dev:example    # Run sample MERN app

# Clean all build artifacts and node_modules
pnpm clean
```

## 📚 Package Documentation

- [Agent Node](./packages/agent-node/README.md) - TypeScript agent for MERN apps
- [Dashboard Web](./packages/dashboard-web/README.md) -  React dashboard + Socket.IO server + API
- [MERN Sample App](./examples/mern-sample-app/README.md) - Demo backend (port 4000)
- [MERN Sample App 2](./examples/mern-sample-app-2/README.md) - Demo backend (port 4001)

# ✅ What’s Implemented (so far)
### Agent
- Auto-instruments Express requests
- Auto-instruments Mongoose ops via global plugin
- Rich payloads: request/response + DB context
- Event levels `(info / warn / error)`
- Automatic sanitization of sensitive fields
- **Trace correlation** across Express → Mongoose using `traceId`

### Dashboard
- React + Tailwind UI (Vite)
- Live event stream via Socket.IO
- **Trace grouping** (collapsible request timelines)
- Status / slow / error badges per trace
- Search + filters (Slow only / Errors only)
- Export filtered traces to JSON
- ** Mongo persistence** of events + REST API
- **AI Insights** per trace (server-powered)
  - Cached with freshness window
  - Fresh vs Cached indicators
  - Regenerate with rate limiting + countdown UI






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

### 🚧 Phase 3: AI Insights (Near Complete)
- Server-powered AI insights per trace
- Cached insights + regenerate endpoint
- Better model/tooling prompts & structured output validation
- Rate limiting + sampling for production safety

### 🎯 Phase 4: Production Ready (Future)
- Authentication and multi-tenant support
- Distributed tracing for microservices
- Historical metrics dashboards
- Alerting and notifications
- Production-safe sampling and rate limiting


## 🤝 Contributing

Contributions are welcome! Please feel free to submit issues or pull requests.

## Deployment Notes

SyncFlow is currently deployed on Render for demo and internal testing purposes.


## 📄 License

MIT License - see [LICENSE](./LICENSE) for details.

Copyright (c) 2025 Noa Rabin Cohen
