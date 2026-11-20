import { describe, it, expect } from "vitest";

/**
 * `src/core` is shared by every theme, so it must not depend on any one theme's UI
 * library. This is the check that keeps that true as the core grows.
 */
const BANNED = [/@cloudscape-design/, /tailwind/i];

const sources = import.meta.glob<string>("./*.{ts,tsx}", {
  query: "?raw",
  import: "default",
  eager: true,
});
const files = Object.keys(sources).filter((f) => !f.includes(".test."));

describe("src/core is headless", () => {
  it("has source files to check", () => {
    expect(files.length).toBeGreaterThan(5);
  });
  it.each(files)("%s imports no UI library", (file) => {
    const imports = sources[file]
      .split("\n")
      .filter((line) => /^\s*(import|export)\b.*from\s/.test(line));
    for (const line of imports) {
      for (const banned of BANNED) expect(line).not.toMatch(banned);
    }
  });
});
