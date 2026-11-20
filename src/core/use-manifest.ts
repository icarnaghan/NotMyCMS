import { useEffect, useState } from "react";
import { fetchManifest, type PostMeta } from "../lib/content";

export interface ManifestState {
  items: PostMeta[];
  loading: boolean;
  /** True when the load produced nothing, which the list pages report as a failure. */
  empty: boolean;
}

/** Loads a content manifest once. `fetchManifest` returns [] on failure, hence `empty`. */
export function useManifest(basePath: "posts" | "knowledge-base" | "pages"): ManifestState {
  const [items, setItems] = useState<PostMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [empty, setEmpty] = useState(false);
  useEffect(() => {
    fetchManifest(basePath)
      .then((data) => {
        if (data.length === 0) setEmpty(true);
        setItems(data);
      })
      .finally(() => setLoading(false));
  }, [basePath]);
  return { items, loading, empty };
}
