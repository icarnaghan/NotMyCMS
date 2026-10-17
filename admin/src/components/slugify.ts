/**
 * Generates a URL-safe slug from a title string.
 * Matches the backend slugify logic for consistency.
 */
export function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/['\u2018\u2019\u201B]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}
