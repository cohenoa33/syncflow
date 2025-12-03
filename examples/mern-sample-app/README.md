# MERN Sample App

Example application demonstrating SyncFlow agent integration with a MERN stack backend.

## Features

- Express REST API with sample routes
- Mongoose models and database operations
- SyncFlow agent instrumentation
- Auto-connects to dashboard on startup

## Setup

1. Make sure MongoDB is running locally on port 27017
2. Run the app:

```bash
pnpm dev
```

The server will start on http://localhost:3000 and automatically connect to the SyncFlow dashboard.

## Testing

Try these API endpoints:

- `GET /api/users` - List all users
- `POST /api/users` - Create a user (body: { name, email })
- `GET /api/users/:id` - Get user by ID
- `PUT /api/users/:id` - Update user
- `DELETE /api/users/:id` - Delete user

Each operation will be captured and displayed in the SyncFlow dashboard.
