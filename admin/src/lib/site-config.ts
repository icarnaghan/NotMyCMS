/**
 * Typed access to the repository-root `site.config.json` for the admin SPA.
 *
 * The import reaches outside the admin Vite root deliberately: the config describes the
 * deployment, and the admin is part of that deployment rather than a separate one.
 * Duplicating the file would reintroduce exactly the drift this change removes.
 */
import raw from "../../../site.config.json";
import type { SiteConfig } from "../../../site.config";

export const siteConfig = raw as SiteConfig;

/**
 * Builds a browser storage key.
 *
 * The public site has an identical helper. Both apps are served from the same origin, so
 * they share `localStorage` and these keys must match exactly — a unit test asserts the
 * resulting names in both suites to catch drift.
 */
export function storageKey(name: string): string {
  return `${siteConfig.storagePrefix}-${name}`;
}

/** Cognito hosted-UI domain, derived rather than configured. */
export function cognitoDomain(): string {
  return `https://${siteConfig.resourcePrefix}-admin.auth.${siteConfig.region}.amazoncognito.com`;
}

/** Where Cognito returns to after login. Derived from the site origin. */
export function adminRedirectUri(): string {
  return `${siteConfig.siteUrl}/admin/`;
}

/**
 * Title shown throughout the admin (top navigation, sidebar).
 *
 * Defaults to the framework name, NotMyCMS, when a deployment does not set `adminTitle`.
 * This is the one admin string that names the product rather than the site, so a fork
 * that leaves it unset is branded for the framework; a deployment that wants its own name
 * sets `adminTitle` in `site.config.json` (carnaghan.com sets "Carnaghan Admin").
 */
export function adminTitle(): string {
  return siteConfig.adminTitle ?? "NotMyCMS";
}
