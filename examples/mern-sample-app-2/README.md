# MERN Sample App

A minimal **Express + Mongoose** backend demonstrating automatic trace capture via the SyncFlow agent. Real-time instrumentation of HTTP requests and database operations.

> **Development / demo only** — intentionally minimal, no production features.

---

## Quickstart

**Prerequisites:** Node.js 16+, MongoDB running locally

```bash
# 1. Install dependencies
pnpm install

# 2. Start MongoDB (if not running)
brew services start mongodb-community
# or: docker run -d -p 27017:27017 mongo:latest

# 3. Start the app
pnpm dev
```

Server runs on `http://localhost:4001`. Test:

```bash
curl http://localhost:4001/api/users
```

---

## Configuration

Environment variables are loaded from `.env` via `dotenv.config()`. **Never commit secrets.**

| Variable                        | Required | Default                                   | Purpose                      |
| ------------------------------- | -------- | ----------------------------------------- | ---------------------------- |
| `SYNCFLOW_APP_NAME`             | Yes      | (none)                                    | Display name in traces       |
| `SYNCFLOW_DASHBOARD_SOCKET_URL` | No       | `http://localhost:5050`                   | Dashboard WebSocket endpoint |
| `SYNCFLOW_AGENT_KEY`            | No       | (none)                                    | Optional API key for agent   |
| `SYNCFLOW_TENANT_ID`            | No       | (none)                                    | Multi-tenant identifier      |
| `MONGODB_URI`                   | No       | `mongodb://localhost:27017/syncflow-demo` | MongoDB connection           |
| `PORT`                          | No       | `4001`                                    | Express server port          |

See [.env](./.env) for current values.

---

## Scripts

| Script       | Command                  | Purpose                    |
| ------------ | ------------------------ | -------------------------- |
| `pnpm dev`   | `tsx watch src/index.ts` | Watch mode with hot reload |
| `pnpm start` | `tsx src/index.ts`       | Run once                   |

---

## API Endpoints

| Method   | Path             | Notes                                                  |
| -------- | ---------------- | ------------------------------------------------------ |
| `GET`    | `/api/users`     | List all users                                         |
| `POST`   | `/api/users`     | Create user: `{"name":"Jane","email":"jane@test.com"}` |
| `GET`    | `/api/users/:id` | Get by ID                                              |
| `PUT`    | `/api/users/:id` | Update user                                            |
| `DELETE` | `/api/users/:id` | Delete user                                            |

Each request produces **one correlated trace** in the dashboard (Express + Mongoose events linked by `traceId`).

---

## Architecture

### Data Flow

```
HTTP Request → Express Middleware (captured) → Handler → Mongoose Query (captured)
    ↓ MongoDB → Response → SyncFlow Agent bundles events → Dashboard
```

### Key Files

- **[src/index.ts](./src/index.ts)** — Express app, SyncFlow agent init, /api/users CRUD routes
- **[package.json](./package.json)** — dependencies, scripts
- **[tsconfig.json](./tsconfig.json)** — TypeScript compiler config
- **.env** — configuration (loaded at startup via dotenv)

### Important: Instrumentation Order

`agent.instrumentMongoose(mongoose)` **must run before defining models**:

```typescript
// ✅ CORRECT
agent.instrumentMongoose(mongoose);
const User = mongoose.model("User", schema);

// ❌ WRONG
const User = mongoose.model("User", schema);
agent.instrumentMongoose(mongoose);
```

---

## Local Development

### Verify the app is running

```bash
# Check health
curl http://localhost:4001/

# List users
curl http://localhost:4001/api/users

# Create a user
curl -X POST http://localhost:4001/api/users \
  -H "Content-Type: application/json" \
  -d '{"name":"Alice","email":"alice@example.com"}'
```

### Common issues

| Issue                     | Solution                                                                                         |
| ------------------------- | ------------------------------------------------------------------------------------------------ |
| **Port 4001 in use**      | Kill: `lsof -i :4001 \| grep -v PID \| awk '{print $2}' \| xargs kill -9` or set `PORT=` in .env |
| **MongoDB won't connect** | Start: `brew services start mongodb-community` or `docker run -d -p 27017:27017 mongo:latest`    |
| **Module errors**         | Run: `pnpm install`                                                                              |

---

## Notes

- This app is **standalone** and does not require the monorepo. All dependencies are in `package.json`.
- Environment variables are read from `.env` at startup via `dotenv.config()`.
- **SYNCFLOW_APP_NAME** is the only required environment variable (no default).
- The app logs to stdout. Look for "✅ Connected to MongoDB" and "🚀 Server running" messages.
- Trace capture behavior depends on the `@syncflow/agent-node` package, which is installed as a workspace dependency.

---

## License

See [LICENSE](../../LICENSE) in repository root.
