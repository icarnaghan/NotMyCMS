import { describe, it, expect } from "vitest";
import { DEFAULT_THEME, listThemes, resolveTheme } from "./resolve-theme.js";

const THEMES = ["cloudscape", "tailwind"];

describe("resolveTheme", () => {
  it("defaults to cloudscape when the config has no theme", () => {
    expect(resolveTheme({}, {}, THEMES)).toBe("cloudscape");
    expect(DEFAULT_THEME).toBe("cloudscape");
  });
  it("uses the config value", () => {
    expect(resolveTheme({ theme: "tailwind" }, {}, THEMES)).toBe("tailwind");
  });
  it("lets THEME override the config", () => {
    expect(resolveTheme({ theme: "tailwind" }, { THEME: "cloudscape" }, THEMES)).toBe("cloudscape");
  });
  it("ignores an empty THEME", () => {
    expect(resolveTheme({ theme: "tailwind" }, { THEME: "  " }, THEMES)).toBe("tailwind");
  });
  it("rejects an unknown theme and lists the valid ones", () => {
    expect(() => resolveTheme({ theme: "neon" }, {}, THEMES)).toThrow(
      /Unknown theme "neon" in site.config.json theme. Valid themes: cloudscape, tailwind/
    );
  });
  it("names the environment variable when that is the source", () => {
    expect(() => resolveTheme({}, { THEME: "neon" }, THEMES)).toThrow(/THEME environment variable/);
  });
});

describe("listThemes", () => {
  it("includes the default theme from the real src/themes directory", () => {
    expect(listThemes()).toContain(DEFAULT_THEME);
  });
});
