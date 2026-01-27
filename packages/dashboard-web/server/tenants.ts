// packages/dashboard-web/server/tenants.ts

import type { Request } from "express";

/**
 * TenantsConfig: Single source of truth for tenant + app + dashboard configurations
 *
 * Structure:
 * {
 *   tenantId: {
 *     apps: { appName: agentToken },
 *     dashboards: { viewerKey: true }
 *   }
 * }
 */

type TenantsConfig = Record<
  string,
  {
    apps?: Record<string, string>; // appName -> agentToken
    dashboards?: Record<string, true>;
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
export const HAS_TENANTS_CONFIG = Object.keys(TENANTS).length > 0;
/**
 * Get tenantId from X-Tenant-Id header (strict, no fallbacks)
 * Returns null if header is missing or empty
 */
export function getTenantFromHeaders(headers: any): string | null {
  const fromHeader =
    headers?.["x-tenant-id"]?.toString()?.trim() ||
    headers?.["X-Tenant-Id"]?.toString()?.trim();

  return fromHeader || null;
}

/**
 * Express request helper: get tenantId from request headers (strict, no fallbacks)
 * Returns null if header is missing or empty
 */
export function getTenantId(req: Request): string | null {
  const raw = req.header("x-tenant-id");
  const t = typeof raw === "string" ? raw.trim() : "";
  return t || null;
}

/**
 * Backwards-compat export for header-based resolution
 */
export function resolveTenantIdFromHeaders(headers: any): string | null {
  return getTenantFromHeaders(headers);
}

/**
 * Require tenantId from request headers, throwing if missing
 * Use this in routes that must have a tenantId
 */
export function requireTenantId(req: Request): string {
  const tenantId = getTenantId(req);
  if (!tenantId) {
    throw new Error("MISSING_TENANT_ID");
  }
  return tenantId;
}
