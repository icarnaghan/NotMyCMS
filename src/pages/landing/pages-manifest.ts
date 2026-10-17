/**
 * The landing-pages manifest: the runtime equivalent of the compiled registry's
 * `pageSlugs()` + `navPages()` plus the per-page SEO.
 *
 * Fetched once at startup (see `pages-context.tsx`) so routing and navigation can resolve
 * the landing-page set at runtime rather than from a build-time import. Mirrors
 * `fetchManifest` in `src/lib/content.ts`: a failed fetch returns an empty manifest and
 * logs, so a manifest outage leaves the framework routes working rather than blanking the
 * site (requirement 1.6).
 *
 * The shape matches what `buildPagesManifest` in `scripts/build-artifacts.js` writes.
 */

export interface PageNav {
  label: string;
  order: number;
}

export interface PageManifestEntry {
  /** Route path without a leading slash. May contain slashes, e.g. `teaching/cmst388-tips`. */
  slug: string;
  /** Present only for pages that appear in the top navigation. */
  nav?: PageNav;
  seo: { title: string; description: string };
}

/**
 * Fetch the landing-pages manifest from S3 (served at `/content/pages/manifest.json`).
 * Returns an empty array on any failure, logging the error.
 */
export async function fetchPagesManifest(): Promise<PageManifestEntry[]> {
  try {
    const res = await fetch("/content/pages/manifest.json");
    if (!res.ok) throw new Error(`Failed to load pages manifest: ${res.status}`);
    const data = await res.json();
    if (!Array.isArray(data)) throw new Error("Pages manifest is not an array");
    return data as PageManifestEntry[];
  } catch (err) {
    console.error(err);
    return [];
  }
}
