# MERN Sample App

Example application demonstrating SyncFlow agent integration with a MERN stack backend.

> **Note**: This is a development/demo application. It does not include production features like rate limiting, authentication, or input validation. Do not use in production without proper security measures.

## Features

- Express REST API with sample routes
- Mongoose models and database operations
- SyncFlow agent integration (manual emits in routes for MVP)
- Streams events to the dashboard in real time

## Setup

1. Make sure MongoDB is running on port 27017 (local or Docker)
2. Run the app:

```bash
pnpm dev
```

The server will start on http://localhost:4000 and automatically connect to the SyncFlow dashboard.

## Testing

Try these API endpoints:

- `GET /api/users` - List all users
- `POST /api/users` - Create a user (body: { name, email })
- `GET /api/users/:id` - Get user by ID
- `PUT /api/users/:id` - Update user
- `DELETE /api/users/:id` - Delete user

Each operation emits events to the SyncFlow dashboard (manual emits for MVP; auto-capture comes in Step 5).
