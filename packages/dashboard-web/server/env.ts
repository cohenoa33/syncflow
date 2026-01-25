import dotenv from "dotenv";
import { existsSync } from "fs";
import { resolve } from "path";

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

  const cwd = process.cwd();
  const envLocalPath = resolve(cwd, ".env.local");
  const envPath = resolve(cwd, ".env");

  // Load .env.local first (highest priority)
  if (existsSync(envLocalPath)) {
    dotenv.config({ path: envLocalPath });
  }

  // Load .env as fallback
  if (existsSync(envPath)) {
    dotenv.config({ path: envPath });
  }

  envLoaded = true;
}
