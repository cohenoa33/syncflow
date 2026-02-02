import type { Express } from "express";
import { getAuthConfig } from "../tenants";

/**
 * Public config endpoint - exposes demo mode availability to frontend
 *
 * IMPORTANT: This is the ONLY /api/* endpoint that does not require authentication.
 * It must be registered BEFORE app.use("/api", requireApiKey) in server/index.ts.
 * No auth required as this only reveals feature availability (no sensitive data).
 */
export function registerConfigRoutes(app: Express) {
  app.get("/api/config", (req, res) => {
    const demoModeEnabled = process.env.DEMO_MODE_ENABLED === "true";
    const { authMode } = getAuthConfig();
    const demoToken = (process.env.DEMO_MODE_TOKEN ?? "").trim();

    // Demo is effectively available only if:
    // - DEMO_MODE_ENABLED=true AND
    // - (in dev mode) OR (in strict mode AND DEMO_MODE_TOKEN is configured)
    const isDemoAvailable =
      demoModeEnabled &&
      (authMode === "dev" || (authMode === "strict" && demoToken !== ""));

    res.json({
      demoModeEnabled: isDemoAvailable,
      requiresDemoToken: authMode === "strict" && demoToken !== ""
    });
  });
}
