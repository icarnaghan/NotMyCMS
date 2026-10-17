import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import Cards from "@cloudscape-design/components/cards";
import Header from "@cloudscape-design/components/header";
import Link from "@cloudscape-design/components/link";
import Box from "@cloudscape-design/components/box";
import Badge from "@cloudscape-design/components/badge";
import SpaceBetween from "@cloudscape-design/components/space-between";
import { fetchManifest, toDisplayLabel, formatDate, type PostMeta } from "../lib/content";

interface RelatedPostsProps {
  currentSlug: string;
  tags: string[];
  categories: string;
  basePath: "posts" | "knowledge-base" | "pages";
}

/**
 * Shows up to 4 related posts based on shared tags and categories.
 * Each shared tag scores 2 points, each shared category scores 1 point.
 * Only renders if at least one related post is found.
 */
export function RelatedPosts({ currentSlug, tags, categories, basePath }: RelatedPostsProps) {
  const navigate = useNavigate();
  const [allPosts, setAllPosts] = useState<PostMeta[]>([]);

  useEffect(() => {
    // `pages` has no manifest — they are standalone hierarchical pages, not a
    // browsable collection — so there is nothing to compute related items from.
    if (basePath === "pages") return;
    fetchManifest(basePath).then(setAllPosts);
  }, [basePath]);

  const related = useMemo(() => {
    if (allPosts.length === 0 || (tags.length === 0 && !categories)) return [];

    const currentTags = new Set(tags.map((t) => t.toLowerCase()));
    const currentCats = new Set(
      categories ? categories.split(", ").map((c) => c.toLowerCase()) : []
    );

    return allPosts
      .filter((p) => p.slug !== currentSlug)
      .map((post) => {
        let score = 0;
        const postTags = (post.tags || []).map((t) => t.toLowerCase());
        const postCats = (post.categories || "").split(", ").map((c) => c.toLowerCase());
        postTags.forEach((t) => {
          if (currentTags.has(t)) score += 2;
        });
        postCats.forEach((c) => {
          if (c && currentCats.has(c)) score += 1;
        });
        return { post, score };
      })
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 4)
      .map((r) => r.post);
  }, [allPosts, currentSlug, tags, categories]);

  if (related.length === 0) return null;

  const urlPrefix = basePath === "posts" ? "/" : "/knowledge-base/";

  return (
    <Box padding={{ top: "xl" }}>
      <Cards
        header={<Header variant="h2">Related Posts</Header>}
        cardDefinition={{
          header: (item) => (
            <Link
              fontSize="heading-s"
              onFollow={(e) => {
                e.preventDefault();
                navigate(`${urlPrefix}${item.slug}`);
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
              id: "tags",
              content: (item) => {
                const t = item.tags || [];
                if (t.length === 0) return null;
                return (
                  <SpaceBetween size="xs" direction="horizontal">
                    {t.slice(0, 3).map((tag) => (
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
        items={related}
        cardsPerRow={[{ cards: 1 }, { minWidth: 400, cards: 2 }, { minWidth: 800, cards: 4 }]}
      />
    </Box>
  );
}
