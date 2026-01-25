import { TENANT_ID } from "./config";

export function authHeaders(): HeadersInit {
  const headers: Record<string, string> = {};
  const token = import.meta.env.VITE_DASHBOARD_API_KEY;
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  // Always include tenant ID (required in strict mode, default in dev)
  headers["X-Tenant-Id"] = TENANT_ID;

  return headers;
}

export function demoHeaders(): HeadersInit {
  const headers: Record<string, string> = {};

  // Include demo token ONLY if it's configured (strict mode scenario)
  const demoToken = import.meta.env.VITE_DEMO_MODE_TOKEN;
  if (demoToken) {
    headers.Authorization = `Bearer ${demoToken}`;
  }

  // Always include tenant ID
  headers["X-Tenant-Id"] = TENANT_ID;

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
