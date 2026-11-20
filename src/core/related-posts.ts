/** Related-content selection. Headless. */
import { useEffect, useMemo, useState } from "react";
import { fetchManifest, type PostMeta } from "../lib/content";

const MAX_RELATED = 4;
const POINTS_PER_SHARED_TAG = 2;
const POINTS_PER_SHARED_CATEGORY = 1;

export interface RelatedQuery {
  slug: string;
  tags: string[];
  categories: string;
}

/**
 * Up to four items that share tags or categories with the current one. Each shared tag
 * scores 2 and each shared category 1; items scoring 0 are dropped, ties keep manifest
 * order. Comparison is case-insensitive.
 */
export function selectRelated(all: PostMeta[], current: RelatedQuery): PostMeta[] {
  const { slug, tags, categories } = current;
  if (all.length === 0 || (tags.length === 0 && !categories)) return [];
  const currentTags = new Set(tags.map((t) => t.toLowerCase()));
  const currentCats = new Set(categories ? categories.split(", ").map((c) => c.toLowerCase()) : []);
  return all
    .filter((p) => p.slug !== slug)
    .map((post) => {
      let score = 0;
      (post.tags || []).forEach((t) => {
        if (currentTags.has(t.toLowerCase())) score += POINTS_PER_SHARED_TAG;
      });
      (post.categories || "").split(", ").forEach((c) => {
        const lower = c.toLowerCase();
        if (lower && currentCats.has(lower)) score += POINTS_PER_SHARED_CATEGORY;
      });
      return { post, score };
    })
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_RELATED)
    .map((r) => r.post);
}

/** Loads the collection's manifest and selects related items. `pages` has no manifest. */
export function useRelatedPosts(
  basePath: "posts" | "knowledge-base" | "pages",
  current: RelatedQuery
): PostMeta[] {
  const [all, setAll] = useState<PostMeta[]>([]);
  useEffect(() => {
    // `pages` are standalone hierarchical pages, not a browsable collection, so there is
    // nothing to compute related items from.
    if (basePath === "pages") return;
    fetchManifest(basePath).then(setAll);
  }, [basePath]);
  const { slug, tags, categories } = current;
  // Callers pass a fresh `tags` array each render, so key the memo on its contents.
  const tagKey = tags.join("\u0000");
  return useMemo(
    () => selectRelated(all, { slug, tags: tagKey ? tagKey.split("\u0000") : [], categories }),
    [all, slug, tagKey, categories]
  );
}
