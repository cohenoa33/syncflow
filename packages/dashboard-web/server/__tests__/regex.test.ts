import { describe, it, expect } from "vitest";
import { escapeRegex } from "../utils/regex";

describe("escapeRegex", () => {
  it("returns an empty string unchanged", () => {
    expect(escapeRegex("")).toBe("");
  });

  it("leaves plain alphanumerics and spaces untouched", () => {
    expect(escapeRegex("hello world 123")).toBe("hello world 123");
  });

  it("escapes every regex metacharacter", () => {
    const metas = ".*+?^${}()|[]\\";
    const escaped = escapeRegex(metas);
    // Each meta char should be prefixed with a single backslash.
    for (const ch of metas) {
      expect(escaped).toContain("\\" + ch);
    }
  });

  it("produces a pattern that matches the original string literally", () => {
    const inputs = ["errors(.*)spike", "a.b*c", "price $5.00", "arr[0]", "a|b"];
    for (const input of inputs) {
      const re = new RegExp(escapeRegex(input));
      expect(re.test(input)).toBe(true);
      // And the escaped pattern must NOT also match a variant that only
      // matches if the metacharacters were interpreted.
      expect(re.test(input.replace(/[.*+?^${}()|[\]\\]/g, "X"))).toBe(false);
    }
  });
});
