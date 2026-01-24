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
