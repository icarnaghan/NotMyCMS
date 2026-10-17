import { createContext, useContext, useState, useEffect, type ReactNode } from "react";
import { applyMode, applyDensity, Mode, Density } from "@cloudscape-design/global-styles";
import {
  STORAGE_KEYS,
  applyAnalyticsOptOut,
  loadAnalyticsOptOut,
  loadDensityPreference,
  loadThemePreference,
  resolveTheme,
  writeStoredValue,
  type DensityPreference,
  type ThemePreference,
} from "./settings-preferences";

interface Settings {
  theme: ThemePreference;
  density: DensityPreference;
  analyticsOptOut: boolean;
  /** The theme actually applied, with "system" resolved. */
  resolvedTheme: "light" | "dark";
  setTheme: (theme: ThemePreference) => void;
  setDensity: (density: DensityPreference) => void;
  setAnalyticsOptOut: (optOut: boolean) => void;
}

const SettingsContext = createContext<Settings>({
  theme: "system",
  density: "comfortable",
  analyticsOptOut: false,
  resolvedTheme: "dark",
  setTheme: () => {},
  setDensity: () => {},
  setAnalyticsOptOut: () => {},
});

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemePreference>(loadThemePreference);
  const [density, setDensityState] = useState<DensityPreference>(loadDensityPreference);
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

  useEffect(() => {
    applyMode(resolvedTheme === "dark" ? Mode.Dark : Mode.Light);
  }, [resolvedTheme]);

  useEffect(() => {
    applyDensity(density === "compact" ? Density.Compact : Density.Comfortable);
  }, [density]);

  // Apply the GA opt-out flag on mount and whenever it changes.
  useEffect(() => {
    applyAnalyticsOptOut(analyticsOptOut);
  }, [analyticsOptOut]);

  return (
    <SettingsContext.Provider
      value={{
        theme,
        density,
        analyticsOptOut,
        resolvedTheme,
        setTheme: (next) => {
          writeStoredValue(STORAGE_KEYS.theme, next);
          setThemeState(next);
        },
        setDensity: (next) => {
          writeStoredValue(STORAGE_KEYS.density, next);
          setDensityState(next);
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
