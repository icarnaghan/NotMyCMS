/**
 * One generic renderer for every landing page, replacing five bespoke components.
 *
 * Renders the page metadata, then walks `blocks` and hands each to whatever the registry
 * has for its type.
 *
 * **Lenient on purpose.** An unrecognised block type is skipped with a warning, and a
 * block that throws is contained rather than taking the page with it. The build-time
 * validator is the opposite — strict, failing on an unknown type or field. The asymmetry
 * is deliberate: this repository's own content cannot be quietly wrong, but a page
 * authored by a newer admin should still render the blocks an older deployment
 * understands, and one bad block should never blank a page. The design document records
 * this so it does not get "fixed" into consistency later.
 */
import { Component, type ErrorInfo, type ReactNode } from "react";
import ContentLayout from "@cloudscape-design/components/content-layout";
import Header from "@cloudscape-design/components/header";
import SpaceBetween from "@cloudscape-design/components/space-between";
import BreadcrumbGroup from "@cloudscape-design/components/breadcrumb-group";
import { useNavigate } from "react-router-dom";
import type { Block, LandingPage } from "../../lib/page-schema";
import { useDocumentTitle } from "../../lib/use-document-title";
import { BLOCK_REGISTRY } from "./block-registry";

/**
 * Contains a render error to the single block that caused it.
 *
 * Without this, a block throwing would unmount the whole route. With it, the rest of the
 * page survives and the gap is visible in the console rather than silent. Deliberately
 * renders nothing: a visitor cannot act on "block failed", and an error panel in the
 * middle of a page is worse than a missing section.
 */
class BlockBoundary extends Component<
  { blockId: string; children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`Block "${this.props.blockId}" failed to render:`, error, info);
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}

function BlockRenderer({ block }: { block: Block }) {
  const Component_ = BLOCK_REGISTRY[block.type];

  if (!Component_) {
    // Reachable when stored content is newer than this build.
    console.warn(
      `Skipping block "${block.id}": no renderer for type "${block.type}". ` +
        `This build understands: ${Object.keys(BLOCK_REGISTRY).join(", ")}.`
    );
    return null;
  }

  return (
    <BlockBoundary blockId={block.id}>
      <Component_ block={block} />
    </BlockBoundary>
  );
}

export function LandingPageView({ page }: { page: LandingPage }) {
  const navigate = useNavigate();
  useDocumentTitle(page.seo.title);

  const header = (
    <Header variant="h1" description={page.header.description}>
      {page.header.title}
    </Header>
  );

  const content = (
    <ContentLayout
      {...(page.header.divider ? { headerVariant: "divider" as const } : {})}
      // /about wraps its header in a SpaceBetween; matching that only when a divider is
      // set keeps the existing spacing on both kinds of page.
      header={page.header.divider ? <SpaceBetween size="s">{header}</SpaceBetween> : header}
    >
      <SpaceBetween size="xl">
        {page.blocks.map((block) => (
          <BlockRenderer key={block.id} block={block} />
        ))}
      </SpaceBetween>
    </ContentLayout>
  );

  if (!page.breadcrumbs?.length) return content;

  return (
    <>
      <BreadcrumbGroup
        items={page.breadcrumbs.map((crumb) => ({
          text: crumb.text,
          // BreadcrumbGroup requires an href. The final crumb is the current page and
          // has no destination, so it gets "#" and is filtered out of onFollow below —
          // the page the visitor is already on should not be a link to itself.
          href: crumb.to ?? "#",
        }))}
        onFollow={(e) => {
          e.preventDefault();
          if (e.detail.href !== "#") navigate(e.detail.href);
        }}
      />
      {content}
    </>
  );
}
