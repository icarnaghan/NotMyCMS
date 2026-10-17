import type { ContentItem } from "../../api/content";

/**
 * Filters a content item by checking if the search text matches
 * the item's title, categories, or tags (case-insensitive).
 *
 * Used by ContentListPage for client-side search/filter.
 */
export function filterContentItem(item: ContentItem, filteringText: string): boolean {
  const text = filteringText.toLowerCase();
  return (
    item.title.toLowerCase().includes(text) ||
    item.categories.some((c) => c.toLowerCase().includes(text)) ||
    item.tags.some((t) => t.toLowerCase().includes(text))
  );
}
