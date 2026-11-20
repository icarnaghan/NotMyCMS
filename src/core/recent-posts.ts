import { useEffect, useState } from "react";
import { fetchManifest, type PostMeta } from "../lib/content";

/** The first `count` entries of a manifest. The build writes manifests newest first. */
export function takeRecent(posts: PostMeta[], count: number): PostMeta[] {
  return posts.slice(0, count);
}

/** The newest posts for the home page. Empty until the manifest loads, and on failure. */
export function useRecentPosts(count = 6): PostMeta[] {
  const [recent, setRecent] = useState<PostMeta[]>([]);
  useEffect(() => {
    fetchManifest("posts").then((posts) => setRecent(takeRecent(posts, count)));
  }, [count]);
  return recent;
}
