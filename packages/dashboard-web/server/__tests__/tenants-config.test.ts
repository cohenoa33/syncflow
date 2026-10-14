/**
 * TENANTS_JSON initialization and validation tests
 *
 * Exercises the explicit `initializeTenantsConfig()` entry point. Tests set
 * `process.env.TENANTS_JSON`, call `initializeTenantsConfig()` directly, and
 * assert the resulting state (or thrown error).
 *
 * The malformed-JSON path must never leave stale state consumable: after a
 * failed re-init, `getAuthConfig()` must throw the init-guard error.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  TENANTS,
  TenantsConfigError,
  __TEST_clearTenantsInit,
  getAuthConfig,
  getAppCount,
  initializeTenantsConfig
} from "../tenants";

function clearTenantsEnv() {
  delete process.env.TENANTS_JSON;
  delete process.env.AUTH_MODE;
}

beforeEach(() => {
  clearTenantsEnv();
  __TEST_clearTenantsInit();
});

afterEach(() => {
  clearTenantsEnv();
  __TEST_clearTenantsInit();
});

describe("initializeTenantsConfig — empty-equivalent inputs", () => {
  it("TENANTS_JSON unset → empty config, no throw, getAuthConfig returns hasTenantsConfig=false", () => {
    expect(() => initializeTenantsConfig()).not.toThrow();
    expect(TENANTS).toEqual({});
    expect(getAppCount()).toBe(0);
    expect(getAuthConfig().hasTenantsConfig).toBe(false);
  });

  it('TENANTS_JSON="" → empty config', () => {
    process.env.TENANTS_JSON = "";
    expect(() => initializeTenantsConfig()).not.toThrow();
    expect(TENANTS).toEqual({});
    expect(getAuthConfig().hasTenantsConfig).toBe(false);
  });

  it('TENANTS_JSON="   " (whitespace only) → empty config', () => {
    process.env.TENANTS_JSON = "   \t\n ";
    expect(() => initializeTenantsConfig()).not.toThrow();
    expect(TENANTS).toEqual({});
    expect(getAuthConfig().hasTenantsConfig).toBe(false);
  });
});

describe("initializeTenantsConfig — valid non-empty config", () => {
  it("parses a well-formed tenants object and builds indexes", () => {
    process.env.TENANTS_JSON = JSON.stringify({
      "tenant-a": {
        apps: { billing: "token-a" },
        dashboards: { "viewer-a": true }
      },
      "tenant-b": {
        apps: {},
        dashboards: { "viewer-b": true }
      }
    });

    expect(() => initializeTenantsConfig()).not.toThrow();
    expect(Object.keys(TENANTS).sort()).toEqual(["tenant-a", "tenant-b"]);
    expect(getAppCount()).toBe(1);
    expect(getAuthConfig().hasTenantsConfig).toBe(true);
    expect(getAuthConfig().requireAgentAuth).toBe(true);
  });

  it("empty object literal {} is a valid config with hasTenantsConfig=false", () => {
    process.env.TENANTS_JSON = "{}";
    expect(() => initializeTenantsConfig()).not.toThrow();
    expect(TENANTS).toEqual({});
    expect(getAuthConfig().hasTenantsConfig).toBe(false);
  });
});

describe("initializeTenantsConfig — malformed JSON fails fast", () => {
  it("throws TenantsConfigError on parse error", () => {
    process.env.TENANTS_JSON = "{not json";
    expect(() => initializeTenantsConfig()).toThrow(TenantsConfigError);
  });

  it("error message is fixed and does not leak raw JSON contents", () => {
    const secretLooking = 'sk-live-ABC123DEF';
    process.env.TENANTS_JSON = `{"tenant-a": "${secretLooking}"`; // trailing unclosed brace
    try {
      initializeTenantsConfig();
      throw new Error("expected initializeTenantsConfig to throw");
    } catch (err) {
      expect(err).toBeInstanceOf(TenantsConfigError);
      const msg = (err as Error).message;
      expect(msg).toBe(
        "TENANTS_JSON is set but is not valid JSON. Refusing to start."
      );
      expect(msg).not.toContain(secretLooking);
      expect(msg).not.toContain("tenant-a");
    }
  });
});

describe("initializeTenantsConfig — valid JSON but wrong shape", () => {
  const badShapes: Array<[string, string]> = [
    ["null", "null"],
    ["array", "[]"],
    ["string", '"a string"'],
    ["number", "42"],
    ["boolean", "true"]
  ];

  for (const [label, value] of badShapes) {
    it(`throws TenantsConfigError when TENANTS_JSON is ${label}`, () => {
      process.env.TENANTS_JSON = value;
      expect(() => initializeTenantsConfig()).toThrow(TenantsConfigError);
      expect(() => initializeTenantsConfig()).toThrow(
        /TENANTS_JSON must be a JSON object keyed by tenantId\./
      );
    });
  }
});

describe("getAuthConfig init guard", () => {
  it("throws when called before initializeTenantsConfig()", () => {
    __TEST_clearTenantsInit();
    expect(() => getAuthConfig()).toThrow(
      /getAuthConfig\(\) called before initializeTenantsConfig\(\)/
    );
  });

  it("stops throwing after a successful initialize", () => {
    __TEST_clearTenantsInit();
    expect(() => getAuthConfig()).toThrow();

    process.env.TENANTS_JSON = "";
    initializeTenantsConfig();
    expect(() => getAuthConfig()).not.toThrow();
  });
});

describe("re-initialization semantics", () => {
  it("re-init with empty env replaces a previously populated config", () => {
    process.env.TENANTS_JSON = JSON.stringify({
      "tenant-a": { apps: {}, dashboards: { "viewer-a": true } }
    });
    initializeTenantsConfig();
    expect(getAuthConfig().hasTenantsConfig).toBe(true);

    process.env.TENANTS_JSON = "";
    initializeTenantsConfig();
    expect(TENANTS).toEqual({});
    expect(getAuthConfig().hasTenantsConfig).toBe(false);
  });

  it("auth cache is invalidated on re-init (no manual auth reset needed)", () => {
    // First init: dev mode, empty tenants
    process.env.TENANTS_JSON = "";
    process.env.AUTH_MODE = "dev";
    initializeTenantsConfig();
    expect(getAuthConfig().authMode).toBe("dev");
    expect(getAuthConfig().hasTenantsConfig).toBe(false);

    // Second init: strict mode, populated tenants. No __TEST_resetAuthConfig
    // call between inits — initializeTenantsConfig must invalidate the cache.
    process.env.TENANTS_JSON = JSON.stringify({
      "tenant-a": {
        apps: { billing: "token-a" },
        dashboards: { "viewer-a": true }
      }
    });
    process.env.AUTH_MODE = "strict";
    initializeTenantsConfig();

    const next = getAuthConfig();
    expect(next.authMode).toBe("strict");
    expect(next.hasTenantsConfig).toBe(true);
    expect(next.requireAgentAuth).toBe(true);
  });

  it("failed re-init leaves tenant state uninitialized — getAuthConfig throws rather than returning stale state", () => {
    // Successful initial init with real tenants.
    process.env.TENANTS_JSON = JSON.stringify({
      "tenant-a": {
        apps: { billing: "token-a" },
        dashboards: { "viewer-a": true }
      }
    });
    initializeTenantsConfig();
    expect(getAuthConfig().hasTenantsConfig).toBe(true);

    // Second init with malformed JSON throws. State must NOT remain
    // "tenant-a configured"; it must be uninitialized.
    process.env.TENANTS_JSON = "{not json";
    expect(() => initializeTenantsConfig()).toThrow(TenantsConfigError);

    // Previously populated config is no longer consumable.
    expect(() => getAuthConfig()).toThrow(
      /getAuthConfig\(\) called before initializeTenantsConfig\(\)/
    );
  });
});
