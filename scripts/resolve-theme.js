/**
 * Which visual theme this build uses.
 *
 * The theme is chosen at build time: the `theme` field of `site.config.json`, overridden
 * by the `THEME` environment variable for local development and CI. Valid names are the
 * directories under `src/themes/`, so adding a theme needs no list to keep in sync.
 */
import { readdirSync } from "fs";
import { join } from "path";

export const DEFAULT_THEME = "cloudscape";

/** Names of the theme directories under `src/themes/`. */
export function listThemes(root = process.cwd()) {
  return readdirSync(join(root, "src", "themes"), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

/**
 * Resolves the theme name. Throws, naming the valid choices, for an unknown theme, so a
 * typo fails the build instead of silently falling back to the default.
 */
export function resolveTheme(config, env = process.env, themes = listThemes()) {
  const fromEnv = env.THEME && env.THEME.trim() !== "" ? env.THEME.trim() : undefined;
  const name = fromEnv ?? config.theme ?? DEFAULT_THEME;
  if (!themes.includes(name)) {
    const source = fromEnv ? "THEME environment variable" : "site.config.json theme";
    throw new Error(`Unknown theme "${name}" in ${source}. Valid themes: ${themes.join(", ")}.`);
  }
  return name;
}
