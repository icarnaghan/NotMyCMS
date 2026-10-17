import { describe, it, expect, vi, afterEach } from "vitest";
import {
  STORAGE_KEYS,
  loadDensityPreference,
  loadThemePreference,
  prefersDark,
  readStoredValue,
  resolveTheme,
  themeLabel,
  writeStoredValue,
} from "./settings-preferences";

/**
 * Mirrors src/lib/settings-preferences.test.ts on the public site. Globals are
 * stubbed rather than relying on jsdom, keeping the runner in node environment.
 */

function stubStorage(initial: Record<string, string> = {}) {
  const store = { ...initial };
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => (key in store ? store[key] : null),
    setItem: (key: string, value: string) => {
      store[key] = value;
    },
    removeItem: (key: string) => {
      delete store[key];
    },
  });
  return store;
}

function stubThrowingStorage() {
  vi.stubGlobal("localStorage", {
    getItem: () => {
      throw new Error("SecurityError: storage is not available");
    },
    setItem: () => {
      throw new Error("QuotaExceededError");
    },
  });
}

function stubMatchMedia(matches: boolean) {
  vi.stubGlobal("window", { matchMedia: () => ({ matches }) });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("readStoredValue / writeStoredValue", () => {
  it("round-trips a value through localStorage", () => {
    stubStorage();
    writeStoredValue("k", "v");
    expect(readStoredValue("k")).toBe("v");
  });

  it("returns null instead of throwing when storage access throws", () => {
    stubThrowingStorage();
    expect(() => readStoredValue("k")).not.toThrow();
    expect(readStoredValue("k")).toBeNull();
  });

  it("does not throw when a write fails", () => {
    stubThrowingStorage();
    expect(() => writeStoredValue("k", "v")).not.toThrow();
  });

  it("returns null when localStorage is entirely absent", () => {
    vi.stubGlobal("localStorage", undefined);
    expect(readStoredValue("k")).toBeNull();
  });
});

describe("resolveTheme", () => {
  it("passes explicit preferences through unchanged", () => {
    stubMatchMedia(true);
    expect(resolveTheme("light")).toBe("light");
    expect(resolveTheme("dark")).toBe("dark");
  });

  it("resolves system to the OS preference", () => {
    stubMatchMedia(true);
    expect(resolveTheme("system")).toBe("dark");
    stubMatchMedia(false);
    expect(resolveTheme("system")).toBe("light");
  });

  it("falls back to dark when matchMedia is unavailable", () => {
    vi.stubGlobal("window", {
      matchMedia: () => {
        throw new Error("unsupported");
      },
    });
    expect(prefersDark()).toBe(true);
  });
});

describe("loadThemePreference", () => {
  it("defaults to system when nothing is stored", () => {
    stubStorage();
    expect(loadThemePreference()).toBe("system");
  });

  it("returns a stored preference", () => {
    stubStorage({ [STORAGE_KEYS.theme]: "dark" });
    expect(loadThemePreference()).toBe("dark");
  });

  it("migrates the legacy dark-mode flag from the public site", () => {
    stubStorage({ "blog-dark-mode": "true" });
    expect(loadThemePreference()).toBe("dark");
  });

  it("defaults to system when storage is unavailable", () => {
    stubThrowingStorage();
    expect(loadThemePreference()).toBe("system");
  });
});

describe("loadDensityPreference", () => {
  it("defaults to comfortable", () => {
    stubStorage();
    expect(loadDensityPreference()).toBe("comfortable");
  });

  it("returns a stored preference", () => {
    stubStorage({ [STORAGE_KEYS.density]: "compact" });
    expect(loadDensityPreference()).toBe("compact");
  });

  it("migrates the legacy compact flag from the public site", () => {
    stubStorage({ "blog-compact": "true" });
    expect(loadDensityPreference()).toBe("compact");
  });
});

describe("shared storage keys", () => {
  it("uses the same keys as the public site so preferences carry across", () => {
    // Both apps are served from www.carnaghan.com and therefore share
    // localStorage. If these change, update src/lib/settings-preferences.ts too.
    expect(STORAGE_KEYS.theme).toBe("carnaghan-theme");
    expect(STORAGE_KEYS.density).toBe("carnaghan-density");
  });
});

describe("themeLabel", () => {
  it("labels each preference", () => {
    expect(themeLabel("light")).toBe("Light");
    expect(themeLabel("dark")).toBe("Dark");
    expect(themeLabel("system")).toBe("System");
  });
});
