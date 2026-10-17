/**
 * Resolves markdown image sources for the editor preview.
 *
 * Content markdown references images relatively (`images/diagram.png`), which is
 * what the public site expects — it rewrites them to
 * `/content/{type}/{slug}/images/diagram.png`. In the admin the preview is
 * rendered at a URL like `/admin/posts/my-slug`, so a bare relative path would
 * resolve against that and 404. Applying the same rewrite makes uploaded images
 * appear in the preview.
 *
 * Both apps are served from the same origin, so a root-relative `/content/...`
 * URL hits the published image through CloudFront.
 */

/** Sources that are already resolvable and must be passed through untouched. */
function isAlreadyAbsolute(src: string): boolean {
  return (
    /^[a-z][a-z0-9+.-]*:/i.test(src) || // http:, https:, data:, blob:
    src.startsWith("//") || // protocol-relative
    src.startsWith("/") // root-relative
  );
}

/**
 * Map a markdown image source to something the preview can load.
 *
 * Returns the input unchanged when it is already absolute, or when there is no
 * slug yet (an unsaved post has no content directory — image uploads are
 * disabled until it is saved).
 */
export function resolveImageSrc(
  src: string | undefined,
  contentType: "posts" | "knowledge-base",
  slug: string | undefined
): string {
  if (!src) return "";

  const trimmed = src.trim();
  if (!trimmed) return "";

  if (isAlreadyAbsolute(trimmed)) return trimmed;
  if (!slug) return trimmed;

  // Strip trailing slashes from the slug and any leading "./" from the source.
  const cleanSlug = slug.replace(/\/+$/, "");
  if (!cleanSlug) return trimmed;

  const cleanSrc = trimmed.replace(/^\.\//, "");

  return `/content/${contentType}/${cleanSlug}/${cleanSrc}`;
}
