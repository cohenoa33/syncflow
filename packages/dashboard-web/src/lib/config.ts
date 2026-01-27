const rawApiBase = import.meta.env.VITE_API_BASE as string | undefined;
const rawSocketUrl = import.meta.env.VITE_SOCKET_URL as string | undefined;

// If not provided, default to same-origin (works on Render)
export const API_BASE =
  rawApiBase?.trim() ||
  (typeof window !== "undefined" ? window.location.origin : "");

// If not provided, default to same-origin Socket.IO
export const SOCKET_URL =
  rawSocketUrl?.trim() ||
  (typeof window !== "undefined" ? window.location.origin : "");

/**
 * Tenant ID for this dashboard UI build
 * REQUIRED - must be explicitly set via VITE_TENANT_ID
 * Throws if missing or empty
 */
function getTenantIdOrThrow(): string {
  const tenantId = (import.meta.env.VITE_TENANT_ID as string | undefined)
    ?.trim()
    ?.toLowerCase();

  if (!tenantId) {
    throw new Error(
      "VITE_TENANT_ID is required. Set it in .env.local or .env file. Example: VITE_TENANT_ID=my-tenant"
    );
  }

  return tenantId;
}

export const TENANT_ID = getTenantIdOrThrow();
