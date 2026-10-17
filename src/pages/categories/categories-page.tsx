import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import ContentLayout from "@cloudscape-design/components/content-layout";
import Header from "@cloudscape-design/components/header";
import Cards from "@cloudscape-design/components/cards";
import TextFilter from "@cloudscape-design/components/text-filter";
import Badge from "@cloudscape-design/components/badge";
import Box from "@cloudscape-design/components/box";
import Spinner from "@cloudscape-design/components/spinner";
import { fetchManifest, toDisplayLabel, type PostMeta } from "../../lib/content";
import { useDocumentTitle } from "../../lib/use-document-title";

const CATEGORY_DESCRIPTIONS: Record<string, string> = {
  blogging: "Tips, strategies, and lessons learned from running a blog.",
  business: "Business strategy, freelancing, and professional development.",
  cms: "Content management systems including WordPress, Drupal, and Joomla.",
  coding: "Programming tutorials, code snippets, and software development topics.",
  cybersecurity: "Security concepts, threats, vulnerabilities, and best practices.",
  "data-analytics": "Data analysis, reporting, and visualization techniques.",
  "digital-media": "Digital content creation, social media, and online publishing.",
  gaming: "Video game reviews, previews, and gaming industry topics.",
  hosting: "Web hosting reviews, comparisons, and server management.",
  "internet-marketing": "SEO, affiliate marketing, advertising, and online growth strategies.",
  "language-learning": "Resources and experiences with learning new languages.",
  "ux-design": "User experience, usability testing, and interface design.",
};

interface CategoryItem {
  name: string;
  count: number;
}

export function CategoriesPage() {
  useDocumentTitle("Categories");
  const navigate = useNavigate();
  const [posts, setPosts] = useState<PostMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterText, setFilterText] = useState("");

  useEffect(() => {
    fetchManifest("posts")
      .then(setPosts)
      .finally(() => setLoading(false));
  }, []);

  const categories = useMemo(() => {
    const counts: Record<string, number> = {};
    posts.forEach((p) => {
      const cats = String(p.categories || "")
        .split(", ")
        .filter(Boolean);
      cats.forEach((c) => {
        counts[c] = (counts[c] || 0) + 1;
      });
    });
    return Object.entries(counts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
  }, [posts]);

  const filtered = useMemo(() => {
    if (!filterText) return categories;
    const lower = filterText.toLowerCase();
    return categories.filter((c) => c.name.toLowerCase().includes(lower));
  }, [categories, filterText]);

  if (loading) {
    return (
      <ContentLayout>
        <Spinner size="large" />
      </ContentLayout>
    );
  }

  return (
    <ContentLayout
      header={
        <Header variant="h1" counter={`(${filtered.length})`}>
          Categories
        </Header>
      }
    >
      <Cards
        cardDefinition={{
          header: (item: CategoryItem) => (
            <Box>
              <span
                style={{ cursor: "pointer" }}
                onClick={() => navigate(`/posts?tag=${encodeURIComponent(item.name)}`)}
              >
                <Badge color="blue">{toDisplayLabel(item.name)}</Badge>
              </span>
            </Box>
          ),
          sections: [
            {
              id: "description",
              content: (item: CategoryItem) => (
                <Box color="text-body-secondary" fontSize="body-s">
                  {CATEGORY_DESCRIPTIONS[item.name] || ""}
                </Box>
              ),
            },
            {
              id: "count",
              content: (item: CategoryItem) => (
                <Box color="text-body-secondary" fontSize="body-s">
                  {item.count} {item.count === 1 ? "post" : "posts"}
                </Box>
              ),
            },
          ],
        }}
        items={filtered}
        cardsPerRow={[
          { cards: 1 },
          { minWidth: 400, cards: 2 },
          { minWidth: 700, cards: 3 },
          { minWidth: 1000, cards: 4 },
        ]}
        filter={
          <TextFilter
            filteringText={filterText}
            filteringPlaceholder="Search categories"
            onChange={({ detail }) => setFilterText(detail.filteringText)}
          />
        }
      />
    </ContentLayout>
  );
}
