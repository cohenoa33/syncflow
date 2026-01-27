import { TENANT_ID } from "./config";

export function authHeaders(): HeadersInit {
  const headers: Record<string, string> = {};
  const token = import.meta.env.VITE_DASHBOARD_API_KEY;
      console.log("[Dashboard] authHeaders token:", token); 
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  // Always include tenant ID (required)
  headers["X-Tenant-Id"] = TENANT_ID;

  return headers;
}

export function demoHeaders(): HeadersInit {
  const headers: Record<string, string> = {};

  // Always send viewer token in Authorization (so requireApiKey passes)
  const viewerToken = import.meta.env.VITE_DASHBOARD_API_KEY;
  if (viewerToken) {
    headers.Authorization = `Bearer ${viewerToken}`;
  }

  // Send demo token in a separate header (Fix A)
  const demoToken = import.meta.env.VITE_DEMO_MODE_TOKEN;
  if (demoToken) {
    headers["X-Demo-Token"] = demoToken;
  }

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
