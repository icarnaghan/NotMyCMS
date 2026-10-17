/**
 * User preference storage and theme resolution for the admin.
 *
 * Mirrors `src/lib/settings-preferences.ts` on the public site. The two apps are
 * built separately but served from the same origin, so they share `localStorage`
 * and these keys — choosing dark mode on the public site also themes the admin,
 * and vice versa. Keep the two files in sync.
 *
 * The analytics opt-out lives only in the public module: the admin has no
 * Google Analytics snippet.
 */

import { storageKey } from "./site-config";

export type ThemePreference = "light" | "dark" | "system";
export type DensityPreference = "comfortable" | "compact";

/**
 * Derived from `storagePrefix` in the repository-root `site.config.json`, the same
 * source the public site uses — so the two no longer rely on matching literals.
 *
 * The tests still assert the resulting literals on purpose: changing the prefix resets
 * every visitor's saved theme and density, which should fail loudly rather than pass as
 * a config edit.
 */
export const STORAGE_KEYS = {
  theme: storageKey("theme"),
  density: storageKey("density"),
} as const;

// Pre-"system" keys from the public site, still read so a visitor's existing
// choice carries over into the admin.
const LEGACY_DARK_MODE_KEY = "blog-dark-mode";
const LEGACY_COMPACT_KEY = "blog-compact";

/**
 * Read a key from localStorage, returning null if storage is unavailable.
 *
 * Accessing localStorage can throw (Safari private browsing, blocked
 * third-party storage, some embedded webviews). These helpers must never throw:
 * they run during initial render, so an exception would blank the page.
 */
export function readStoredValue(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

/** Write a key to localStorage, silently ignoring failures (e.g. quota of 0). */
export function writeStoredValue(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Preferences simply won't persist; the in-memory value still applies.
  }
}

/** Whether the OS/browser currently reports a dark color-scheme preference. */
export function prefersDark(): boolean {
  try {
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  } catch {
    // Default to dark when the query is unsupported — matches the admin's
    // long-standing dark appearance.
    return true;
  }
}

/** Resolve a preference (which may be "system") to a concrete theme. */
export function resolveTheme(preference: ThemePreference): "light" | "dark" {
  if (preference === "system") {
    return prefersDark() ? "dark" : "light";
  }
  return preference;
}

/**
 * Load the stored theme preference, migrating the legacy boolean key.
 * Defaults to "system" so the admin follows the OS preference out of the box.
 */
export function loadThemePreference(): ThemePreference {
  const stored = readStoredValue(STORAGE_KEYS.theme);
  if (stored === "light" || stored === "dark" || stored === "system") {
    return stored;
  }

  const legacy = readStoredValue(LEGACY_DARK_MODE_KEY);
  if (legacy === "true") return "dark";
  if (legacy === "false") return "light";

  return "system";
}

/** Load the stored density preference, migrating the legacy boolean key. */
export function loadDensityPreference(): DensityPreference {
  const stored = readStoredValue(STORAGE_KEYS.density);
  if (stored === "comfortable" || stored === "compact") {
    return stored;
  }

  const legacy = readStoredValue(LEGACY_COMPACT_KEY);
  if (legacy === "true") return "compact";

  return "comfortable";
}

/** Human-readable label for a theme preference, used in menus. */
export function themeLabel(preference: ThemePreference): string {
  if (preference === "light") return "Light";
  if (preference === "dark") return "Dark";
  return "System";
}
