import Cards from "@cloudscape-design/components/cards";
import Header from "@cloudscape-design/components/header";
import Link from "@cloudscape-design/components/link";
import Box from "@cloudscape-design/components/box";
import Badge from "@cloudscape-design/components/badge";
import SpaceBetween from "@cloudscape-design/components/space-between";
import type { ContentItem } from "../../types";

/** Related items for an article. Renders nothing when there are none. */
export function RelatedPosts({
  items,
  goTo,
}: {
  items: ContentItem[];
  goTo: (path: string) => void;
}) {
  if (items.length === 0) return null;
  return (
    <Box padding={{ top: "xl" }}>
      <Cards
        header={<Header variant="h2">Related Posts</Header>}
        cardDefinition={{
          header: (item: ContentItem) => (
            <Link
              fontSize="heading-s"
              onFollow={(e) => {
                e.preventDefault();
                goTo(item.href);
              }}
            >
              {item.title}
            </Link>
          ),
          sections: [
            {
              id: "date",
              content: (item: ContentItem) => (
                <Box color="text-body-secondary" fontSize="body-s">
                  {item.dateLong}
                </Box>
              ),
            },
            {
              id: "tags",
              content: (item: ContentItem) => {
                if (item.tags.length === 0) return null;
                return (
                  <SpaceBetween size="xs" direction="horizontal">
                    {item.tags.slice(0, 3).map((tag) => (
                      <span className="clickable-tag" key={tag.slug}>
                        <Link
                          variant="secondary"
                          onFollow={(e) => {
                            e.preventDefault();
                            goTo(tag.href);
                          }}
                        >
                          <Badge color="blue">{tag.label}</Badge>
                        </Link>
                      </span>
                    ))}
                  </SpaceBetween>
                );
              },
            },
          ],
        }}
        items={items}
        cardsPerRow={[{ cards: 1 }, { minWidth: 400, cards: 2 }, { minWidth: 800, cards: 4 }]}
      />
    </Box>
  );
}
