import { createContext, useContext, useState, useEffect, type ReactNode } from "react";
import activeTheme from "@theme";
import {
  STORAGE_KEYS,
  applyAnalyticsOptOut,
  loadAnalyticsOptOut,
  loadDensityPreference,
  loadTextSizePreference,
  loadThemePreference,
  resolveTheme,
  writeStoredValue,
  type DensityPreference,
  type ThemePreference,
} from "../lib/settings-preferences";
import type { TextSizePreference } from "../lib/text-size";
import type { ThemeCapabilities } from "../themes/types";

interface Settings {
  theme: ThemePreference;
  density: DensityPreference;
  textSize: TextSizePreference;
  analyticsOptOut: boolean;
  /** The theme actually applied, with "system" resolved. */
  resolvedTheme: "light" | "dark";
  setTheme: (theme: ThemePreference) => void;
  setDensity: (density: DensityPreference) => void;
  setTextSize: (size: TextSizePreference) => void;
  setAnalyticsOptOut: (optOut: boolean) => void;
  /** What the active theme supports. The settings menu offers only these. */
  capabilities: ThemeCapabilities;
}

const SettingsContext = createContext<Settings>({
  theme: "system",
  density: "comfortable",
  textSize: "default",
  analyticsOptOut: false,
  resolvedTheme: "dark",
  setTheme: () => {},
  setDensity: () => {},
  setTextSize: () => {},
  setAnalyticsOptOut: () => {},
  capabilities: activeTheme.capabilities,
});

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemePreference>(loadThemePreference);
  const [density, setDensityState] = useState<DensityPreference>(loadDensityPreference);
  const [textSize, setTextSizeState] = useState<TextSizePreference>(loadTextSizePreference);
  const [analyticsOptOut, setAnalyticsOptOutState] = useState<boolean>(loadAnalyticsOptOut);

  // Tracks the OS preference so a "system" choice updates live if the user
  // switches their device theme while the page is open.
  const [systemIsDark, setSystemIsDark] = useState(() => resolveTheme("system") === "dark");

  useEffect(() => {
    let media: MediaQueryList;
    try {
      media = window.matchMedia("(prefers-color-scheme: dark)");
    } catch {
      return;
    }
    const onChange = (event: MediaQueryListEvent) => setSystemIsDark(event.matches);
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  const resolvedTheme: "light" | "dark" =
    theme === "system" ? (systemIsDark ? "dark" : "light") : theme;

  // A stored preference the theme does not support is ignored, not erased: it stays in
  // storage and takes effect again under a theme that supports it.
  const { capabilities } = activeTheme;
  const effectiveDensity: DensityPreference = capabilities.density ? density : "comfortable";
  const effectiveTextSize: TextSizePreference = capabilities.textSize ? textSize : "default";
  useEffect(() => {
    activeTheme.applySettings({
      colorMode: theme,
      resolvedMode: resolvedTheme,
      density: effectiveDensity,
      textSize: effectiveTextSize,
    });
  }, [theme, resolvedTheme, effectiveDensity, effectiveTextSize]);
  // Apply the GA opt-out flag on mount and whenever it changes.
  useEffect(() => {
    applyAnalyticsOptOut(analyticsOptOut);
  }, [analyticsOptOut]);

  return (
    <SettingsContext.Provider
      value={{
        theme,
        density,
        textSize,
        analyticsOptOut,
        resolvedTheme,
        capabilities,
        setTheme: (next) => {
          writeStoredValue(STORAGE_KEYS.theme, next);
          setThemeState(next);
        },
        setDensity: (next) => {
          writeStoredValue(STORAGE_KEYS.density, next);
          setDensityState(next);
        },
        setTextSize: (next) => {
          writeStoredValue(STORAGE_KEYS.textSize, next);
          setTextSizeState(next);
        },
        setAnalyticsOptOut: (next) => {
          writeStoredValue(STORAGE_KEYS.analyticsOptOut, String(next));
          setAnalyticsOptOutState(next);
        },
      }}
    >
      {children}
    </SettingsContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useSettings() {
  return useContext(SettingsContext);
}
