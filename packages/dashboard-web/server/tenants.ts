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
    dashboards?: Record<string, true>; // token -> true
  }
>;

/**
 * Parse TENANTS_JSON env var into TenantsConfig
 */
export function parseTenantsConfig(): TenantsConfig {
  const raw = process.env.TENANTS_JSON ?? "";

  console.log("[Dashboard] Parsing TENANTS_JSON... ", raw);

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
export let TENANTS = parseTenantsConfig();

/**
 * APP_INDEX: appName -> { tenantId, token }
 * Built from TENANTS_JSON at module load time
 */
export let APP_INDEX: Record<string, { tenantId: string; token: string }> = {};

/**
 * VIEWER_INDEX: tenantId -> Set<token>
 */
export let VIEWER_INDEX: Record<string, Set<string>> = {};

/**
 * TEST ONLY: Reset cached tenant state
 */
export function __TEST_resetTenantsConfig() {
  TENANTS = parseTenantsConfig();
  APP_INDEX = {};
  VIEWER_INDEX = {};
  buildIndexes();
}

function buildIndexes() {
  for (const [tenantId, config] of Object.entries(TENANTS)) {
    const apps = config.apps ?? {};
    for (const [appName, token] of Object.entries(apps)) {
      APP_INDEX[appName] = { tenantId, token };
    }
    const dashboards = config.dashboards ?? {};
    if (Object.keys(dashboards).length > 0) {
      VIEWER_INDEX[tenantId] = new Set(Object.keys(dashboards));
    }
  }
}

buildIndexes();

/**
 * Auth Configuration Helper
 *
 * Central source of truth for authentication and tenant configuration
 * Determines all auth-related behaviors based on environment and TENANTS_JSON
 */
export interface AuthConfig {
  hasTenantsConfig: boolean; // Whether TENANTS_JSON has any tenants defined
  authMode: "dev" | "strict"; // Auth mode from AUTH_MODE env var
  requireViewerAuth: boolean; // Whether dashboard viewer auth is required
  requireAgentAuth: boolean; // Whether agent auth is required
}

let _authConfig: AuthConfig | null = null;
let _loggedAtStartup = false;

/**
 * TEST ONLY: Reset cached auth config
 */
export function __TEST_resetAuthConfig() {
  _authConfig = null;
  _loggedAtStartup = false;
}

/**
 * Get centralized auth configuration (singleton)
 *
 * Returns:
 * - hasTenantsConfig: true if TENANTS_JSON defines any tenants
 * - authMode: "dev" | "strict" from process.env.AUTH_MODE
 * - requireViewerAuth: true if hasTenantsConfig (dashboard routes need auth)
 * - requireAgentAuth: true if any apps are defined in TENANTS_JSON
 */

export function getAuthConfig(): AuthConfig {
  if (!_authConfig) {
    const hasTenantsConfig = Object.keys(TENANTS).length > 0;
    const authMode =
      (process.env.AUTH_MODE || "dev").toLowerCase() === "strict"
        ? "strict"
        : "dev";
    const requireViewerAuth = hasTenantsConfig;
    const requireAgentAuth = Object.keys(APP_INDEX).length > 0;

    _authConfig = {
      hasTenantsConfig,
      authMode,
      requireViewerAuth,
      requireAgentAuth
    };

    // Log once at startup
    if (!_loggedAtStartup) {
      _loggedAtStartup = true;

      // Calculate demo enabled effective
      const demoModeEnabled = process.env.DEMO_MODE_ENABLED === "true";
      const demoToken = (process.env.DEMO_MODE_TOKEN ?? "").trim();
      const demoEnabledEffective =
        demoModeEnabled &&
        (authMode === "dev" || (authMode === "strict" && demoToken !== ""));

      console.log("[Dashboard] Auth Configuration:", {
        authMode: _authConfig.authMode,
        hasTenantsConfig: _authConfig.hasTenantsConfig,
        requireViewerAuth: _authConfig.requireViewerAuth,
        requireAgentAuth: _authConfig.requireAgentAuth,
        demoEnabledEffective,
        tenantsCount: Object.keys(TENANTS).length,
        appsCount: Object.keys(APP_INDEX).length
      });
    }
  }

  return _authConfig;
}

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
