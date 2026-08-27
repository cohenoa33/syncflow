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
 * APP_INDEX: tenantId -> appName -> agentToken
 *
 * Keyed by tenant FIRST. App names are only unique within a tenant, so a flat
 * appName -> tenant index lets one tenant's app name resolve another tenant's
 * registration: with a shared token value the agent would authenticate and its
 * events would be stamped with the wrong tenantId — a cross-tenant write.
 * Always resolve with the tenant the agent claims; never by app name alone.
 */
export let APP_INDEX: Record<string, Record<string, string>> = {};

/** Total apps declared across all tenants (drives the global auth switch). */
let APP_COUNT = 0;

/**
 * TEST ONLY: Reset cached tenant state
 */
export function __TEST_resetTenantsConfig() {
  TENANTS = parseTenantsConfig();
  APP_INDEX = {};
  APP_COUNT = 0;
  buildIndexes();
}

function buildIndexes() {
  for (const [tenantId, config] of Object.entries(TENANTS)) {
    const apps = config.apps ?? {};
    if (Object.keys(apps).length > 0) {
      APP_INDEX[tenantId] = { ...apps };
      APP_COUNT += Object.keys(apps).length;
    }
  }
}

buildIndexes();

/**
 * Resolve an agent's token for (tenantId, appName).
 *
 * Returns undefined when the tenant is unknown, declares no apps, or does not
 * declare this app — callers must treat all three as "reject".
 */
export function getAgentToken(
  tenantId: string,
  appName: string
): string | undefined {
  const apps = APP_INDEX[tenantId];
  if (!apps) return undefined;
  // Own-property check only: guards against prototype keys ("toString") being
  // accepted as app names, matching validateDashboardViewerToken.
  if (!Object.prototype.hasOwnProperty.call(apps, appName)) return undefined;
  return apps[appName];
}

/** Number of apps declared across every tenant. */
export function getAppCount(): number {
  return APP_COUNT;
}

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
    // Deliberately GLOBAL, not per-tenant: once any tenant declares an app,
    // every agent must present a valid token. Making this per-tenant would let
    // a tenant that declares no apps go on accepting unauthenticated agents
    // indefinitely, even while every other tenant is locked down.
    const requireAgentAuth = getAppCount() > 0;

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
        appsCount: getAppCount()
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
