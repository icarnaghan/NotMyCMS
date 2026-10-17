/**
 * User preference storage and theme resolution.
 *
 * Pure helpers, deliberately free of React so they can be unit tested and
 * reused. An equivalent module exists at `admin/src/lib/settings-preferences.ts`
 * — the two apps are built separately but served from the same origin, so they
 * share `localStorage` and therefore these keys. Setting dark mode on the public
 * site also themes the admin. Keep the two files in sync.
 *
 * Both now derive their keys from `storagePrefix` in `site.config.json`, so the
 * shared values come from one place rather than two literals that had to agree.
 */

import { siteConfig, storageKey } from "./site-config";

export type ThemePreference = "light" | "dark" | "system";
export type DensityPreference = "comfortable" | "compact";

/**
 * GA4 measurement ID, also used to build the GA opt-out flag name.
 *
 * `undefined` when no analytics is configured, which is a supported setup — the opt-out
 * then becomes a no-op rather than setting `ga-disable-undefined`.
 */
export const GA_MEASUREMENT_ID = siteConfig.analytics?.measurementId;

/**
 * Keys derived from `storagePrefix`, not `resourcePrefix`. Changing the prefix resets
 * every visitor's saved theme and density, so the tests assert the resulting literals
 * deliberately: that is a visitor-facing breaking change and should not pass silently.
 */
export const STORAGE_KEYS = {
  theme: storageKey("theme"),
  density: storageKey("density"),
  analyticsOptOut: storageKey("analytics-opt-out"),
} as const;

// Pre-"system" keys, still read once so existing visitors keep their choice.
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
    // Default to dark when the query is unsupported — matches the site's
    // long-standing dark-first appearance.
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
 * Defaults to "system" so a first-time visitor gets their OS preference.
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

/** Whether the visitor has opted out of analytics. Defaults to opted in. */
export function loadAnalyticsOptOut(): boolean {
  return readStoredValue(STORAGE_KEYS.analyticsOptOut) === "true";
}

/**
 * Apply the GA4 opt-out flag. Google Analytics checks `window['ga-disable-<ID>']`
 * before sending anything, so setting it suppresses collection even though the
 * gtag snippet is already loaded in index.html.
 */
export function applyAnalyticsOptOut(optOut: boolean): void {
  // No analytics configured means nothing to disable. Guarding here avoids setting a
  // meaningless `ga-disable-undefined` flag on the window.
  if (!GA_MEASUREMENT_ID) return;
  (window as unknown as Record<string, boolean>)[`ga-disable-${GA_MEASUREMENT_ID}`] = optOut;
}

/** Human-readable label for a theme preference, used in menus. */
export function themeLabel(preference: ThemePreference): string {
  if (preference === "light") return "Light";
  if (preference === "dark") return "Dark";
  return "System";
}
