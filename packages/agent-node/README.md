# @syncflow/agent-node

TypeScript agent for MERN stack applications.  
SyncFlow Agent automatically instruments **Express** requests and **Mongoose** operations, then streams rich, sanitized, trace-correlated events to the SyncFlow Dashboard via Socket.IO.

---

## Features

- 🚀 Auto-capture Express requests (method, route, status, latency)
- 📊 Auto-capture Mongoose operations (read/write hooks)
- 🧠 Rich payloads:
  - Express: request + response context
  - Mongoose: model, collection, kind, docId, shapes (best-effort)
- 🔒 Built-in sanitization for sensitive fields (passwords, tokens, cookies, auth headers)
- ⚠️ Event levels: `info` / `warn` / `error` with slow request detection
- 🧵 Trace correlation: Express → Mongoose events share the same `traceId`
- 🔌 Real-time streaming to the dashboard (Socket.IO)

---

## Installation

```bash
npm install @syncflow/agent-node
# or
pnpm add @syncflow/agent-node
```

## Usage
Once instrumented, events are captured automatically — you don’t need to manually emit anything.
```ts
import express from "express";
import mongoose from "mongoose";
import { SyncFlowAgent } from "@syncflow/agent-node";

const app = express();
app.use(express.json());

const agent = new SyncFlowAgent({
  dashboardUrl: "http://localhost:5050",
  appName: "my-mern-app",
  slowMsThreshold: 500, // optional
});

agent.connect();

// ✅ Express can be instrumented anytime
agent.instrumentExpress(app);

// ✅ IMPORTANT: instrument mongoose BEFORE defining models
agent.instrumentMongoose(mongoose);

// define your mongoose models AFTER this line
```

***Why order matters for Mongoose***

instrumentMongoose() installs a global plugin.
If you define models before calling it, hooks won’t attach to those schemas.

## API

***new SyncFlowAgent(options)***

Creates a new agent instance.

**Options:**
- dashboardUrl (string): URL of the SyncFlow dashboard Socket.IO server
Default: http://localhost:5050
- appName (string): Name shown in the dashboard
Default: unnamed-app
- slowMsThreshold (number, optional): Marks events as warn
if duration exceeds this threshold (ms).
Default: 500

***agent.connect()***

Connects to the dashboard via Socket.IO and registers the application.

***agent.instrumentExpress(app)***

Adds middleware to capture all HTTP requests and responses.

***agent.instrumentMongoose(mongoose)***

Installs a global plugin to capture DB operations across all schemas/models.

***agent.disconnect()***

Disconnects from the dashboard.

## Payload, Levels & Traces
***Express events include***
- operation: e.g. POST /api/users
- durationMs, level
- Request: params, query, body, headers (sanitized), ip, userAgent
- Response: statusCode, ok, contentLength

***Mongoose events include***
- operation: e.g. save User
- Model + collection
- kind: read / write
- durationMs, level
- Filter/update shapes (best-effort) + docId when available

***Trace correlation***

Each Express request gets a unique traceId.
All Mongoose ops triggered during that request emit with the same traceId, letting the dashboard render a full request timeline.


## License
MIT