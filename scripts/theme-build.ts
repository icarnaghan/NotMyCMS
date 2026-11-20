/**
 * Build-time hooks a theme can opt into, read by `vite.config.ts`.
 *
 * Both are optional files in the theme directory, so a theme that needs neither (the
 * Cloudscape theme) builds exactly as before:
 *
 * - `head.html`: a snippet injected at the end of `<head>`, for work that must happen
 *   before first paint, such as setting the dark-mode class. `{{STORAGE_PREFIX}}` is
 *   replaced with the config's `storagePrefix` so the snippet reads the same storage keys
 *   the app does.
 * - `vite-plugins.js`: a default export returning extra Vite plugins, such as Tailwind's.
 *   Loaded only for the selected theme, so other themes' build tooling never runs. Plain
 *   JavaScript, because it is imported at build time outside Vite's TypeScript handling.
 */
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { pathToFileURL } from "url";
import type { Plugin, PluginOption } from "vite";

const SLUG = /^[a-z0-9][a-z0-9-]*$/;

export function themeHeadPlugin(themeDir: string, storagePrefix: string): Plugin | null {
  const file = join(themeDir, "head.html");
  if (!existsSync(file)) return null;
  // The prefix ends up inside a script. The config validator already restricts it to a
  // slug; checking again here keeps this plugin safe on its own.
  if (!SLUG.test(storagePrefix)) {
    throw new Error(`storagePrefix "${storagePrefix}" is not script-safe`);
  }
  const snippet = readFileSync(file, "utf-8").replaceAll("{{STORAGE_PREFIX}}", storagePrefix);
  return {
    name: "theme-head",
    transformIndexHtml(html) {
      if (!html.includes("</head>")) throw new Error("index.html has no </head> to inject into");
      return html.replace("</head>", `${snippet.trimEnd()}\n  </head>`);
    },
  };
}

export async function themeVitePlugins(themeDir: string): Promise<PluginOption[]> {
  const file = join(themeDir, "vite-plugins.js");
  if (!existsSync(file)) return [];
  const mod = await import(pathToFileURL(file).href);
  return mod.default();
}
