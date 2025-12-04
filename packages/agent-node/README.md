# @syncflow/agent-node

TypeScript agent for MERN stack applications. Automatically captures Express route events and Mongoose database operations, streaming them via Socket.IO to the SyncFlow dashboard.

## Features

- 🚀 Auto-capture Express middleware and route handlers
- 📊 Track Mongoose model operations (find, create, update, delete)
- 🔌 Real-time event streaming via Socket.IO
- 🎯 Minimal setup - just initialize and connect

## Installation

```bash
npm install @syncflow/agent-node
# or
pnpm add @syncflow/agent-node
```

## Usage

Once instrumented, events are captured automatically — you don’t need to manually emit anything.

```typescript
import { SyncFlowAgent } from "@syncflow/agent-node";

// Initialize the agent
const agent = new SyncFlowAgent({
  dashboardUrl: 'http://localhost:5050',
  appName: 'my-mern-app'
});

// Connect to dashboard
agent.connect();

// Instrument your Express app
agent.instrumentExpress(app);

// Instrument Mongoose models
agent.instrumentMongoose(mongoose);
```

## API

### `new SyncFlowAgent(options)`

Creates a new agent instance.

**Options:**
- `dashboardUrl` (string): URL of the SyncFlow dashboard (default: 'http://localhost:5050')
- `appName` (string): Name of your application (default: 'unnamed-app')

### `agent.connect()`

Connects to the dashboard via Socket.IO.

### `agent.instrumentExpress(app)`

Instruments an Express application to capture route events.

### `agent.instrumentMongoose(mongoose)`

Instruments Mongoose to capture database operations.

### `agent.disconnect()`

Disconnects from the dashboard.

## License

MIT
