import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import ContentLayout from "@cloudscape-design/components/content-layout";
import Header from "@cloudscape-design/components/header";
import Box from "@cloudscape-design/components/box";
import Button from "@cloudscape-design/components/button";
import SpaceBetween from "@cloudscape-design/components/space-between";
import Link from "@cloudscape-design/components/link";
import Fuse from "fuse.js";
import { fetchManifest, type PostMeta } from "../../lib/content";

interface NotFoundPageProps {
  slug?: string;
}

import { useDocumentTitle } from "../../lib/use-document-title";

export function NotFoundPage({ slug }: NotFoundPageProps) {
  useDocumentTitle("Page Not Found");
  const navigate = useNavigate();
  const [suggestions, setSuggestions] = useState<PostMeta[]>([]);

  useEffect(() => {
    if (!slug) return;
    fetchManifest("posts").then((posts) => {
      const fuse = new Fuse(posts, {
        keys: ["slug", "title"],
        threshold: 0.4,
      });
      setSuggestions(fuse.search(slug, { limit: 5 }).map((r) => r.item));
    });
  }, [slug]);

  return (
    <ContentLayout header={<Header variant="h1">404 — Page Not Found</Header>}>
      <SpaceBetween size="l">
        <Box variant="p" color="text-body-secondary">
          The page you're looking for doesn't exist.
        </Box>

        {suggestions.length > 0 && (
          <SpaceBetween size="xs">
            <Box variant="h3">Did you mean?</Box>
            {suggestions.map((post) => (
              <Link
                key={post.slug}
                fontSize="heading-s"
                onFollow={(e) => {
                  e.preventDefault();
                  navigate(`/${post.slug}`);
                }}
              >
                {post.title}
              </Link>
            ))}
          </SpaceBetween>
        )}

        <Button variant="primary" onClick={() => navigate("/")}>
          Go Home
        </Button>
      </SpaceBetween>
    </ContentLayout>
  );
}
