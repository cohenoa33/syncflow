import { TENANT_ID } from "./config";

export function authHeaders(): HeadersInit {
  const headers: Record<string, string> = {};
  const token = import.meta.env.VITE_DASHBOARD_API_KEY;
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  // Always include tenant ID (required)
  headers["X-Tenant-Id"] = TENANT_ID;

  return headers;
}

export function demoHeaders(
  options: { requiresDemoToken?: boolean; hasTenantsConfig?: boolean } = {}
): HeadersInit {
  const { requiresDemoToken = false, hasTenantsConfig = false } = options;
  const headers: Record<string, string> = {};

  // Always include tenant ID (required)
  headers["X-Tenant-Id"] = TENANT_ID;

  // Include viewer API key when tenants are configured (required for all /api/* routes)
  const viewerKey = import.meta.env.VITE_DASHBOARD_API_KEY;
  if (hasTenantsConfig && viewerKey) {
    headers.Authorization = `Bearer ${viewerKey}`;
  }

  // Include demo token when required (strict mode)
  if (requiresDemoToken) {
    const demoToken = import.meta.env.VITE_DEMO_MODE_TOKEN;
    if (demoToken) {
      if (hasTenantsConfig) {
        headers["X-Demo-Token"] = demoToken;
      } else {
        headers.Authorization = `Bearer ${demoToken}`;
      }
    }
  }

  return headers;
}

export async function fetchDemoConfig(): Promise<{
  demoModeEnabled: boolean;
  requiresDemoToken: boolean;
  hasTenantsConfig: boolean;
}> {

  const headers: Record<string, string> = {};
if (TENANT_ID) headers["X-Tenant-Id"] = TENANT_ID;

  const res = await fetch(
    `${import.meta.env.VITE_API_BASE || "http://localhost:5050"}/api/config`,
    {
      headers
    }
  );
  return res.json();
}
