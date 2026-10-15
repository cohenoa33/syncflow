/**
 * Pure build-time env validation helpers for the dashboard frontend.
 *
 * Kept separate from `vite.config.ts` so the logic is unit-testable without
 * executing the full Vite config function.
 */

/**
 * Validate that VITE_TENANT_ID is set to a non-empty, non-whitespace value.
 *
 * Returns the trimmed tenant id on success. Throws on undefined, empty string,
 * or whitespace-only input. The error message names only VITE_TENANT_ID and
 * does not reference any other environment variable.
 */
export function validateTenantIdOrThrow(raw: string | undefined): string {
  const trimmed = raw?.trim();
  if (!trimmed) {
    throw new Error(
      "VITE_TENANT_ID is required for the dashboard frontend build. " +
        "Set a non-empty VITE_TENANT_ID in .env.local (dev) or the deployment env (build) before running vite."
    );
  }
  return trimmed;
}
