import type { Request, Response, NextFunction } from "express";
import {
  REQUIRE_AUTH,
  TENANTS,
  getTenantFromHeaders
} from "./tenants";

/**
 * Tenant-aware API key validation middleware
 *
 * AUTH_MODE env var controls behavior:
 * - "strict": X-Tenant-Id header required, must exist in TENANTS_JSON, Bearer token must match dashboard key
 * - "dev" (default): If TENANTS_JSON is empty, allow all (local dev convenience). If tenant in TENANTS_JSON, enforce keys.
 */
export function requireApiKey(req: Request, res: Response, next: NextFunction) {
  const authMode = (process.env.AUTH_MODE || "dev").toLowerCase();

  // Get tenant from X-Tenant-Id header
  const tenantFromHeader = getTenantFromHeaders(req.headers);

  if (authMode === "strict") {
    // STRICT MODE: X-Tenant-Id must exist and tenant must be in TENANTS_JSON
    const headerTenantId = req.header("x-tenant-id");
    if (!headerTenantId) {
      console.log(
        `[Dashboard] ❌ Auth failed: Missing X-Tenant-Id header in strict mode`
      );
      return res.status(401).json({
        ok: false,
        error: "UNAUTHORIZED",
        message: "Missing or invalid API key"
      });
    }

    // Validate tenant exists in TENANTS_JSON (if TENANTS_JSON is defined)
    if (REQUIRE_AUTH) {
    const isValidTenant = !!TENANTS[tenantFromHeader];
      if (
        !isValidTenant &&
        tenantFromHeader !== (process.env.DEFAULT_TENANT_ID || "local")
      ) {
        console.log(
          `[Dashboard] ❌ Auth failed: Tenant "${tenantFromHeader}" not found in TENANTS_JSON (strict mode)`
        );
        return res.status(401).json({
          ok: false,
          error: "UNAUTHORIZED",
          message: "Missing or invalid API key"
        });
      }
    }

    // Bearer token required
    const auth = req.headers.authorization || "";
    const token = auth.startsWith("Bearer ")
      ? auth.slice("Bearer ".length)
      : null;

    if (!token) {
      console.log(
        `[Dashboard] ❌ Auth failed: Missing Bearer token (strict mode, tenant: ${tenantFromHeader})`
      );
      return res.status(401).json({
        ok: false,
        error: "UNAUTHORIZED",
        message: "Missing or invalid API key"
      });
    }

    // Validate token against dashboards config for this tenant
    if (!validateDashboardViewerToken(tenantFromHeader, token)) {
      console.log(
        `[Dashboard] ❌ Auth failed: Invalid token for tenant "${tenantFromHeader}" (strict mode)`
      );
      return res.status(401).json({
        ok: false,
        error: "UNAUTHORIZED",
        message: "Missing or invalid API key"
      });
    }

    // STRICT MODE: Valid, attach tenantId and continue
    (req as any).tenantId = tenantFromHeader;
    return next();
  }

  // DEV MODE (default)
  // If TENANTS_JSON is empty, allow all (local dev convenience)
  if (!REQUIRE_AUTH) {
    console.log(
      `[Dashboard] ✅ Auth skipped: Dev mode with no TENANTS_JSON (tenant: ${tenantFromHeader})`
    );
    (req as any).tenantId = tenantFromHeader;
    return next();
  }

  // If TENANTS_JSON has apps/tenants defined, enforce authentication
  const auth = req.headers.authorization || "";
  const token = auth.startsWith("Bearer ")
    ? auth.slice("Bearer ".length)
    : null;

  if (!token) {
    console.log(
      `[Dashboard] ❌ Auth failed: Missing Bearer token (dev mode with TENANTS_JSON, tenant: ${tenantFromHeader})`
    );
    return res.status(401).json({
      ok: false,
      error: "UNAUTHORIZED",
      message: "Missing or invalid API key"
    });
  }
console.log(
  `❌[Dashboard] ❌ tenant: ${tenantFromHeader}, token: ${token})`
);
  // Validate token against dashboards config for this tenant
  if (!validateDashboardViewerToken(tenantFromHeader, token)) {
    console.log(
      `[Dashboard] ❌ Auth failed: Invalid token for tenant "${tenantFromHeader}" (dev mode with TENANTS_JSON)`
    );
    return res.status(401).json({
      ok: false,
      error: "UNAUTHORIZED",
      message: "Missing or invalid API key"
    });
  }

  console.log(
    `[Dashboard] ✅ Auth success: Valid token for tenant "${tenantFromHeader}"`
  );
  (req as any).tenantId = tenantFromHeader;

  
  next();
}

/**
 * Helper: Validate that a token is a valid dashboard viewer key for a tenant
 *
 * This checks against TENANTS[tenantId].dashboards[token].role
 * Returns true if token is a valid viewer key for the tenant.
 */
export function validateDashboardViewerToken(
  tenantId: string,
  token: string
): boolean {
  const dashboards = TENANTS[tenantId]?.dashboards ?? {};
  console.log(`[Dashboard] Validating token for tenant "${tenantId}":`, dashboards);  

  return token in dashboards;
}
