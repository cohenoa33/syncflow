import type { Request, Response, NextFunction } from "express";
import {
  TENANTS,
  getTenantFromHeaders,
  getAuthConfig
} from "./tenants";

/**
 * Express middleware: Require API key authentication for dashboard viewer routes
 *
 * Validates:
 * 1. X-Tenant-Id header is present
 * 2. If TENANTS_JSON is configured:
 *    a. Tenant exists in TENANTS
 *    b. Bearer token is present in Authorization header
 *    c. Token is valid dashboard viewer key for the tenant
 *
 * On success, attaches tenantId to req. On failure, responds with 4xx error.
 */
export function requireApiKey(req: Request, res: Response, next: NextFunction) {
  const { hasTenantsConfig } = getAuthConfig();
  // Step 1: ALWAYS require X-Tenant-Id header (no fallback)
  const tenantFromHeader = getTenantFromHeaders(req.headers);

  if (!tenantFromHeader) {
    console.log(`[Dashboard] ❌ Auth failed: Missing X-Tenant-Id header`);
    return res.status(400).json({
      ok: false,
      error: "BAD_REQUEST",
      message: "Missing X-Tenant-Id header"
    });
  }

  // Step 2: If no TENANTS_JSON configured, allow request through (routes decide data availability)
  if (!hasTenantsConfig) {
    console.log(
      `[Dashboard] ⚠️  No TENANTS_JSON configured, allowing tenant "${tenantFromHeader}" through`
    );
    (req as any).tenantId = tenantFromHeader;
    return next();
  }

  // Step 3: If TENANTS_JSON has tenants, enforce strict validation
  // 3a: Tenant must exist in TENANTS
  if (!TENANTS[tenantFromHeader]) {
    console.log(
      `[Dashboard] ❌ Auth failed: Tenant "${tenantFromHeader}" not found in TENANTS_JSON`
    );
    return res.status(401).json({
      ok: false,
      error: "UNAUTHORIZED",
      message: "Unknown tenant"
    });
  }

  // 3b: Require Bearer token
  const auth = req.headers.authorization || "";
  const token = auth.startsWith("Bearer ")
    ? auth.slice("Bearer ".length)
    : null;

  if (!token) {
    console.log(
      `[Dashboard] ❌ Auth failed: Missing Bearer token (tenant: ${tenantFromHeader})`
    );
    return res.status(401).json({
      ok: false,
      error: "UNAUTHORIZED",
      message: "Missing or invalid API key"
    });
  }

  // 3c: Validate token against dashboards config for this tenant
  if (!validateDashboardViewerToken(tenantFromHeader, token)) {
    console.log(
      `[Dashboard] ❌ Auth failed: Invalid token for tenant "${tenantFromHeader}"`
    );
    return res.status(401).json({
      ok: false,
      error: "UNAUTHORIZED",
      message: "Missing or invalid API key"
    });
  }

  // All validations passed
  console.log(
    `[Dashboard] ✅ Auth success: Valid token for tenant "${tenantFromHeader}"`
  );
  (req as any).tenantId = tenantFromHeader;
  next();
}

/**
 * Helper: Validate that a token is a valid dashboard viewer key for a tenant
 *
 * This checks if the token exists as a key in TENANTS[tenantId].dashboards
 * Returns true if token is a valid viewer key for the tenant.
 */
export function validateDashboardViewerToken(
  tenantId: string,
  token: string
): boolean {
  const dashboards = TENANTS[tenantId]?.dashboards ?? {};
  const isValid = token in dashboards;

  return isValid;
}
