// Shared CORS origin policy for the Express API and the Socket.IO server.
//
// Production: only origins explicitly listed in CORS_ALLOWED_ORIGINS are allowed.
// Development: any localhost / 127.0.0.1 origin is allowed regardless of port, so
// the dashboard works even when Vite falls back to 5174, 5175, … because 5173 is
// already taken. The explicit allowlist is still honored on top of that.

const isProd = process.env.NODE_ENV === "production";

/** Explicit origins from CORS_ALLOWED_ORIGINS (defaults to the standard Vite port). */
export function getAllowedOrigins(): string[] {
  return (process.env.CORS_ALLOWED_ORIGINS || "http://localhost:5173")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/** True for http(s)://localhost:<port> and http(s)://127.0.0.1:<port> (any port). */
function isLocalhostOrigin(origin: string): boolean {
  try {
    const { hostname } = new URL(origin);
    return hostname === "localhost" || hostname === "127.0.0.1";
  } catch {
    return false;
  }
}

/** Decide whether a request/socket origin is permitted under the current env. */
export function isOriginAllowed(origin: string | undefined): boolean {
  // No Origin header (same-origin requests, curl, server-to-server) → allow.
  if (!origin) return true;
  if (getAllowedOrigins().includes(origin)) return true;
  // In dev, accept whatever localhost port Vite ended up on.
  if (!isProd && isLocalhostOrigin(origin)) return true;
  return false;
}

/** Origin callback compatible with both the `cors` package and Socket.IO. */
export function corsOriginCallback(
  origin: string | undefined,
  cb: (err: Error | null, allow?: boolean) => void
): void {
  if (isOriginAllowed(origin)) return cb(null, true);
  cb(new Error(`CORS: origin "${origin}" not allowed`));
}
