// Load environment variables BEFORE any other imports
import { loadServerEnv } from "./env";
loadServerEnv();

// Now import server dependencies (env is already loaded)
import express from "express";
import cors from "cors";
import { createServer } from "http";
import { connectMongo } from "./models";
import { attachSocketServer } from "./socket";
import { registerTracesRoutes } from "./routes/traces";
import { registerDemoRoutes } from "./routes/demo";
import { registerInsightsRoutes } from "./routes/insights";
import { registerConfigRoutes } from "./routes/config";
import { serveStaticUi } from "./static";
import { requireApiKey } from "./auth";
import { getAuthConfig } from "./tenants";

async function main() {
  // Initialize and log auth configuration at startup
  getAuthConfig();

  await connectMongo().catch((err) => {
    console.error("[Dashboard] ❌ Mongo error", err);
    process.exit(1);
  });

  const app = express();
  const allowedOrigins = process.env.CORS_ALLOWED_ORIGINS
    ? process.env.CORS_ALLOWED_ORIGINS.split(",").map((s) => s.trim())
    : ["http://localhost:5173"];

  app.use(
    cors({
      origin: (origin, cb) => {
        if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
        cb(new Error(`CORS: origin "${origin}" not allowed`));
      },
      exposedHeaders: ["X-RateLimit-Remaining", "X-RateLimit-Reset"]
    })
  );
  app.use(express.json());

  // Config endpoint (no auth required) - MUST be registered BEFORE requireApiKey
  // This is the ONLY /api/* endpoint that is intentionally public
  registerConfigRoutes(app);

  // Protected API routes - ALL /api/* routes registered after this point are protected
  // This middleware enforces tenant-scoped authentication for all /api endpoints
  app.use("/api", requireApiKey);

  const httpServer = createServer(app);
  const io = attachSocketServer(httpServer);

  registerDemoRoutes(app, io);
  registerTracesRoutes(app, io);
  registerInsightsRoutes(app);

  serveStaticUi(app);

  const PORT = Number(process.env.PORT || 5050);
  httpServer.listen(PORT, () => {
    console.log(`[Dashboard] running on port ${PORT}`);
  });
}

main();
