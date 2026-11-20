import ContentLayout from "@cloudscape-design/components/content-layout";
import Header from "@cloudscape-design/components/header";
import Box from "@cloudscape-design/components/box";
import Button from "@cloudscape-design/components/button";
import SpaceBetween from "@cloudscape-design/components/space-between";
import Link from "@cloudscape-design/components/link";
import type { NotFoundView } from "../../types";

export function NotFoundPage({ suggestions, goTo }: NotFoundView) {
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
                  goTo(post.href);
                }}
              >
                {post.title}
              </Link>
            ))}
          </SpaceBetween>
        )}
        <Button variant="primary" onClick={() => goTo("/")}>
          Go Home
        </Button>
      </SpaceBetween>
    </ContentLayout>
  );
}
