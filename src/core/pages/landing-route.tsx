/**
 * A landing page. The core decides what is shown (title, crumbs, which blocks render and
 * what happens when one fails); the active theme decides how it looks.
 */
import { useNavigate } from "react-router-dom";
import activeTheme from "@theme";
import type { LandingPage } from "../../lib/page-schema";
import { useDocumentTitle } from "../../lib/use-document-title";
import { BlockRenderer } from "../landing-blocks";

export function LandingPageView({ page }: { page: LandingPage }) {
  const navigate = useNavigate();
  useDocumentTitle(page.seo.title);
  const View = activeTheme.pages.Landing;
  return (
    <View
      title={page.header.title}
      description={page.header.description}
      divider={Boolean(page.header.divider)}
      crumbs={(page.breadcrumbs ?? []).map((c) => ({ label: c.text, href: c.to }))}
      blocks={page.blocks.map((block) => ({
        id: block.id,
        element: <BlockRenderer key={block.id} block={block} registry={activeTheme.blocks} />,
      }))}
      goTo={navigate}
    />
  );
}
