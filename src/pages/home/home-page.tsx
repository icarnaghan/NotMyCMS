import ContentLayout from "@cloudscape-design/components/content-layout";
import Box from "@cloudscape-design/components/box";
import SpaceBetween from "@cloudscape-design/components/space-between";
import Link from "@cloudscape-design/components/link";
import Button from "@cloudscape-design/components/button";
import Cards from "@cloudscape-design/components/cards";
import Header from "@cloudscape-design/components/header";
import Badge from "@cloudscape-design/components/badge";
import { useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { fetchManifest, formatDate, toDisplayLabel, type PostMeta } from "../../lib/content";
import { SOCIAL_LINKS } from "../../lib/social-links";
import { siteConfig } from "../../lib/site-config";

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

import { useDocumentTitle } from "../../lib/use-document-title";

export function HomePage() {
  useDocumentTitle();
  const navigate = useNavigate();
  const [recentPosts, setRecentPosts] = useState<PostMeta[]>([]);

  useEffect(() => {
    fetchManifest("posts").then((posts) => setRecentPosts(posts.slice(0, 6)));
  }, []);

  return (
    <ContentLayout>
      <SpaceBetween size="xl">
        <div style={{ textAlign: "center", maxWidth: 600, margin: "0 auto" }}>
          <SpaceBetween size="l">
            {siteConfig.author.avatar && (
              <img
                src={siteConfig.author.avatar}
                alt={siteConfig.author.name}
                style={{ width: 120, height: 120, borderRadius: "50%" }}
              />
            )}
            <Box variant="h1" textAlign="center">
              {siteConfig.author.name}
            </Box>
            <Box color="text-body-secondary">
              Software developer and online educator. I like to tinker with code, break things, and
              try to keep up with the ever-changing world of web development, DevOps, cloud, AI, and
              other tech fields. This site is a mix of articles, tutorials, lessons learned, and the
              occasional academic paper or random notes I've compiled over the years.
            </Box>
            <div style={{ display: "flex", justifyContent: "center" }}>
              <SpaceBetween size="s" direction="horizontal">
                {SOCIAL_LINKS.map((link) =>
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
                <Button variant="primary" onClick={() => navigate("/posts")}>
                  Blog Posts
                </Button>
                <Button onClick={() => navigate("/knowledge-base")}>Knowledge Base</Button>
              </SpaceBetween>
            </div>
          </SpaceBetween>
        </div>
        {recentPosts.length > 0 && (
          <SpaceBetween size="l">
            <Cards
              header={<Header variant="h2">Recent Posts</Header>}
              cardDefinition={{
                header: (item) => (
                  <Link
                    fontSize="heading-m"
                    onFollow={(e) => {
                      e.preventDefault();
                      navigate(`/${item.slug}`);
                    }}
                  >
                    {item.title}
                  </Link>
                ),
                sections: [
                  {
                    id: "date",
                    content: (item) => (
                      <Box color="text-body-secondary" fontSize="body-s">
                        {item.date ? formatDate(item.date) : ""}
                      </Box>
                    ),
                  },
                  {
                    id: "description",
                    content: (item) => (
                      <Box color="text-body-secondary">
                        {item.description || item.excerpt || ""}
                      </Box>
                    ),
                  },
                  {
                    id: "tags",
                    content: (item) => {
                      const tags = item.tags || [];
                      if (tags.length === 0) return null;
                      return (
                        <SpaceBetween size="xs" direction="horizontal">
                          {tags.map((tag) => (
                            <span className="clickable-tag" key={tag}>
                              <Link
                                variant="secondary"
                                onFollow={(e) => {
                                  e.preventDefault();
                                  navigate(`/posts?tag=${encodeURIComponent(tag)}`);
                                }}
                              >
                                <Badge color="blue">{toDisplayLabel(tag)}</Badge>
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
              <Button variant="link" onClick={() => navigate("/posts")}>
                View all posts →
              </Button>
            </Box>
          </SpaceBetween>
        )}
      </SpaceBetween>
    </ContentLayout>
  );
}
