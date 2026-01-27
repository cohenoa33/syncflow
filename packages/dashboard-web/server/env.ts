import dotenv from "dotenv";
import { existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

/**
 * Single source of truth for loading environment variables in the dashboard server.
 * MUST be called BEFORE any other server module imports to ensure env is available.
 *
 * Load order:
 * 1. .env.local (highest priority)
 * 2. .env (fallback)
 */

let envLoaded = false;
export function loadServerEnv(): void {
  if (envLoaded) return;

  const here = dirname(fileURLToPath(import.meta.url)); // .../server
  const projectRoot = resolve(here, ".."); // .../dashboard-web

  const envLocalPath = resolve(projectRoot, ".env.local");
  const envPath = resolve(projectRoot, ".env");

  if (existsSync(envLocalPath)) dotenv.config({ path: envLocalPath });
  if (existsSync(envPath)) dotenv.config({ path: envPath });

  envLoaded = true;
}