/**
 * The Cloudscape layout around a landing page: header, optional breadcrumbs, and the blocks.
 */
import ContentLayout from "@cloudscape-design/components/content-layout";
import Header from "@cloudscape-design/components/header";
import SpaceBetween from "@cloudscape-design/components/space-between";
import BreadcrumbGroup from "@cloudscape-design/components/breadcrumb-group";
import type { LandingView } from "../../types";

export function LandingPageLayout({
  title,
  description,
  divider,
  crumbs,
  blocks,
  goTo,
}: LandingView) {
  const header = (
    <Header variant="h1" description={description}>
      {title}
    </Header>
  );
  const content = (
    <ContentLayout
      {...(divider ? { headerVariant: "divider" as const } : {})}
      // /about wraps its header in a SpaceBetween; matching that only when a divider is
      // set keeps the existing spacing on both kinds of page.
      header={divider ? <SpaceBetween size="s">{header}</SpaceBetween> : header}
    >
      <SpaceBetween size="xl">{blocks.map((block) => block.element)}</SpaceBetween>
    </ContentLayout>
  );
  if (crumbs.length === 0) return content;
  return (
    <>
      <BreadcrumbGroup
        items={crumbs.map((crumb) => ({
          text: crumb.label,
          // BreadcrumbGroup requires an href. The final crumb is the current page and has
          // no destination, so it gets "#" and is filtered out of onFollow below: the page
          // the visitor is already on should not be a link to itself.
          href: crumb.href ?? "#",
        }))}
        onFollow={(e) => {
          e.preventDefault();
          if (e.detail.href !== "#") goTo(e.detail.href);
        }}
      />
      {content}
    </>
  );
}
