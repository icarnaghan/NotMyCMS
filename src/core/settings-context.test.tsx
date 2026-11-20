import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useEffect } from "react";
import { act, render, waitFor } from "@testing-library/react";
import { SettingsProvider, useSettings } from "./settings-context";
import { STORAGE_KEYS } from "../lib/settings-preferences";

/** Cloudscape's `applyTheme` injects a <style> element carrying the token values. */
/** The overridden body-m font size, or null when no override is present. */
const bodyM = () => themeCss().match(/--font-size-body-m-[\w-]*:\s*(\d+)px/)?.[1] ?? null;

const themeCss = () =>
  Array.from(document.querySelectorAll("style"))
    .map((s) => s.textContent ?? "")
    .join("\n");

const probe: { api: ReturnType<typeof useSettings> } = { api: undefined as never };
function Probe() {
  const value = useSettings();
  useEffect(() => {
    probe.api = value;
  });
  return null;
}

describe("text size", () => {
  beforeEach(() => {
    const store: Record<string, string> = {};
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

  it("applies no override by default", () => {
    render(
      <SettingsProvider>
        <Probe />
      </SettingsProvider>
    );
    expect(probe.api.textSize).toBe("default");
    expect(bodyM()).toBeNull();
  });

  it("applies a stored size on load, persists a change, and does not stack", async () => {
    localStorage.setItem(STORAGE_KEYS.textSize, "larger");
    render(
      <SettingsProvider>
        <Probe />
      </SettingsProvider>
    );
    expect(probe.api.textSize).toBe("larger");
    // The theming runtime loads lazily, so the override arrives asynchronously.
    await waitFor(() => expect(bodyM()).toBe("18"), { timeout: 5000 });

    act(() => probe.api.setTextSize("large"));
    expect(localStorage.getItem(STORAGE_KEYS.textSize)).toBe("large");
    await waitFor(() => expect(bodyM()).toBe("16"), { timeout: 5000 });

    act(() => probe.api.setTextSize("default"));
    await waitFor(() => expect(bodyM()).toBeNull(), { timeout: 5000 });
  });
});
