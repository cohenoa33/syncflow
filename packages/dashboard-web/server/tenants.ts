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
 * Thrown when TENANTS_JSON is set but cannot be used as a tenant configuration.
 * Server startup must abort rather than degrade to an empty config.
 */
export class TenantsConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TenantsConfigError";
  }
}

/**
 * Current tenant config. Starts empty; only populated after a successful
 * `initializeTenantsConfig()` call. Exported so other modules read via
 * ESM live binding.
 */
export let TENANTS: TenantsConfig = {};

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

let _tenantsInitialized = false;
let _authConfig: AuthConfig | null = null;
let _loggedAtStartup = false;

function buildIndexesFrom(
  tenants: TenantsConfig
): { appIndex: Record<string, Record<string, string>>; appCount: number } {
  const appIndex: Record<string, Record<string, string>> = {};
  let appCount = 0;
  for (const [tenantId, config] of Object.entries(tenants)) {
    const apps = config.apps ?? {};
    if (Object.keys(apps).length > 0) {
      appIndex[tenantId] = { ...apps };
      appCount += Object.keys(apps).length;
    }
  }
  return { appIndex, appCount };
}

/**
 * Explicit runtime initialization of tenant configuration.
 *
 * MUST be called after `loadServerEnv()` and before any code that reads tenant
 * state (`getAuthConfig`, auth middleware, socket handlers, demo routes).
 *
 * Behavior:
 * - TENANTS_JSON missing / empty / whitespace → config is `{}` (valid).
 * - Non-empty invalid JSON → throws `TenantsConfigError`.
 * - Valid JSON but not a plain object → throws `TenantsConfigError`.
 *
 * On any failure, previously initialized state is cleared: tenant state is
 * marked uninitialized and the auth cache is invalidated, so no caller can
 * observe stale values after a failed re-init.
 */
export function initializeTenantsConfig(): void {
  // Invalidate any previously initialized state up-front. If parsing throws,
  // callers will see "uninitialized" rather than a stale prior config.
  _tenantsInitialized = false;
  _authConfig = null;
  _loggedAtStartup = false;

  const raw = (process.env.TENANTS_JSON ?? "").trim();

  let nextTenants: TenantsConfig;

  if (raw === "") {
    nextTenants = {};
  } else {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new TenantsConfigError(
        "TENANTS_JSON is set but is not valid JSON. Refusing to start."
      );
    }

    if (
      parsed === null ||
      typeof parsed !== "object" ||
      Array.isArray(parsed)
    ) {
      throw new TenantsConfigError(
        "TENANTS_JSON must be a JSON object keyed by tenantId."
      );
    }

    nextTenants = parsed as TenantsConfig;
  }

  // Publish only after successful validation.
  const { appIndex, appCount } = buildIndexesFrom(nextTenants);
  TENANTS = nextTenants;
  APP_INDEX = appIndex;
  APP_COUNT = appCount;
  _tenantsInitialized = true;
}

/**
 * TEST ONLY: Reset cached tenant state by re-running initialization against
 * the current `process.env.TENANTS_JSON`. On failure (malformed env), the
 * `TenantsConfigError` propagates — tenant state is left uninitialized.
 */
export function __TEST_resetTenantsConfig() {
  initializeTenantsConfig();
}

/**
 * TEST ONLY: Force an uninitialized state WITHOUT re-reading env. Lets tests
 * exercise the init-guard without supplying a config.
 */
export function __TEST_clearTenantsInit() {
  _tenantsInitialized = false;
  _authConfig = null;
  _loggedAtStartup = false;
  TENANTS = {};
  APP_INDEX = {};
  APP_COUNT = 0;
}

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
  if (!_tenantsInitialized) {
    throw new Error("getAuthConfig() called before initializeTenantsConfig()");
  }

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
