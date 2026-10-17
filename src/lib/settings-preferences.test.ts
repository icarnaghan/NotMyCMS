import { describe, it, expect, vi, afterEach } from "vitest";
import {
  GA_MEASUREMENT_ID,
  STORAGE_KEYS,
  applyAnalyticsOptOut,
  loadAnalyticsOptOut,
  loadDensityPreference,
  loadThemePreference,
  prefersDark,
  readStoredValue,
  resolveTheme,
  themeLabel,
  writeStoredValue,
} from "./settings-preferences";

/**
 * Globals are stubbed rather than relying on jsdom, keeping the runner in the
 * default node environment.
 */

/** Install a working in-memory localStorage. Returns the backing store. */
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

/** Install a localStorage whose access always throws (private browsing, etc.). */
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

  it("returns null for a missing key", () => {
    stubStorage();
    expect(readStoredValue("nope")).toBeNull();
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

describe("prefersDark / resolveTheme", () => {
  it("reports the OS dark preference", () => {
    stubMatchMedia(true);
    expect(prefersDark()).toBe(true);
    stubMatchMedia(false);
    expect(prefersDark()).toBe(false);
  });

  it("falls back to dark when matchMedia is unavailable", () => {
    vi.stubGlobal("window", {
      matchMedia: () => {
        throw new Error("unsupported");
      },
    });
    expect(prefersDark()).toBe(true);
  });

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
});

describe("loadThemePreference", () => {
  it("defaults to system when nothing is stored", () => {
    stubStorage();
    expect(loadThemePreference()).toBe("system");
  });

  it("returns a stored preference", () => {
    stubStorage({ [STORAGE_KEYS.theme]: "light" });
    expect(loadThemePreference()).toBe("light");
  });

  it("ignores an unrecognised stored value", () => {
    stubStorage({ [STORAGE_KEYS.theme]: "chartreuse" });
    expect(loadThemePreference()).toBe("system");
  });

  it("migrates the legacy dark-mode flag", () => {
    stubStorage({ "blog-dark-mode": "true" });
    expect(loadThemePreference()).toBe("dark");
  });

  it("migrates the legacy light-mode flag", () => {
    stubStorage({ "blog-dark-mode": "false" });
    expect(loadThemePreference()).toBe("light");
  });

  it("prefers the new key over the legacy flag", () => {
    stubStorage({ [STORAGE_KEYS.theme]: "system", "blog-dark-mode": "true" });
    expect(loadThemePreference()).toBe("system");
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

  it("migrates the legacy compact flag", () => {
    stubStorage({ "blog-compact": "true" });
    expect(loadDensityPreference()).toBe("compact");
  });
});

describe("analytics opt-out", () => {
  it("defaults to opted in", () => {
    stubStorage();
    expect(loadAnalyticsOptOut()).toBe(false);
  });

  it("reads an opted-out preference", () => {
    stubStorage({ [STORAGE_KEYS.analyticsOptOut]: "true" });
    expect(loadAnalyticsOptOut()).toBe(true);
  });

  it("sets the GA disable flag when opting out", () => {
    const fakeWindow: Record<string, unknown> = {};
    vi.stubGlobal("window", fakeWindow);
    applyAnalyticsOptOut(true);
    expect(fakeWindow[`ga-disable-${GA_MEASUREMENT_ID}`]).toBe(true);
  });

  it("clears the GA disable flag when opting back in", () => {
    const fakeWindow: Record<string, unknown> = {
      [`ga-disable-${GA_MEASUREMENT_ID}`]: true,
    };
    vi.stubGlobal("window", fakeWindow);
    applyAnalyticsOptOut(false);
    expect(fakeWindow[`ga-disable-${GA_MEASUREMENT_ID}`]).toBe(false);
  });

  it("uses the same storage key the index.html bootstrap script reads", () => {
    // The inline script in index.html hardcodes this key so the opt-out applies
    // before gtag loads; keep them in sync.
    expect(STORAGE_KEYS.analyticsOptOut).toBe("carnaghan-analytics-opt-out");
  });
});

describe("themeLabel", () => {
  it("labels each preference", () => {
    expect(themeLabel("light")).toBe("Light");
    expect(themeLabel("dark")).toBe("Dark");
    expect(themeLabel("system")).toBe("System");
  });
});
