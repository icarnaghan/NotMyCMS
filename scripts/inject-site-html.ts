/**
 * Build-time injection of site identity into `index.html`.
 *
 * `index.html` is not processed by the bundler the way modules are, so the values it
 * needs — title, canonical URL, feed title, analytics ID — had to be literals. That
 * made it the one file where this site's identity could not be configured.
 *
 * The transform is a pure function so it can be unit tested without running a build;
 * `siteHtmlPlugin` is the thin Vite wrapper. It runs in dev as well as build, so the
 * dev server serves the same head the deployed site does.
 */
import { readFileSync } from "fs";
import { join } from "path";
import type { Plugin } from "vite";
import type { SiteConfig } from "../site.config.d.ts";

/** Values injected into the HTML. Supplied by the caller rather than read here. */
export interface SiteHtmlValues {
  /** Fallback `<title>` for the app shell. */
  siteTitle: string;
  /** Absolute site URL, used for the canonical link and the feed href. */
  siteUrl: string;
  /** Used as the RSS `<link rel="alternate">` title. */
  siteName: string;
  /** BCP 47 tag for `<html lang>`. */
  locale: string;
  /**
   * GA4 measurement ID. When absent the whole analytics region is removed, which is
   * the supported "no analytics configured" setup.
   */
  analyticsId?: string;
  /** localStorage key the opt-out bootstrap reads, derived from `storagePrefix`. */
  analyticsOptOutKey: string;
}

/**
 * Region stripped when no analytics is configured. Markers rather than a token so the
 * snippet stays readable HTML in `index.html` instead of a string inside this file.
 */
const ANALYTICS_START = "<!-- analytics:start -->";
const ANALYTICS_END = "<!-- analytics:end -->";

/**
 * Tokens that land in an inline `<script>`, where HTML entity escaping would be wrong
 * and a quote would break out of the string literal. Rather than escape for a JS
 * context, these are required to be boring: a GA4 measurement ID and a storage key have
 * no legitimate reason to contain anything but word characters, dashes and dots, and
 * refusing everything else is a stronger guarantee than escaping.
 */
const SCRIPT_SAFE = /^[A-Za-z0-9._-]+$/;

/** Escapes a value for use in an HTML text node or a double-quoted attribute. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function requireScriptSafe(name: string, value: string): string {
  if (!SCRIPT_SAFE.test(value)) {
    throw new Error(
      `${name} is injected into an inline script and must match ${SCRIPT_SAFE} ` +
        `(received ${JSON.stringify(value)}).`
    );
  }
  return value;
}

/**
 * Removes the analytics region including its markers, leaving no blank gap behind.
 *
 * Operates on whole lines so the surrounding indentation stays intact.
 */
function stripAnalytics(html: string): string {
  const lines = html.split("\n");
  const start = lines.findIndex((l) => l.includes(ANALYTICS_START));
  const end = lines.findIndex((l) => l.includes(ANALYTICS_END));
  if (start === -1 || end === -1 || end < start) return html;
  lines.splice(start, end - start + 1);
  return lines.join("\n");
}

/**
 * Removes just the marker comments, keeping the region.
 *
 * The markers exist for the build, not for visitors, so they are not shipped either
 * way — a comment naming an internal build step is noise in a public document.
 */
function stripAnalyticsMarkers(html: string): string {
  return html
    .split("\n")
    .filter((l) => !l.includes(ANALYTICS_START) && !l.includes(ANALYTICS_END))
    .join("\n");
}

/**
 * Replaces `{{TOKEN}}` placeholders in `index.html`.
 *
 * Throws on any leftover token. A mistyped placeholder would otherwise ship literal
 * `{{SITE_TITLE}}` text in the document head, which no test would notice and which
 * search engines would happily index.
 */
export function injectSiteHtml(html: string, values: SiteHtmlValues): string {
  const out = values.analyticsId ? stripAnalyticsMarkers(html) : stripAnalytics(html);

  const replacements: Record<string, string> = {
    SITE_TITLE: escapeHtml(values.siteTitle),
    SITE_URL: escapeHtml(values.siteUrl),
    SITE_NAME: escapeHtml(values.siteName),
    SITE_LOCALE: escapeHtml(values.locale),
    ANALYTICS_OPT_OUT_KEY: requireScriptSafe("analyticsOptOutKey", values.analyticsOptOutKey),
    ...(values.analyticsId
      ? { ANALYTICS_ID: requireScriptSafe("analyticsId", values.analyticsId) }
      : {}),
  };

  const replaced = out.replace(/\{\{([A-Z0-9_]+)\}\}/g, (match, token: string) => {
    const value = replacements[token];
    if (value === undefined) {
      throw new Error(
        `index.html references an unknown placeholder ${match}. ` +
          `Known placeholders: ${Object.keys(replacements).join(", ")}.`
      );
    }
    return value;
  });

  return replaced;
}

/**
 * Suffix appended to `storagePrefix` to form the opt-out key.
 *
 * `src/lib/settings-preferences.ts` builds the same key through `storageKey()`. The two
 * are derived independently on purpose: importing the app module here would pull the
 * whole `src/` graph into Vite's config graph, which Vite's native config loader does
 * not support. `make verify-build` asserts the built `index.html` carries the key the
 * app expects, so the duplication is checked end to end rather than trusted.
 */
export const ANALYTICS_OPT_OUT_SUFFIX = "analytics-opt-out";

/** Reads the site config directly, rather than through the `src/` accessor. */
export function readSiteConfig(root = process.cwd()): SiteConfig {
  return JSON.parse(readFileSync(join(root, "site.config.json"), "utf-8")) as SiteConfig;
}

/** Derives the HTML values from a site config. */
export function siteHtmlValues(config: SiteConfig): SiteHtmlValues {
  return {
    siteTitle: config.siteTitle,
    siteUrl: config.siteUrl,
    siteName: config.siteName,
    locale: config.locale,
    analyticsId: config.analytics?.measurementId,
    analyticsOptOutKey: `${config.storagePrefix}-${ANALYTICS_OPT_OUT_SUFFIX}`,
  };
}

export interface SiteHtmlPluginOptions {
  /**
   * Directory holding `site.config.json`. Defaults to the working directory, which is
   * the repository root for the public site. The admin SPA builds from `admin/`, so it
   * passes the parent explicitly rather than relying on cwd.
   */
  root?: string;
}

/**
 * Vite plugin that feeds `index.html` from `site.config.json`.
 *
 * Shared by both apps. The admin template uses a subset of the placeholders, which is
 * fine — only placeholders actually present are substituted, and an unknown one still
 * fails the build.
 */
export function siteHtmlPlugin(options: SiteHtmlPluginOptions = {}): Plugin {
  const values = siteHtmlValues(readSiteConfig(options.root));
  return {
    name: "site-html",
    // `pre` so the substitution happens before Vite's own HTML env replacement and
    // before any other plugin inspects the head.
    enforce: "pre",
    transformIndexHtml(html) {
      return injectSiteHtml(html, values);
    },
  };
}
