import type { Express } from "express";

/**
 * Public config endpoint - exposes demo mode availability to frontend
 * No auth required as this only reveals feature availability
 */
export function registerConfigRoutes(app: Express) {
  app.get("/api/config", (req, res) => {
    const demoModeEnabled = process.env.DEMO_MODE_ENABLED === "true";
    const requiresDemoToken = !!(process.env.DEMO_MODE_TOKEN ?? "").trim();

    res.json({
      demoModeEnabled,
      requiresDemoToken
    });
  });
}
