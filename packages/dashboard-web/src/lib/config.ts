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
 * Tenant ID for this build/session.
 * All requests and socket connections use this tenant ID exclusively.
 * Default: "local" (dev mode)
 */
export const TENANT_ID = (
  (import.meta.env.VITE_TENANT_ID as string | undefined)?.trim() || "local"
).toLowerCase();
