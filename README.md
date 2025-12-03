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
- MongoDB running locally on port 27017

### Terminal 1: Install Dependencies
```bash
pnpm install
```

### Terminal 2: Build Agent Package
```bash
cd packages/agent-node
pnpm build
```

### Terminal 3: Start Dashboard
```bash
cd packages/dashboard-web
pnpm dev
```
- Socket.IO server: http://localhost:5050
- Dashboard UI: http://localhost:5173

### Terminal 4: Start Sample App
```bash
cd examples/mern-sample-app
pnpm dev
```
- Sample API: http://localhost:3000

## 📖 How It Works

1. **Agent** (`packages/agent-node`): Install in your MERN app to auto-capture Express routes and Mongoose operations
2. **Dashboard** (`packages/dashboard-web`): Real-time UI showing all events from instrumented apps
3. **Socket.IO**: Connects agents to dashboard for live event streaming

## 🛠️ Development Scripts

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

### ✅ Phase 1: Core Infrastructure
- [x] Monorepo setup with pnpm workspaces
- [x] TypeScript agent package with Socket.IO client
- [x] React dashboard with Tailwind CSS v4
- [x] Socket.IO server on port 5050
- [x] Express middleware auto-instrumentation
- [x] Mongoose hooks for DB event capture
- [x] Sample MERN app demonstrating integration

### 🚧 Phase 2: Enhanced Monitoring (In Progress)
- [ ] Error tracing across Express → Mongoose layers
- [ ] Request/response payload inspection
- [ ] Performance metrics and slow query detection
- [ ] Custom event filtering and search
- [ ] Event export (JSON, CSV)
- [ ] Dark mode for dashboard

### 🔮 Phase 3: AI-Powered Features (Planned)
- [ ] Automated test generation from captured events
- [ ] AI-powered error analysis and suggestions
- [ ] Performance bottleneck detection
- [ ] Anomaly detection in request patterns
- [ ] Code generation for fixing common issues
- [ ] Integration with VS Code extension

### 🎯 Phase 4: Production Ready (Future)
- [ ] Authentication and multi-tenant support
- [ ] Event persistence (database backend)
- [ ] Distributed tracing for microservices
- [ ] Metrics aggregation and historical analysis
- [ ] Alerting and notifications
- [ ] Production-safe sampling and rate limiting

## 🤝 Contributing

Contributions are welcome! Please feel free to submit issues or pull requests.

## 📄 License

MIT License - see [LICENSE](./LICENSE) for details.

Copyright (c) 2025 Noa Rabin Cohen
