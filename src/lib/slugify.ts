/**
 * Converts text to a URL-friendly slug.
 *
 * Apostrophes (straight and curly) are removed rather than treated as
 * separators, so "Don't" becomes "dont" and not "don-t".
 *
 * This behaviour must stay identical across all six implementations:
 *   - src/lib/slugify.ts                  (this file — heading anchors)
 *   - admin/src/components/slugify.ts     (editor slug preview)
 *   - infra/lambda/content/index.ts       (directory name for a new post)
 *   - infra/lambda/deploy/index.ts        (manifest slug on admin deploys)
 *   - scripts/generate-manifest.js        (manifest slug at build time)
 *   - scripts/rename-dirs.js             (directory renames)
 *
 * They previously disagreed: the manifest generators treated apostrophes as
 * separators while the others removed them, so a new post with an apostrophe in
 * its title was created in a directory that didn't match the slug the manifest
 * advertised, and the published link 404'd. The 38 affected directories were
 * renamed and 301 redirects added in infra/redirects.json.
 */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/['\u2018\u2019\u201B]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}
