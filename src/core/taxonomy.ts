/** Category and tag counts for the taxonomy pages. Headless. */
import type { PostMeta } from "../lib/content";

export interface TaxonomyCount {
  name: string;
  count: number;
}

function toSortedCounts(counts: Record<string, number>): TaxonomyCount[] {
  return Object.entries(counts)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);
}

export function countCategories(posts: PostMeta[]): TaxonomyCount[] {
  const counts: Record<string, number> = {};
  posts.forEach((p) => {
    String(p.categories || "")
      .split(", ")
      .filter(Boolean)
      .forEach((c) => {
        counts[c] = (counts[c] || 0) + 1;
      });
  });
  return toSortedCounts(counts);
}

export function countTags(posts: PostMeta[]): TaxonomyCount[] {
  const counts: Record<string, number> = {};
  posts.forEach((p) => {
    (p.tags || []).forEach((t) => {
      counts[String(t)] = (counts[String(t)] || 0) + 1;
    });
  });
  return toSortedCounts(counts);
}

/** Case-insensitive substring filter on the name. */
export function filterTaxonomy(entries: TaxonomyCount[], text: string): TaxonomyCount[] {
  if (!text) return entries;
  const lower = text.toLowerCase();
  return entries.filter((e) => e.name.toLowerCase().includes(lower));
}
