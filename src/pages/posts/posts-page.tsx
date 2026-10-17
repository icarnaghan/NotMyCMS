import { useEffect, useState } from "react";
import { fetchManifest, type PostMeta } from "../../lib/content";
import { ContentList } from "../../components/content-list";
import Box from "@cloudscape-design/components/box";

import { useDocumentTitle } from "../../lib/use-document-title";

export function PostsPage() {
  useDocumentTitle("Blog Posts");
  const [posts, setPosts] = useState<PostMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetchManifest("posts")
      .then((data) => {
        if (data.length === 0) setError(true);
        setPosts(data);
      })
      .finally(() => setLoading(false));
  }, []);

  if (!loading && error) {
    return (
      <Box textAlign="center" padding="xxl" color="text-status-error">
        Failed to load posts. Please try again later.
      </Box>
    );
  }

  return <ContentList title="Posts" items={posts} loading={loading} baseUrl="/" />;
}
