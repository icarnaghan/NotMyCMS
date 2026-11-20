/**
 * The Cloudscape layout for an article: breadcrumbs, a header with metadata and tags, the
 * rendered body, related posts, and a table of contents in the tools panel.
 */
import { useEffect, useState } from "react";
import AppLayout from "@cloudscape-design/components/app-layout";
import Header from "@cloudscape-design/components/header";
import ContentLayout from "@cloudscape-design/components/content-layout";
import SpaceBetween from "@cloudscape-design/components/space-between";
import BreadcrumbGroup from "@cloudscape-design/components/breadcrumb-group";
import Badge from "@cloudscape-design/components/badge";
import Link from "@cloudscape-design/components/link";
import Box from "@cloudscape-design/components/box";
import Spinner from "@cloudscape-design/components/spinner";
import AnchorNavigation from "@cloudscape-design/components/anchor-navigation";
import HelpPanel from "@cloudscape-design/components/help-panel";
import { ContentErrorBoundary } from "../../../core/content-error-boundary";
import type { ArticleView } from "../../types";
import { RelatedPosts } from "./related-posts";

export function ArticlePage({
  status,
  title,
  description,
  meta,
  tags,
  crumbs,
  toc,
  body,
  related,
  goTo,
}: ArticleView) {
  // The contents panel is view state. It starts closed on narrow screens, opens when an
  // article has headings, and closes when the window is resized narrow.
  const [toolsOpen, setToolsOpen] = useState(() => window.innerWidth > 768);
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth <= 768) setToolsOpen(false);
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);
  // Reset when a new article's contents arrive. Adjusting state during render, rather
  // than in an effect, avoids painting one frame with the previous article's panel state.
  const [seenToc, setSeenToc] = useState(toc);
  if (seenToc !== toc) {
    setSeenToc(toc);
    setToolsOpen(toc.length > 0 && window.innerWidth > 768);
  }

  if (status === "loading") {
    return (
      <AppLayout navigationHide toolsHide toolsOpen={false} content={<Spinner size="large" />} />
    );
  }

  const anchors = toc.map((h) => ({ text: h.text, href: `#${h.id}`, level: 1 as const }));
  const hasTools = anchors.length > 0;

  const mainContent = (
    <ContentLayout
      headerVariant="divider"
      header={
        <SpaceBetween size="s">
          <Header variant="h1" description={description}>
            {title}
          </Header>
          {(meta || tags.length > 0) && (
            <SpaceBetween size="xs">
              {meta && (
                <Box color="text-body-secondary" fontSize="body-s">
                  {meta}
                </Box>
              )}
              {/* Tags link to the posts page with a pre-filled filter */}
              {tags.length > 0 && (
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
              )}
            </SpaceBetween>
          )}
        </SpaceBetween>
      }
    >
      <Box>{body}</Box>
      <RelatedPosts items={related} goTo={goTo} />
    </ContentLayout>
  );

  return (
    <AppLayout
      navigationHide
      toolsHide={!hasTools}
      toolsOpen={toolsOpen}
      onToolsChange={({ detail }) => setToolsOpen(detail.open)}
      tools={
        hasTools ? (
          <HelpPanel header={<h2>On this page</h2>}>
            <AnchorNavigation anchors={anchors} />
          </HelpPanel>
        ) : undefined
      }
      toolsWidth={300}
      breadcrumbs={
        <BreadcrumbGroup
          items={crumbs.map((c) => ({ text: c.label, href: c.href ?? "#" }))}
          onFollow={(e) => {
            e.preventDefault();
            goTo(e.detail.href);
          }}
        />
      }
      content={
        <ContentErrorBoundary
          fallback={
            <Box variant="h2" textAlign="center" padding="xxl">
              Something went wrong rendering this page.
            </Box>
          }
        >
          {mainContent}
        </ContentErrorBoundary>
      }
    />
  );
}
