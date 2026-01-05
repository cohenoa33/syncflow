export function authHeaders(): HeadersInit {
  const token = import.meta.env.VITE_DASHBOARD_API_KEY;
  if (!token) return {};
  return { Authorization: `Bearer ${token}` };
}
