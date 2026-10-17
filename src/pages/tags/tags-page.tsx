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

interface TagItem {
  name: string;
  count: number;
}

export function TagsPage() {
  useDocumentTitle("Tags");
  const navigate = useNavigate();
  const [posts, setPosts] = useState<PostMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterText, setFilterText] = useState("");

  useEffect(() => {
    fetchManifest("posts")
      .then(setPosts)
      .finally(() => setLoading(false));
  }, []);

  const tags = useMemo(() => {
    const counts: Record<string, number> = {};
    posts.forEach((p) => {
      (p.tags || []).forEach((t) => {
        counts[String(t)] = (counts[String(t)] || 0) + 1;
      });
    });
    return Object.entries(counts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
  }, [posts]);

  const filtered = useMemo(() => {
    if (!filterText) return tags;
    const lower = filterText.toLowerCase();
    return tags.filter((t) => t.name.toLowerCase().includes(lower));
  }, [tags, filterText]);

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
          Tags
        </Header>
      }
    >
      <Cards
        cardDefinition={{
          header: (item: TagItem) => (
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
              id: "count",
              content: (item: TagItem) => (
                <Box color="text-body-secondary" fontSize="body-s">
                  {item.count} {item.count === 1 ? "post" : "posts"}
                </Box>
              ),
            },
          ],
        }}
        items={filtered}
        cardsPerRow={[
          { cards: 2 },
          { minWidth: 400, cards: 3 },
          { minWidth: 700, cards: 4 },
          { minWidth: 1000, cards: 6 },
        ]}
        filter={
          <TextFilter
            filteringText={filterText}
            filteringPlaceholder="Search tags"
            onChange={({ detail }) => setFilterText(detail.filteringText)}
          />
        }
      />
    </ContentLayout>
  );
}
