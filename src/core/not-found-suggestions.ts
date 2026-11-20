/**
 * Suggestions for a mistyped URL: the posts whose slug or title best match it.
 *
 * Headless: no UI imports. The view decides how to render the result.
 */
import { useEffect, useState } from "react";
import Fuse from "fuse.js";
import { fetchManifest, type PostMeta } from "../lib/content";

const MAX_SUGGESTIONS = 5;

/** Pure matching step, separated from the fetch so it can be tested directly. */
export function suggestPosts(posts: PostMeta[], slug: string): PostMeta[] {
  const fuse = new Fuse(posts, { keys: ["slug", "title"], threshold: 0.4 });
  return fuse.search(slug, { limit: MAX_SUGGESTIONS }).map((r) => r.item);
}

/** Loads the posts manifest and returns suggestions for `slug` (none when it is empty). */
export function useNotFoundSuggestions(slug?: string): PostMeta[] {
  const [suggestions, setSuggestions] = useState<PostMeta[]>([]);
  useEffect(() => {
    if (!slug) return;
    fetchManifest("posts").then((posts) => setSuggestions(suggestPosts(posts, slug)));
  }, [slug]);
  return suggestions;
}
