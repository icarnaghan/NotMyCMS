import ContentLayout from "@cloudscape-design/components/content-layout";
import Header from "@cloudscape-design/components/header";
import Cards from "@cloudscape-design/components/cards";
import TextFilter from "@cloudscape-design/components/text-filter";
import Badge from "@cloudscape-design/components/badge";
import Box from "@cloudscape-design/components/box";
import Spinner from "@cloudscape-design/components/spinner";
import type { TaxonomyEntry, TaxonomyView } from "../../types";

/** Categories and tags share one layout; they differ in density and in what a card shows. */
export function TaxonomyPage({
  kind,
  title,
  status,
  entries,
  filterText,
  onFilterChange,
  open,
}: TaxonomyView) {
  if (status === "loading") {
    return (
      <ContentLayout>
        <Spinner size="large" />
      </ContentLayout>
    );
  }
  const isCategories = kind === "categories";
  return (
    <ContentLayout
      header={
        <Header variant="h1" counter={`(${entries.length})`}>
          {title}
        </Header>
      }
    >
      <Cards
        cardDefinition={{
          header: (item: TaxonomyEntry) => (
            <Box>
              <span style={{ cursor: "pointer" }} onClick={() => open(item)}>
                <Badge color="blue">{item.label}</Badge>
              </span>
            </Box>
          ),
          sections: [
            ...(isCategories
              ? [
                  {
                    id: "description",
                    content: (item: TaxonomyEntry) => (
                      <Box color="text-body-secondary" fontSize="body-s">
                        {item.description ?? ""}
                      </Box>
                    ),
                  },
                ]
              : []),
            {
              id: "count",
              content: (item: TaxonomyEntry) => (
                <Box color="text-body-secondary" fontSize="body-s">
                  {item.count} {item.count === 1 ? "post" : "posts"}
                </Box>
              ),
            },
          ],
        }}
        items={entries}
        cardsPerRow={
          isCategories
            ? [
                { cards: 1 },
                { minWidth: 400, cards: 2 },
                { minWidth: 700, cards: 3 },
                { minWidth: 1000, cards: 4 },
              ]
            : [
                { cards: 2 },
                { minWidth: 400, cards: 3 },
                { minWidth: 700, cards: 4 },
                { minWidth: 1000, cards: 6 },
              ]
        }
        filter={
          <TextFilter
            filteringText={filterText}
            filteringPlaceholder={isCategories ? "Search categories" : "Search tags"}
            onChange={({ detail }) => onFilterChange(detail.filteringText)}
          />
        }
      />
    </ContentLayout>
  );
}
