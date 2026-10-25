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
import { registerHealthRoutes } from "./routes/health";
import { startAlertEvaluator } from "./alerts/evaluator";
import { startAlertCleanup } from "./alerts/cleanup";
import { serveStaticUi } from "./static";
import { requireApiKey } from "./auth";
import {
  createShutdownHandle,
  registerShutdownSignals
} from "./shutdown";
import {
  getAuthConfig,
  initializeTenantsConfig,
  TenantsConfigError
} from "./tenants";
import { corsOriginCallback } from "./utils/cors";
import {
  NumericEnvError,
  SPECS,
  readNumericEnv,
  validateNumericConfig
} from "./config/numericEnv";
import { AlertCronError, validateAlertCronConfig } from "./config/alertCron";

async function main() {
  // Validate TENANTS_JSON before any consumer reads tenant state. On failure,
  // abort startup with a fixed, non-sensitive message.
  try {
    initializeTenantsConfig();
  } catch (err) {
    if (err instanceof TenantsConfigError) {
      console.error(`[Dashboard] ❌ ${err.message}`);
      process.exit(1);
    }
    throw err;
  }

  try {
    validateNumericConfig();
  } catch (err) {
    if (err instanceof NumericEnvError) {
      console.error(`[Dashboard] ❌ ${err.message}`);
      process.exit(1);
    }
    throw err;
  }

  try {
    validateAlertCronConfig();
  } catch (err) {
    if (err instanceof AlertCronError) {
      console.error(`[Dashboard] ❌ ${err.message}`);
      process.exit(1);
    }
    throw err;
  }

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

  // /healthz is outside /api so not covered by requireApiKey; register before
  // serveStaticUi's catch-all so the SPA shell doesn't eat it.
  registerHealthRoutes(app);

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

  const PORT = readNumericEnv(SPECS.PORT);
  httpServer.listen(PORT, () => {
    console.log(`[Dashboard] running on port ${PORT}`);
  });

  const shutdownHandle = createShutdownHandle({ httpServer, io });
  registerShutdownSignals(shutdownHandle);
}

main();
