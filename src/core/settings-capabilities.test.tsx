/**
 * Requirement 4.3: a stored preference the active theme does not support is ignored, not
 * erased. A visitor who chose "compact" under Cloudscape keeps that choice in storage, so
 * it applies again if the site switches back, and the admin (which shares storage) still
 * sees it.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render } from "@testing-library/react";
import { useEffect } from "react";
import type { AppearanceSettings } from "../themes/types";

const applied: AppearanceSettings[] = [];

// A theme that supports neither density nor text size.
vi.mock("@theme", () => ({
  default: {
    name: "minimal",
    capabilities: { colorModes: ["light", "dark", "system"], density: false, textSize: false },
    applySettings: (s: AppearanceSettings) => applied.push(s),
  },
}));

const { SettingsProvider, useSettings } = await import("./settings-context");
const { STORAGE_KEYS } = await import("../lib/settings-preferences");

const probe: { api: ReturnType<typeof useSettings> } = { api: undefined as never };
function Probe() {
  const value = useSettings();
  useEffect(() => {
    probe.api = value;
  });
  return null;
}

describe("unsupported stored preferences", () => {
  let store: Record<string, string>;
  beforeEach(() => {
    applied.length = 0;
    store = {
      [STORAGE_KEYS.density]: "compact",
      [STORAGE_KEYS.textSize]: "larger",
    };
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => (k in store ? store[k] : null),
      setItem: (k: string, v: string) => {
        store[k] = v;
      },
      removeItem: (k: string) => {
        delete store[k];
      },
    });
    vi.stubGlobal(
      "matchMedia",
      vi.fn().mockReturnValue({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })
    );
  });
  afterEach(() => vi.unstubAllGlobals());

  it("applies the defaults instead", () => {
    render(
      <SettingsProvider>
        <Probe />
      </SettingsProvider>
    );
    expect(applied.at(-1)).toMatchObject({ density: "comfortable", textSize: "default" });
  });

  it("leaves the stored values untouched", () => {
    render(
      <SettingsProvider>
        <Probe />
      </SettingsProvider>
    );
    // Changing a supported setting must not rewrite the unsupported ones.
    act(() => probe.api.setTheme("dark"));
    expect(store[STORAGE_KEYS.density]).toBe("compact");
    expect(store[STORAGE_KEYS.textSize]).toBe("larger");
    expect(applied.at(-1)).toMatchObject({
      colorMode: "dark",
      density: "comfortable",
      textSize: "default",
    });
  });

  it("still reports the stored preference, so the theme's menu can show it if it wants", () => {
    render(
      <SettingsProvider>
        <Probe />
      </SettingsProvider>
    );
    expect(probe.api.density).toBe("compact");
    expect(probe.api.capabilities.density).toBe(false);
  });
});
