/** The knowledge-base list. Builds the view model and hands it to the active theme. */
import { useNavigate } from "react-router-dom";
import activeTheme from "@theme";
import { useDocumentTitle } from "../../lib/use-document-title";
import { useKnowledgeBaseList } from "../content-list";
import { toContentItem } from "../content-item";
import { useManifest } from "../use-manifest";

export function KnowledgeBaseRoute() {
  useDocumentTitle("Knowledge Base");
  const navigate = useNavigate();
  const { items, loading, empty } = useManifest("knowledge-base");
  const list = useKnowledgeBaseList(items);
  const View = activeTheme.pages.KnowledgeBase;
  return (
    <View
      kind="knowledge-base"
      title="Knowledge Base"
      status={loading ? "loading" : empty ? "error" : "ready"}
      items={list.pageItems.map((p) => toContentItem(p, "knowledge-base"))}
      filteredCount={list.filteredCount}
      totalCount={items.length}
      filter={{ text: list.filterText, onTextChange: list.setFilterText }}
      pagination={{ page: list.page, pageCount: list.pageCount, onPageChange: list.setPage }}
      open={(item) => navigate(item.href)}
    />
  );
}
