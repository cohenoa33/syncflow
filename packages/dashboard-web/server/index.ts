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
import { registerMetricsRoutes } from "./routes/metrics";
import { registerAlertsRoutes } from "./routes/alerts";
import { startAlertEvaluator } from "./alerts/evaluator";
import { startAlertCleanup } from "./alerts/cleanup";
import { serveStaticUi } from "./static";
import { requireApiKey } from "./auth";
import { getAuthConfig } from "./tenants";
import { corsOriginCallback } from "./utils/cors";

async function main() {
  // Initialize and log auth configuration at startup
  getAuthConfig();

  await connectMongo().catch((err) => {
    console.error("[Dashboard] ❌ Mongo error", err);
    process.exit(1);
  });

  const app = express();

  app.use(
    cors({
      origin: corsOriginCallback,
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
  registerMetricsRoutes(app);
  registerAlertsRoutes(app, io);

  startAlertEvaluator(io);
  startAlertCleanup();

  serveStaticUi(app);

  const PORT = Number(process.env.PORT || 5050);
  httpServer.listen(PORT, () => {
    console.log(`[Dashboard] running on port ${PORT}`);
  });
}

main();
