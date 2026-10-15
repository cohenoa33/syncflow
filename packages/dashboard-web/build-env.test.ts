import { describe, expect, it } from "vitest";

import { validateTenantIdOrThrow } from "./build-env";

describe("validateTenantIdOrThrow", () => {
  it("returns the trimmed value for a valid tenant id", () => {
    expect(validateTenantIdOrThrow("my-tenant")).toBe("my-tenant");
  });

  it("trims surrounding whitespace from a valid tenant id", () => {
    expect(validateTenantIdOrThrow("  acme-corp\t")).toBe("acme-corp");
  });

  it("throws when the value is undefined", () => {
    expect(() => validateTenantIdOrThrow(undefined)).toThrow(
      /VITE_TENANT_ID is required/
    );
  });

  it("throws when the value is an empty string", () => {
    expect(() => validateTenantIdOrThrow("")).toThrow(
      /VITE_TENANT_ID is required/
    );
  });

  it("throws when the value is whitespace only", () => {
    expect(() => validateTenantIdOrThrow("   \t\n ")).toThrow(
      /VITE_TENANT_ID is required/
    );
  });

  it("error message names only VITE_TENANT_ID and does not reference other env vars", () => {
    try {
      validateTenantIdOrThrow(undefined);
      throw new Error("expected validateTenantIdOrThrow to throw");
    } catch (err) {
      const msg = (err as Error).message;
      expect(msg).toContain("VITE_TENANT_ID");
      expect(msg).not.toContain("TENANTS_JSON");
      expect(msg).not.toContain("DEMO_MODE_TOKEN");
      expect(msg).not.toContain("OPENAI_API_KEY");
      expect(msg).not.toContain("MONGODB_URI");
    }
  });
});
