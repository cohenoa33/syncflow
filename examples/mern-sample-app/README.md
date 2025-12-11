# MERN Sample App

Example application demonstrating SyncFlow agent integration with a MERN stack backend.

> **Note**: This is a development/demo application. It does not include production features like rate limiting, authentication, or input validation. Do not use in production without proper security measures.
> ***Note***: `agent.instrumentMongoose(mongoose)` must run **before** defining Mongoose models, otherwise hooks won't attach.
> Note: the sample app runs on port **4000**.

## Features

- Express REST API with sample routes
- Mongoose models and database operations
- SyncFlow agent auto-instrumentation for Express + Mongoose
- Streams events to the dashboard on startup (no manual emits)

## Setup

1. Make sure MongoDB is running on port 27017 (local or Docker)
2. Run the app:

```bash
pnpm dev
```


> Important: `agent.instrumentMongoose(mongoose)` must run **before** defining models so hooks attach correctly.

## Testing

Try these API endpoints:

- `GET /api/users` - List all users
- `POST /api/users` - Create a user (body: { name, email })
- `GET /api/users/:id` - Get user by ID
- `PUT /api/users/:id` - Update user
- `DELETE /api/users/:id` - Delete user


Each operation emits events to the SyncFlow dashboard (manual emits for MVP; auto-capture comes in Step 5).

