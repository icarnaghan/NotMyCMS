import ContentLayout from "@cloudscape-design/components/content-layout";
import Header from "@cloudscape-design/components/header";
import Cards from "@cloudscape-design/components/cards";
import TextFilter from "@cloudscape-design/components/text-filter";
import Pagination from "@cloudscape-design/components/pagination";
import Link from "@cloudscape-design/components/link";
import Box from "@cloudscape-design/components/box";
import Spinner from "@cloudscape-design/components/spinner";
import type { ContentItem, ContentListView } from "../../types";

export function KnowledgeBasePage({
  title,
  status,
  items,
  filteredCount,
  totalCount,
  filter,
  pagination,
  open,
}: ContentListView) {
  if (status === "loading") {
    return (
      <ContentLayout>
        <Spinner size="large" />
      </ContentLayout>
    );
  }
  if (status === "error") {
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
          counter={`(${filteredCount}${filteredCount !== totalCount ? `/${totalCount}` : ""})`}
        >
          {title}
        </Header>
      }
    >
      <Cards
        cardDefinition={{
          header: (item: ContentItem) => (
            <Link
              fontSize="heading-s"
              onFollow={(e) => {
                e.preventDefault();
                open(item);
              }}
            >
              {item.title}
            </Link>
          ),
          sections: [
            {
              id: "excerpt",
              content: (item: ContentItem) => (
                <Box color="text-body-secondary" fontSize="body-s">
                  {item.excerpt || ""}
                </Box>
              ),
            },
          ],
        }}
        items={items}
        loading={false}
        loadingText="Loading articles"
        empty={
          <Box textAlign="center">{filter.text ? "No matches found" : "No articles found"}</Box>
        }
        cardsPerRow={[
          { cards: 1 },
          { minWidth: 400, cards: 2 },
          { minWidth: 700, cards: 3 },
          { minWidth: 1000, cards: 4 },
        ]}
        filter={
          <TextFilter
            filteringText={filter.text}
            filteringPlaceholder="Search knowledge base"
            onChange={({ detail }) => filter.onTextChange(detail.filteringText)}
          />
        }
        pagination={
          <Pagination
            currentPageIndex={pagination.page}
            pagesCount={pagination.pageCount}
            onChange={({ detail }) => pagination.onPageChange(detail.currentPageIndex)}
          />
        }
      />
    </ContentLayout>
  );
}
