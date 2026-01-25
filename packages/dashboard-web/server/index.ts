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

async function main() {
  await connectMongo().catch((err) => {
    console.error("[Dashboard] ❌ Mongo error", err);
    process.exit(1);
  });

  const app = express();
  app.use(
    cors({
      origin: "*",
      exposedHeaders: ["X-RateLimit-Remaining", "X-RateLimit-Reset"]
    })
  );
  app.use(express.json());

  // Config endpoint (no auth required)
  registerConfigRoutes(app);

  // Protected API routes
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
