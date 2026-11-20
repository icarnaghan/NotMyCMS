import ContentLayout from "@cloudscape-design/components/content-layout";
import Box from "@cloudscape-design/components/box";
import SpaceBetween from "@cloudscape-design/components/space-between";
import Link from "@cloudscape-design/components/link";
import Button from "@cloudscape-design/components/button";
import Cards from "@cloudscape-design/components/cards";
import Header from "@cloudscape-design/components/header";
import Badge from "@cloudscape-design/components/badge";
import type { ContentItem, HomeView } from "../../types";

function SocialIcon({
  href,
  label,
  path,
  fill,
}: {
  href: string;
  label: string;
  path: string;
  fill?: boolean;
}) {
  return (
    <Link href={href} external variant="secondary" ariaLabel={label}>
      <svg
        viewBox="0 0 24 24"
        width="20"
        height="20"
        fill={fill ? "currentColor" : "none"}
        stroke={fill ? "none" : "currentColor"}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        role="img"
        aria-hidden="true"
      >
        <path d={path} />
      </svg>
    </Link>
  );
}

export function HomePage({ name, avatar, intro, social, recentPosts, goTo }: HomeView) {
  return (
    <ContentLayout>
      <SpaceBetween size="xl">
        <div style={{ textAlign: "center", maxWidth: 600, margin: "0 auto" }}>
          <SpaceBetween size="l">
            {avatar && (
              <img
                src={avatar}
                alt={name}
                style={{ width: 120, height: 120, borderRadius: "50%" }}
              />
            )}
            <Box variant="h1" textAlign="center">
              {name}
            </Box>
            {intro && <Box color="text-body-secondary">{intro}</Box>}
            <div style={{ display: "flex", justifyContent: "center" }}>
              <SpaceBetween size="s" direction="horizontal">
                {social.map((link) =>
                  link.path ? (
                    <SocialIcon
                      key={link.id}
                      href={link.href}
                      label={link.label}
                      path={link.path}
                      fill={link.fill}
                    />
                  ) : null
                )}
              </SpaceBetween>
            </div>
            <div style={{ display: "flex", justifyContent: "center" }}>
              <SpaceBetween size="xs" direction="horizontal">
                <Button variant="primary" onClick={() => goTo("/posts")}>
                  Blog Posts
                </Button>
                <Button onClick={() => goTo("/knowledge-base")}>Knowledge Base</Button>
              </SpaceBetween>
            </div>
          </SpaceBetween>
        </div>
        {recentPosts.length > 0 && (
          <SpaceBetween size="l">
            <Cards
              header={<Header variant="h2">Recent Posts</Header>}
              cardDefinition={{
                header: (item: ContentItem) => (
                  <Link
                    fontSize="heading-m"
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
                    id: "description",
                    content: (item: ContentItem) => (
                      <Box color="text-body-secondary">
                        {item.description || item.excerpt || ""}
                      </Box>
                    ),
                  },
                  {
                    id: "tags",
                    content: (item: ContentItem) => {
                      const tags = item.tags;
                      if (tags.length === 0) return null;
                      return (
                        <SpaceBetween size="xs" direction="horizontal">
                          {tags.map((tag) => (
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
              items={recentPosts}
              cardsPerRow={[{ cards: 1 }, { minWidth: 500, cards: 2 }, { minWidth: 900, cards: 3 }]}
            />
            <Box textAlign="center">
              <Button variant="link" onClick={() => goTo("/posts")}>
                View all posts →
              </Button>
            </Box>
          </SpaceBetween>
        )}
      </SpaceBetween>
    </ContentLayout>
  );
}
