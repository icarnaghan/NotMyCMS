/**
 * Site search: loads the build-time index and matches a query against it.
 * Headless. The modal, its focus handling and its markup belong to the theme.
 */
import { useEffect, useMemo, useState } from "react";
import Fuse from "fuse.js";

export interface SearchItem {
  slug: string;
  basePath: string;
  title: string;
  excerpt: string;
  categories: string;
  tags: string[];
}

/** Queries shorter than this return nothing. */
export const MIN_QUERY_LENGTH = 2;
const MAX_RESULTS = 20;

/**
 * Builds the matcher once per index. Building a Fuse index is the expensive step, so
 * callers should keep the returned function and call it per keystroke.
 */
export function createSearcher(items: SearchItem[]): (query: string) => SearchItem[] {
  const fuse = new Fuse(items, {
    keys: ["title", "excerpt", "categories", "tags"],
    threshold: 0.4,
  });
  return (query) =>
    query.length < MIN_QUERY_LENGTH
      ? []
      : fuse.search(query, { limit: MAX_RESULTS }).map((r) => r.item);
}

/** Where a result lives. Posts are at the root; everything else is a knowledge-base article. */
export function resultUrl(item: Pick<SearchItem, "basePath" | "slug">): string {
  return item.basePath === "posts" ? `/${item.slug}` : `/knowledge-base/${item.slug}`;
}

/** Text for a polite live region announcing the result count. */
export function resultsAnnouncement(count: number): string {
  return count === 0 ? "No results found" : `${count} result${count === 1 ? "" : "s"} found`;
}

/**
 * Search state. The index is fetched the first time `visible` becomes true, and not again
 * once it has loaded. A failed fetch leaves the index empty, so search finds nothing
 * rather than breaking the page.
 */
export function useSearch(visible: boolean) {
  const [items, setItems] = useState<SearchItem[]>([]);
  const [query, setQuery] = useState("");
  useEffect(() => {
    if (visible && items.length === 0) {
      fetch("/search-index.json")
        .then((r) => r.json())
        .then(setItems)
        .catch(() => {});
    }
  }, [visible, items.length]);
  const searcher = useMemo(() => createSearcher(items), [items]);
  const results = useMemo(() => searcher(query), [searcher, query]);
  return {
    query,
    setQuery,
    results,
    announcement: query.length >= MIN_QUERY_LENGTH ? resultsAnnouncement(results.length) : "",
    reset: () => setQuery(""),
  };
}
