/**
 * Headless logic for the posts and knowledge-base lists: counting, filtering, sorting,
 * paging, and the URL state that makes the back button restore a page.
 *
 * Behavior here is shared by every theme. A theme decides how a list looks, not what
 * matches a filter or which page a URL points at.
 */
import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import type { PostMeta } from "../lib/content";
import type { PostsColumnId } from "../themes/types";

/** Category names ordered by how many items use them, most first, limited to `limit`. */
export function topCategories(items: PostMeta[], limit = 8): string[] {
  const counts: Record<string, number> = {};
  items.forEach((item) => {
    if (item.categories) {
      item.categories.split(", ").forEach((c) => {
        counts[c] = (counts[c] || 0) + 1;
      });
    }
  });
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([name]) => name);
}

/**
 * Posts filter: an optional category (substring match on the category field), then free
 * text over title, categories, description and tags. Case-insensitive.
 */
export function filterPosts(
  items: PostMeta[],
  filterText: string,
  category: string | null
): PostMeta[] {
  let result = items;
  if (category) {
    result = result.filter((item) =>
      (item.categories || "").toLowerCase().includes(category.toLowerCase())
    );
  }
  if (!filterText) return result;
  const lower = filterText.toLowerCase();
  return result.filter(
    (item) =>
      item.title.toLowerCase().includes(lower) ||
      String(item.categories || "")
        .toLowerCase()
        .includes(lower) ||
      String(item.description || "")
        .toLowerCase()
        .includes(lower) ||
      (item.tags || []).some((t) => String(t).toLowerCase().includes(lower))
  );
}

/** Knowledge-base filter: title only. */
export function filterByTitle(items: PostMeta[], filterText: string): PostMeta[] {
  if (!filterText) return items;
  const lower = filterText.toLowerCase();
  return items.filter((a) => a.title.toLowerCase().includes(lower));
}

function sortValue(item: PostMeta, field: string): string {
  switch (field) {
    case "title":
      return item.title;
    case "date":
      return item.date;
    case "categories":
      return item.categories || "";
    case "tags":
      return (item.tags || []).join(", ");
    default:
      return "";
  }
}

/** A sorted copy. Strings compare with `localeCompare`; dates are ISO so they sort as text. */
export function sortItems(items: PostMeta[], field: string, descending: boolean): PostMeta[] {
  return [...items].sort((a, b) => {
    const cmp = sortValue(a, field).localeCompare(sortValue(b, field));
    return descending ? -cmp : cmp;
  });
}

export interface PageSlice<T> {
  /** The page actually shown, after clamping. */
  page: number;
  pageCount: number;
  items: T[];
}

/**
 * Slices one page. The requested page is clamped to what exists, so an out-of-range
 * `?page=` or a filter that shrinks the results cannot leave an empty page selected.
 */
export function paginate<T>(items: T[], requestedPage: number, pageSize: number): PageSlice<T> {
  const pageCount = Math.max(1, Math.ceil(items.length / pageSize));
  const page = Math.min(Math.max(1, requestedPage), pageCount);
  return { page, pageCount, items: items.slice((page - 1) * pageSize, page * pageSize) };
}

/**
 * URL-backed list state. `initialPage` and `initialTag` are read once, on mount, to seed
 * local state; `update` writes changes back with `replace` so paging does not fill the
 * history, and drops the parameter when it is empty or page 1.
 */
export function useListUrlState() {
  const [searchParams, setSearchParams] = useSearchParams();
  const update = (updates: Record<string, string | null>) => {
    const params = new URLSearchParams(searchParams);
    for (const [key, val] of Object.entries(updates)) {
      if (val && val !== "1") params.set(key, val);
      else params.delete(key);
    }
    setSearchParams(params, { replace: true });
  };
  return {
    initialPage: Number(searchParams.get("page")) || 1,
    initialTag: searchParams.get("tag") || "",
    update,
  };
}

export const POSTS_DEFAULT_COLUMNS: PostsColumnId[] = ["title", "date", "categories", "tags"];
const POSTS_DEFAULT_PAGE_SIZE = 20;
export const KNOWLEDGE_BASE_PAGE_SIZE = 24;

/**
 * State for the posts list: text and category filters, sort order, page size, visible
 * columns, and the page, with the page and tag mirrored to the URL. Any change to the
 * filters, sort or preferences returns to page 1, as the list always has.
 */
export function usePostsList(items: PostMeta[]) {
  const { initialPage, initialTag, update } = useListUrlState();
  const [page, setPage] = useState(initialPage);
  const [pageSize, setPageSize] = useState(POSTS_DEFAULT_PAGE_SIZE);
  const [visibleColumns, setVisibleColumns] = useState<PostsColumnId[]>(POSTS_DEFAULT_COLUMNS);
  const [sort, setSort] = useState({ field: "date", descending: true });
  const [filterText, setFilterText] = useState(initialTag);
  const [category, setCategory] = useState<string | null>(null);

  const categories = useMemo(() => topCategories(items), [items]);
  const filtered = useMemo(
    () => filterPosts(items, filterText, category),
    [items, filterText, category]
  );
  const sorted = useMemo(() => sortItems(filtered, sort.field, sort.descending), [filtered, sort]);
  const slice = paginate(sorted, page, pageSize);

  return {
    categories,
    filteredCount: filtered.length,
    page: slice.page,
    pageCount: slice.pageCount,
    pageItems: slice.items,
    filterText,
    category,
    sort,
    pageSize,
    visibleColumns,
    setFilterText: (text: string) => {
      setFilterText(text);
      setPage(1);
    },
    setCategory: (slug: string | null) => {
      setCategory(slug);
      setPage(1);
    },
    setSort: (field: string, descending: boolean) => {
      setSort({ field, descending });
      setPage(1);
    },
    setPage: (next: number) => {
      setPage(next);
      update({ page: String(next) });
    },
    selectTag: (tag: string) => {
      setFilterText(tag);
      update({ tag, page: null });
      setPage(1);
    },
    setPreferences: (next: { pageSize: number; visibleColumns: PostsColumnId[] }) => {
      setPageSize(next.pageSize);
      setVisibleColumns(next.visibleColumns);
      setPage(1);
    },
  };
}

/** State for the knowledge-base list: a title filter and a URL-backed page. */
export function useKnowledgeBaseList(items: PostMeta[]) {
  const { initialPage, update } = useListUrlState();
  const [page, setPage] = useState(initialPage);
  const [filterText, setFilterText] = useState("");
  const filtered = useMemo(() => filterByTitle(items, filterText), [items, filterText]);
  const slice = paginate(filtered, page, KNOWLEDGE_BASE_PAGE_SIZE);
  return {
    filteredCount: filtered.length,
    page: slice.page,
    pageCount: slice.pageCount,
    pageItems: slice.items,
    filterText,
    setFilterText: (text: string) => {
      setFilterText(text);
      setPage(1);
    },
    setPage: (next: number) => {
      setPage(next);
      update({ page: String(next) });
    },
  };
}
