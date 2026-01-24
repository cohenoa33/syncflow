import type { Request, Response, NextFunction } from "express";
import { config } from "dotenv";
import { resolve } from "path";

// Load .env.local first, then fall back to .env
config({ path: resolve(process.cwd(), ".env.local") });
config(); // Load .env as fallback

/**
 * TenantsConfig: Single source of truth for tenant + app + dashboard configurations
 *
 * Structure:
 * {
 *   tenantId: {
 *     apps: { appName: agentToken },
 *     dashboards: { viewerKey: { role: "admin" | "viewer" } }
 *   }
 * }
 */

type TenantsConfig = Record<
  string,
  {
    apps?: Record<string, string>; // appName -> agentToken
    dashboards?: Record<string, { role: "admin" | "viewer" }>;
  }
>;

/**
 * Parse TENANTS_JSON env var into TenantsConfig
 */
function parseTenantsConfig(): TenantsConfig {
  const raw = process.env.TENANTS_JSON ?? "";
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    console.warn("[Dashboard] Failed to parse TENANTS_JSON");
    return {};
  }
}

/**
 * Global TENANTS config: Single source of truth
 */
export const TENANTS = parseTenantsConfig();

/**
 * APP_INDEX: appName -> { tenantId, token }
 * Built from TENANTS_JSON at module load time
 */
export const APP_INDEX: Record<string, { tenantId: string; token: string }> =
  {};

(function buildAppIndex() {
  for (const [tenantId, config] of Object.entries(TENANTS)) {
    const apps = config?.apps ?? {};
    for (const [appName, token] of Object.entries(apps)) {
      APP_INDEX[appName] = { tenantId, token };
    }
  }
})();

/**
 * Whether auth is required (true if TENANTS_JSON defines any apps)
 */
export const REQUIRE_AUTH = Object.keys(APP_INDEX).length > 0;

/**
 * Get tenantId from X-Tenant-Id header, or fallback to DEFAULT_TENANT_ID
 *
 * In strict mode (when REQUIRE_AUTH=true), header is preferred but falls back gracefully
 * In dev mode, defaults to DEFAULT_TENANT_ID or "local"
 */
export function getTenantFromHeaders(headers: any): string {
  const fromHeader =
    headers?.["x-tenant-id"]?.toString()?.trim() ||
    headers?.["X-Tenant-Id"]?.toString()?.trim();

  return fromHeader || process.env.DEFAULT_TENANT_ID || "local";
}

/**
 * Express request helper: get tenantId from request headers
 */
export function getTenantId(req: Request): string {
  const raw = req.header("x-tenant-id");
  const t = typeof raw === "string" ? raw.trim() : "";
  return t || process.env.DEFAULT_TENANT_ID || "local";
}


/**
 * Backwards-compat export for header-based resolution
 */
export function resolveTenantIdFromHeaders(headers: any): string {
  return getTenantFromHeaders(headers);
}
