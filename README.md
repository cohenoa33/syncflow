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
- MongoDB running on port 27017  
  - Either locally **or** via Docker (recommended)

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
cd packages/dashboard-web
pnpm dev:server
```
- Socket.IO server: http://localhost:5050
  
### Terminal 3: Start SyncFlow Dashboard UI
```bash
cd packages/dashboard-web
pnpm dev
```

- Dashboard UI: http://localhost:5173

### Terminal 4: Start Sample MERN App
```bash
cd examples/mern-sample-app
pnpm dev
```
- Sample API: http://localhost:4000


## 📖 How It Works (Current MVP)

1. **Agent (packages/agent-node)**  
   Install `@syncflow/agent-node` in a MERN backend, initialize it once, then call:
   - `agent.connect()` to stream events to the dashboard
   - `agent.instrumentExpress(app)` to auto-capture request/response + latency
   - `agent.instrumentMongoose(mongoose)` to auto-capture DB operations  
   No manual `emit()` calls are required.

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

## 🗺️ Roadmap

### ✅ Phase 1: Core Infrastructure (Current MVP)
- [x] Monorepo setup with pnpm workspaces
- [x] TypeScript agent package with Socket.IO client
- [x] React dashboard with Tailwind CSS v4
- [x] Socket.IO server on port 5050
- [x] Sample MERN app demonstrating integration
- [x] Manual event emission showing live dashboard updates
- [x] Express middleware auto-instrumentation (auto capture routes + latency)
- [x] Mongoose hooks for DB event capture (auto capture writes/updates)

### 🚧 Phase 2: Enhanced Monitoring (Next)
- [ ] Error tracing across Express → Mongoose layers
- [ ] Request/response payload inspection
- [ ] Performance metrics and slow query detection
- [ ] Custom event filtering and search
- [ ] Event export (JSON, CSV)

### 🔮 Phase 3: AI-Powered Features (Planned)
- [ ] Automated test generation from captured events
- [ ] AI-powered error analysis and suggestions
- [ ] Performance bottleneck detection + recommendations
- [ ] Anomaly detection in request patterns
- [ ] Code generation for fixing common issues
- [ ] Integration with VS Code extension

### 🎯 Phase 4: Production Ready (Future)
- [ ] Authentication and multi-tenant support
- [ ] Event persistence (database backend)
- [ ] Distributed tracing for microservices
- [ ] Historical metrics dashboards
- [ ] Alerting and notifications
- [ ] Production-safe sampling and rate limiting

## 🤝 Contributing

Contributions are welcome! Please feel free to submit issues or pull requests.

## 📄 License

MIT License - see [LICENSE](./LICENSE) for details.

Copyright (c) 2025 Noa Rabin Cohen
