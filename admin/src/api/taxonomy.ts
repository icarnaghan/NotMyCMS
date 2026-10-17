import type { ApiClient } from "./client";
import type { ContentItem } from "./content";

/**
 * Taxonomy types: category or tag.
 */
export type TaxonomyType = "category" | "tag";

/**
 * Represents a taxonomy item (category or tag) with its usage count.
 */
export interface TaxonomyItem {
  name: string;
  type: TaxonomyType;
  count: number;
}

/**
 * Get all taxonomy items (categories and tags) with their usage counts.
 * (Server-side; reads every content file — prefer deriveTaxonomy when the
 * content lists are already loaded/cached.)
 */
export function getTaxonomy(client: ApiClient): Promise<TaxonomyItem[]> {
  return client.get<TaxonomyItem[]>("/taxonomy");
}

/**
 * Derive taxonomy (categories/tags with usage counts) from already-loaded
 * content items. Mirrors the server-side derivation but avoids the expensive
 * all-files read by reusing the cached content lists. Pass the combined
 * posts + knowledge-base items.
 */
export function deriveTaxonomy(items: ContentItem[]): TaxonomyItem[] {
  const categoryCounts = new Map<string, number>();
  const tagCounts = new Map<string, number>();

  for (const item of items) {
    for (const category of item.categories) {
      categoryCounts.set(category, (categoryCounts.get(category) ?? 0) + 1);
    }
    for (const tag of item.tags) {
      tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
    }
  }

  const result: TaxonomyItem[] = [];
  for (const [name, count] of categoryCounts) result.push({ name, type: "category", count });
  for (const [name, count] of tagCounts) result.push({ name, type: "tag", count });
  return result.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Rename a category or tag across all content items.
 */
export function renameTaxonomy(
  client: ApiClient,
  type: TaxonomyType,
  oldName: string,
  newName: string
): Promise<void> {
  return client.put<void>("/taxonomy/rename", { type, oldName, newName });
}

/**
 * Merge a source category/tag into a target, replacing all references.
 */
export function mergeTaxonomy(
  client: ApiClient,
  type: TaxonomyType,
  source: string,
  target: string
): Promise<void> {
  return client.put<void>("/taxonomy/merge", { type, source, target });
}

/**
 * Delete a category or tag from all content items.
 */
export function deleteTaxonomy(client: ApiClient, type: TaxonomyType, name: string): Promise<void> {
  return client.delete<void>(`/taxonomy/${encodeURIComponent(name)}?type=${type}`);
}
