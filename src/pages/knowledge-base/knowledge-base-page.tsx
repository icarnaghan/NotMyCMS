import { useEffect, useState, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import ContentLayout from "@cloudscape-design/components/content-layout";
import Header from "@cloudscape-design/components/header";
import Cards from "@cloudscape-design/components/cards";
import TextFilter from "@cloudscape-design/components/text-filter";
import Pagination from "@cloudscape-design/components/pagination";
import Link from "@cloudscape-design/components/link";
import Box from "@cloudscape-design/components/box";
import Spinner from "@cloudscape-design/components/spinner";
import { fetchManifest, type PostMeta } from "../../lib/content";
import { useDocumentTitle } from "../../lib/use-document-title";

export function KnowledgeBasePage() {
  useDocumentTitle("Knowledge Base");
  const navigate = useNavigate();
  const [articles, setArticles] = useState<PostMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();
  const [filterText, setFilterText] = useState("");
  const [currentPage, setCurrentPage] = useState(Number(searchParams.get("page")) || 1);
  const pageSize = 24;

  useEffect(() => {
    fetchManifest("knowledge-base")
      .then((data) => {
        if (data.length === 0) setError(true);
        setArticles(data);
      })
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    if (!filterText) return articles;
    const lower = filterText.toLowerCase();
    return articles.filter((a) => a.title.toLowerCase().includes(lower));
  }, [articles, filterText]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  // Clamp against available pages so an out-of-range ?page= or a filter that
  // shrinks the results can't slice past the end and show an empty grid.
  const effectivePage = Math.min(Math.max(1, currentPage), totalPages);
  const paginated = filtered.slice((effectivePage - 1) * pageSize, effectivePage * pageSize);

  if (loading) {
    return (
      <ContentLayout>
        <Spinner size="large" />
      </ContentLayout>
    );
  }

  if (error) {
    return (
      <Box textAlign="center" padding="xxl" color="text-status-error">
        Failed to load articles. Please try again later.
      </Box>
    );
  }

  return (
    <ContentLayout
      header={
        <Header
          variant="h1"
          counter={`(${filtered.length}${filtered.length !== articles.length ? `/${articles.length}` : ""})`}
        >
          Knowledge Base
        </Header>
      }
    >
      <Cards
        cardDefinition={{
          header: (item) => (
            <Link
              fontSize="heading-s"
              onFollow={(e) => {
                e.preventDefault();
                navigate(`/knowledge-base/${item.slug}`);
              }}
            >
              {item.title}
            </Link>
          ),
          sections: [
            {
              id: "excerpt",
              content: (item) => (
                <Box color="text-body-secondary" fontSize="body-s">
                  {item.excerpt || ""}
                </Box>
              ),
            },
          ],
        }}
        items={paginated}
        loading={loading}
        loadingText="Loading articles"
        empty={
          <Box textAlign="center">{filterText ? "No matches found" : "No articles found"}</Box>
        }
        cardsPerRow={[
          { cards: 1 },
          { minWidth: 400, cards: 2 },
          { minWidth: 700, cards: 3 },
          { minWidth: 1000, cards: 4 },
        ]}
        filter={
          <TextFilter
            filteringText={filterText}
            filteringPlaceholder="Search knowledge base"
            onChange={({ detail }) => {
              setFilterText(detail.filteringText);
              setCurrentPage(1);
            }}
          />
        }
        pagination={
          <Pagination
            currentPageIndex={effectivePage}
            pagesCount={totalPages}
            onChange={({ detail }) => {
              setCurrentPage(detail.currentPageIndex);
              const params = new URLSearchParams(searchParams);
              if (detail.currentPageIndex > 1) params.set("page", String(detail.currentPageIndex));
              else params.delete("page");
              setSearchParams(params, { replace: true });
            }}
          />
        }
      />
    </ContentLayout>
  );
}
