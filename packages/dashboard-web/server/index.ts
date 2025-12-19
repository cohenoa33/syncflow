import express from "express";
import cors from "cors";
import { createServer } from "http";

import { connectMongo } from "./models";
import { attachSocketServer } from "./socket";
import { registerTracesRoutes } from "./routes/traces";
import { registerDemoRoutes } from "./routes/demo";
import { registerInsightsRoutes } from "./routes/insights";
import { serveStaticUi } from "./static";

async function main() {
  await connectMongo().catch((err) => {
    console.error("[Dashboard] ❌ Mongo error", err);
    process.exit(1);
  });

  const app = express();
  app.use(cors());
  app.use(express.json());

  const httpServer = createServer(app);
  const io = attachSocketServer(httpServer);

  registerTracesRoutes(app, io);
  registerDemoRoutes(app, io);
  registerInsightsRoutes(app);

  serveStaticUi(app);

  const PORT = Number(process.env.PORT || 5050);
  httpServer.listen(PORT, () => {
    console.log(`[Dashboard] running on port ${PORT}`);
  });
}

main();
