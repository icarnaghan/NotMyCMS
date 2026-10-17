/**
 * Typed access to `site.config.json` for the public site.
 *
 * One of four thin accessors over the same file — the others are
 * `admin/src/lib/site-config.ts`, `scripts/site-config.js` and
 * `infra/lib/site-config.ts`. None of them re-declare the config's contents; they only
 * type and re-export it, so there is exactly one place to change a value.
 */
import raw from "../../site.config.json";
import type { SiteConfig } from "../../site.config";

export const siteConfig = raw as SiteConfig;

/**
 * Builds a browser storage key.
 *
 * Note this uses `storagePrefix`, not `resourcePrefix`. They are separate fields
 * precisely so that renaming AWS resources does not silently reset every visitor's
 * saved theme and density.
 *
 * The admin SPA has an identical helper and is served from the same origin, so the two
 * must agree — a unit test asserts the resulting key names to catch drift.
 */
export function storageKey(name: string): string {
  return `${siteConfig.storagePrefix}-${name}`;
}

/** Absolute canonical URL for a site-relative path. */
export function absoluteUrl(path: string): string {
  const clean = path.startsWith("/") ? path : `/${path}`;
  return `${siteConfig.siteUrl}${clean === "/" ? "" : clean}`;
}
