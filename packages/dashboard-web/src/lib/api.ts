export function authHeaders(): HeadersInit {
  const headers: Record<string, string> = {};

  const token = import.meta.env.VITE_DASHBOARD_API_KEY;
  if (token) headers.Authorization = `Bearer ${token}`;

  const tenant = (import.meta.env.VITE_TENANT_ID as string | undefined)?.trim();
  headers["X-Tenant-Id"] = tenant && tenant.length > 0 ? tenant : "local";

  return headers;
}