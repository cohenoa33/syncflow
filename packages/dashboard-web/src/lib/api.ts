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

export function demoHeaders(requiresDemoToken = false): HeadersInit {
  const headers: Record<string, string> = {};

  // Always include tenant ID (required)
  headers["X-Tenant-Id"] = TENANT_ID;

  // Include viewer API key (required for all /api/* routes)
  const viewerKey = import.meta.env.VITE_DASHBOARD_API_KEY;
  if (viewerKey) {
    headers.Authorization = `Bearer ${viewerKey}`;
  }

  // Include demo token separately (required for demo routes in strict mode)
  if (requiresDemoToken) {
    const demoToken = import.meta.env.VITE_DEMO_MODE_TOKEN;
    if (demoToken) {
      headers["X-Demo-Token"] = demoToken;
    }
  }

  return headers;
}

export async function fetchDemoConfig(): Promise<{
  demoModeEnabled: boolean;
  requiresDemoToken: boolean;
}> {
  const res = await fetch(
    `${import.meta.env.VITE_API_BASE || "http://localhost:5050"}/api/config`
  );
  return res.json();
}
