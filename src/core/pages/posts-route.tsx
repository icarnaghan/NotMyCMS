/** The posts list. Builds the view model and hands it to the active theme. */
import { useNavigate } from "react-router-dom";
import activeTheme from "@theme";
import { toDisplayLabel } from "../../lib/content";
import { useDocumentTitle } from "../../lib/use-document-title";
import { usePostsList } from "../content-list";
import { toContentItem } from "../content-item";
import { useManifest } from "../use-manifest";

export function PostsRoute() {
  useDocumentTitle("Blog Posts");
  const navigate = useNavigate();
  const { items, loading, empty } = useManifest("posts");
  const list = usePostsList(items);
  const View = activeTheme.pages.Posts;
  return (
    <View
      kind="posts"
      title="Posts"
      status={loading ? "loading" : empty ? "error" : "ready"}
      items={list.pageItems.map((p) => toContentItem(p))}
      filteredCount={list.filteredCount}
      totalCount={items.length}
      filter={{
        text: list.filterText,
        onTextChange: list.setFilterText,
        category: {
          selected: list.category,
          options: list.categories.map((slug) => ({ slug, label: toDisplayLabel(slug) })),
          onChange: list.setCategory,
        },
        onTagSelect: list.selectTag,
      }}
      sort={{ ...list.sort, onChange: list.setSort }}
      pagination={{ page: list.page, pageCount: list.pageCount, onPageChange: list.setPage }}
      preferences={{
        pageSize: list.pageSize,
        visibleColumns: list.visibleColumns,
        onChange: list.setPreferences,
      }}
      open={(item) => navigate(item.href)}
    />
  );
}
