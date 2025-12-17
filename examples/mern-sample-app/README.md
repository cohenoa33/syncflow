# MERN Sample App

Second example application demonstrating **SyncFlow agent integration** with a MERN stack backend.

This app exists to validate **multi-app tracing** in the SyncFlow dashboard alongside `mern-sample-app-2`.

> ⚠️ **Development / demo only**  
> This app is intentionally minimal and does **not** include production features such as authentication, validation, or rate limiting.

---

## Purpose

- Demonstrate **multiple apps** streaming traces into the same SyncFlow dashboard
- Validate **app-level filtering** in the UI
- Show trace separation by `appName` and `traceId`

---

## Features

- Express REST API
- Mongoose models and database operations
- SyncFlow agent auto-instrumentation:
  - Express requests
  - Mongoose operations
- Automatic trace correlation (Express → Mongoose)
- No manual `emit()` calls required

---

## Ports & Databases

| Item | Value |
|----|----|
| App port | **4000** |
| MongoDB | `syncflow-demo` |
| Dashboard | http://localhost:5173 |
| Socket server | http://localhost:5050 |

---

## Setup

### 1. Ensure MongoDB is running
Local or Docker:
```bash
docker start syncflow-mongo
```

### 2. Run the app
From the app directory:
```bash
pnpm dev
```

The app will:
- Start on **port 4000**
- Connect to its own MongoDB database
- Automatically stream events to the SyncFlow dashboard

## API Endpoints
Test with curl or Postman:
- GET `/api/users` — List users
- POST `/api/users` — Create user

```json 
{ "name": "Jane", "email": "jane@test.com" }
```

- GET `/api/users/:id` — Get user
- PUT `/api/users/:id` — Update user
- DELETE /`api/users/:id` — Delete user

Each request produces:
- An Express event
- One or more Mongoose events
- A single correlated trace in the dashboard

## Multi-App Demo



Run **both** sample apps simultaneously:

| App               | Port | App Name            |
|-------------------|------|---------------------|
| mern-sample-app   | 4000 | mern-sample-app     |
| mern-sample-app-2 | 4001 | mern-sample-app-2   |

### In the dashboard:
- Use **Application chips** to filter traces by app
- Verify traces remain isolated per app
- Compare performance and error behavior across apps



### Important Notes
- `agent.instrumentMongoose(mongoose)` must run before defining Mongoose models
- This app intentionally mirrors the first sample app with a separate:
    -  Port
    -  Database
    -  appName

⸻

### Related

- [@syncflow/agent-node￼](./packages/agent-node/README.md) 
- [@syncflow/dashboard-web](./packages/dashboard-web/README.md)
- [MERN Sample App 2](./examples/mern-sample-app-2/README.md) 

© 2025 Noa Rabin Cohen