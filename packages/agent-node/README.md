# @syncflow/agent-node

Automatic instrumentation agent for Node.js MERN stack applications. Captures Express HTTP requests and Mongoose operations, streams real-time trace-correlated events to the SyncFlow Dashboard via Socket.IO, with built-in sensitive data redaction.

---

## Quick Start

### 1. Install

```bash
npm install @syncflow/agent-node
# or
pnpm add @syncflow/agent-node
```

Requires Node.js 16+ and peer dependencies:

```bash
pnpm add express mongoose
```

### 2. Initialize in your Express app

```typescript
import express from "express";
import mongoose from "mongoose";
import { SyncFlowAgent } from "@syncflow/agent-node";

const app = express();
app.use(express.json());

const agent = new SyncFlowAgent({
  dashboardUrl: "http://localhost:5050", // Point to your SyncFlow dashboard
  appName: "my-mern-app"
});

agent.connect();
agent.instrumentExpress(app);

// ⚠️ IMPORTANT: instrument Mongoose BEFORE defining models
agent.instrumentMongoose(mongoose);

// Define models AFTER instrumentation
const User = mongoose.model(
  "User",
  new mongoose.Schema({ name: String, email: String })
);

// All requests and DB operations now tracked
app.get("/api/users", async (req, res) => {
  res.json(await User.find());
});

app.listen(3000);
```

Done! The agent auto-captures all Express requests and Mongoose operations, streaming them to the dashboard.

---

## Features & Architecture

- **Automatic Instrumentation** – Zero-config Express & Mongoose integration via middleware and schema plugins
- **Trace Correlation** – Request tracing across HTTP and database layers with shared trace IDs
- **Sensitive Data Redaction** – Auto-redacts passwords, tokens, API keys, and cookies before sending
- **Real-Time Streaming** – WebSocket connection to dashboard for live request/query monitoring
- **Built-in Sampling** – Configurable slow query thresholds to reduce noise (default: 500ms)
- **Production-Ready** – TypeScript strict mode, async-safe via AsyncLocalStorage, supports monorepo

---

## Configuration

### Constructor Options

Pass configuration to the `SyncFlowAgent` constructor:

```typescript
const agent = new SyncFlowAgent({
  dashboardUrl: "http://localhost:5050", // Dashboard WebSocket endpoint
  appName: "my-mern-app", // Display name in dashboard
  slowMsThreshold: 500, // Slow query threshold (ms)
  agentKey: "optional-api-key", // API key for authentication
  tenantId: "tenant-123" // Multi-tenant identifier
});
```

| Option            | Type   | Default                 | Purpose                                  |
| ----------------- | ------ | ----------------------- | ---------------------------------------- |
| `dashboardUrl`    | string | `http://localhost:5050` | Dashboard WebSocket endpoint             |
| `appName`         | string | `unnamed-app`           | Display name in dashboard                |
| `slowMsThreshold` | number | `500`                   | Only capture operations slower than this |
| `agentKey`        | string | (none)                  | Optional API key for authentication      |
| `tenantId`        | string | (none)                  | Optional multi-tenant identifier         |

**Auth alignment note:** The dashboard only accepts agent connections when `TENANTS_JSON` is configured. If your tenant defines `apps` in `TENANTS_JSON`, set `appName` + `agentKey` to the configured token. If no apps are defined, set `tenantId` (must exist in `TENANTS_JSON`).

### API

**Methods:**

- `agent.connect()` – Connect to dashboard
- `agent.disconnect()` – Close connection
- `agent.instrumentExpress(app)` – Capture HTTP requests
- `agent.instrumentMongoose(mongoose)` – Capture DB operations (call before defining models)

---

## How It Works

**Data Flow:**

```
Express Request → [capture] → Mongoose Query → [capture] →
[Sanitize sensitive fields] → Socket.IO → Dashboard
```

**Trace Correlation:**
Each HTTP request gets a unique `traceId`. All database operations within that request's async context share the same `traceId`, enabling full request tracing across layers.

**Sanitization:**
Redacts: `password, pass, pwd, token, access_token, refresh_token, authorization, cookie, set-cookie, apiKey, apikey, secret, client_secret`

Limits: Max 4 levels deep, 50 keys per object, 2000 chars per string.

**Supported Operations:**

- Read: `find`, `findOne`
- Write: `save`, `updateOne`, `updateMany`, `deleteOne`, `deleteMany`, `findOneAndUpdate`, `findOneAndDelete`

---

## Troubleshooting

| Issue                   | Diagnosis                                                                     | Solution                                                                                                          |
| ----------------------- | ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Dashboard not reachable | `[SyncFlow] Connection error: getaddrinfo ENOTFOUND localhost`                | Verify dashboard runs on `http://localhost:5050` via `curl`, check `SYNCFLOW_DASHBOARD_SOCKET_URL` env var        |
| No events in dashboard  | Mongoose instrumented after models defined, or `agent.connect()` never called | Call `agent.instrumentMongoose()` BEFORE `mongoose.model()`, verify logs show `[SyncFlow] Connected to dashboard` |
| Memory grows over time  | Large payloads in requests/responses                                          | Agent limits objects to 50 keys, strings to 2000 chars; check for exceptionally large payloads                    |
| Module not found        | `@syncflow/agent-node` not installed                                          | Run `pnpm add @syncflow/agent-node`, verify `dist/index.d.ts` exists after build                                  |

---

## Development

### Build and Test

This package contains the source in `src/` and builds to `dist/` via TypeScript:

```bash
npm run dev      # Watch mode (tsc --watch)
npm run build    # Build once (tsc)
npm run clean    # Remove dist/
```

**Scripts are defined locally** in `package.json`. If developing within the monorepo root, use workspace filter commands:

```bash
pnpm --filter @syncflow/agent-node dev
pnpm --filter @syncflow/agent-node build
```

### Type Checking

TypeScript strict mode is enabled in `tsconfig.json`. All code must:

- Pass `tsc --noEmit` (no unintended emit)
- Use explicit types for public API
- Have no unused imports

### Testing

This package has no automated tests. Before publishing:

1. Verify builds: `npm run build`
2. Check types: `npx tsc --noEmit`
3. Test manually in an example app (if available in monorepo)

---

## Contributing

- **Bug reports:** Include the TypeScript error or reproduction steps
- **Bug fixes:** Verify fix with `tsc --noEmit` and test in example app
- **New features:** Discuss in an issue first; ensure backward compatibility
- **Documentation:** Keep README in sync with code changes; update examples if API changes

All code must:

- Pass TypeScript strict mode: `tsc --noEmit`
- Be free of unused imports
- Maintain the public API surface defined in `export interface SyncFlowAgentOptions` and `export class SyncFlowAgent`

---

## License

MIT – See [LICENSE](../../LICENSE) in the repo root.
