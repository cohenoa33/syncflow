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
  // DELETE THIS LOGGING BEFORE PRODUCTION RELEASE - this is to help debug tenant config issues during development and testing

  console.log("Generating demo headers with options:", options);
  // Always include tenant ID (required)
  headers["X-Tenant-Id"] = TENANT_ID;

  // Include viewer API key when tenants are configured (required for all /api/* routes)
  const viewerKey = import.meta.env.VITE_DASHBOARD_API_KEY;
  // DELETE THIS LOGGING BEFORE PRODUCTION RELEASE - this is to help debug tenant config issues during development and testing
  console.log("viewerKey:", viewerKey);
  if (hasTenantsConfig && viewerKey) {
    headers.Authorization = `Bearer ${viewerKey}`;
  }
  // DELETE THIS LOGGING BEFORE PRODUCTION RELEASE - this is to help debug tenant config issues during development and testing
  console.log(
    "Requires demo token:",
    requiresDemoToken,
    "Has tenants config:",
    hasTenantsConfig
  );
  // Include demo token when required (strict mode)
  if (requiresDemoToken) {
    const demoToken = import.meta.env.VITE_DEMO_MODE_TOKEN;
    // DELETE THIS LOGGING BEFORE PRODUCTION RELEASE - this is to help debug tenant config issues during development and testing
    console.log("Demo token required, token value:", demoToken);
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
