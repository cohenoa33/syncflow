# 🔄 SyncFlow

SyncFlow is an AI-powered full-stack dev assistant for MERN apps. It streams real-time backend/DB events to a React dashboard, traces errors across layers, and will add automated test generation + performance insights to help devs debug faster and ship with confidence.

## 📦 Monorepo Structure

```
syncflow/
├── packages/
│   ├── agent-node/          # TypeScript agent for MERN apps
│   └── dashboard-web/       # React dashboard + Socket.IO server
├── examples/
│   └── mern-sample-app/     # Demo backend using the agent
├── pnpm-workspace.yaml      # pnpm workspace configuration
└── package.json             # Root package with scripts
```

## 🚀 Quick Start (4 Terminals)

### Prerequisites
- Node.js 18+ and pnpm installed (`npm install -g pnpm`)
- **MongoDB running locally** on port `27017`
  - Dashboard DB: `syncflow-dashboard`
  - Sample app DB: `syncflow-demo`

### Terminal 1: Install Dependencies
```bash
pnpm install

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
- Socket.IO server: http://localhost:5050
  
### Terminal 3: Start SyncFlow Dashboard UI
```bash
pnpm -C packages/dashboard-web dev
cd packages/dashboard-web
pnpm dev
```

#### Ports
- Dashboard UI: http://localhost:5173
- Socket/API server: http://localhost:5050
- Persisted traces API: http://localhost:5050/api/traces


### Terminal 4: Start Sample MERN App
```bash
pnpm -C examples/mern-sample-app dev
cd examples/mern-sample-app
pnpm dev
```
#### Port
- Sample API: http://localhost:4000

#### Trigger events: 
```bash 
curl -X POST http://localhost:4000/api/users \
  -H "Content-Type: application/json" \
  -d '{"name":"[NAME]","email":"[NAME]+'$(date +%s)'@test.com"}'

curl http://localhost:4000/api/users
```

Open the dashboard and you’ll see live traces + DB operations.

## 📖 How It Works (Current MVP)

1. **Agent (packages/agent-node)**  
   Install `@syncflow/agent-node` in a MERN backend, initialize it once, then call:
   - `agent.connect()` to stream events to the dashboard
   - `agent.instrumentExpress(app)` to auto-capture request/response + latency
   - `agent.instrumentMongoose(mongoose)` to auto-capture DB operations  
   No manual `emit()` calls are required.

   - Events are labeled `info` by default and upgrade to `warn` if duration exceeds the agent’s `slowMsThreshold` (default 500ms).


2. **WebSocket Server (packages/dashboard-web/server)**  
   A tiny Socket.IO server (port **5050**) that receives events from agents and broadcasts them to any open dashboards.

3. **Dashboard UI (packages/dashboard-web)**  
   A Vite React + Tailwind dashboard (port **5173**) that shows incoming events in real time.

4. **Sample MERN App (examples/mern-sample-app)**  
   A minimal Express + Mongoose backend using the agent to demonstrate automatic event streaming.


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
- [Dashboard Web](./packages/dashboard-web/README.md) - React dashboard + Socket.IO server
- [MERN Sample App](./examples/mern-sample-app/README.md) - Demo backend

# ✅ What’s Implemented (so far)

### Agent
- Auto-instruments Express requests
- Auto-instruments Mongoose ops via global plugin
- Rich payloads: request/response + DB context
- Event levels (`info` / `warn` / `error`)
- Automatic sanitization of sensitive fields
- **Trace correlation** across Express → Mongoose using `traceId`

### Dashboard
- React + Tailwind UI (Vite)
- Live event stream via Socket.IO
- **Trace grouping** (collapsible request timelines)
- Status / slow / error badges per trace
- Search + filters (Slow only / Errors only)
- Export filtered traces to JSON
- **Mongo persistence** of events + REST API

## 🗺️ Roadmap

### ✅ Phase 1: Core Infrastructure
- [x] Monorepo setup with pnpm workspaces
- [x] TypeScript agent package with Socket.IO client
- [x] React dashboard (Vite + TS + Tailwind v4)
- [x] Socket.IO server on port 5050
- [x] Express auto-instrumentation
- [x] Mongoose hooks for DB event capture
- [x] Sample MERN app demonstrating integration

### ✅ Phase 2: Enhanced Monitoring
- [x] Rich request/response + DB payloads
- [x] Event levels + slow request detection
- [x] Trace correlation (traceId)
- [x] Trace grouping UI
- [x] Search / filters
- [x] Export JSON
- [x] Trace persistence (MongoDB)

### 🔮 Phase 3: AI-Powered Features (Planned)
- [ ] Automated test generation from captured traces
- [ ] AI-powered error analysis and suggestions
- [ ] Performance bottleneck detection + recommendations
- [ ] Anomaly detection in request patterns
- [ ] Code generation for fixing common issues
- [ ] Integration with VS Code extension

### 🎯 Phase 4: Production Ready (Future)
- [ ] Authentication and multi-tenant support
- [ ] Distributed tracing for microservices
- [ ] Historical metrics dashboards
- [ ] Alerting and notifications
- [ ] Production-safe sampling and rate limiting


## 🤝 Contributing

Contributions are welcome! Please feel free to submit issues or pull requests.

## 📄 License

MIT License - see [LICENSE](./LICENSE) for details.

Copyright (c) 2025 Noa Rabin Cohen
