/** Turns a manifest entry into the shape every theme's lists and cards consume. */
import { formatDate, toDisplayLabel, type PostMeta } from "../lib/content";
import type { ContentItem } from "../themes/types";

/** Where each collection's items live. Posts are at the root. */
const URL_PREFIX = { posts: "/", "knowledge-base": "/knowledge-base/", pages: "/" } as const;

export function toContentItem(
  post: PostMeta,
  collection: "posts" | "knowledge-base" | "pages" = "posts"
): ContentItem {
  return {
    slug: post.slug,
    title: post.title,
    date: post.date || "",
    dateLong: post.date ? formatDate(post.date) : "",
    dateShort: post.date ? formatDate(post.date, "short") : "",
    description: post.description || undefined,
    excerpt: post.excerpt || undefined,
    categoryLabel: toDisplayLabel(post.categories || ""),
    tags: (post.tags || []).map((tag) => ({
      slug: tag,
      label: toDisplayLabel(tag),
      href: `/posts?tag=${encodeURIComponent(tag)}`,
    })),
    href: `${URL_PREFIX[collection]}${post.slug}`,
  };
}
