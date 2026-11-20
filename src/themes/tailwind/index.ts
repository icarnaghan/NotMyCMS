/**
 * The Tailwind theme: a lighter, blog-style look with readable article typography.
 *
 * As in the Cloudscape theme, only what every page needs is imported eagerly. Pages and
 * landing blocks load on demand, which keeps the Markdown parser and the code highlighter
 * off the startup path.
 */
import { lazy } from "react";
import { defineBlocks } from "../../core/define-blocks";
import type { Theme } from "../types";
import { applySettings } from "./apply-settings";
import { markdown } from "./markdown";
import { Shell } from "./shell";
import { PageFrame, Spinner } from "./ui";

const loadBlocks = () => import("./blocks");
const blocks = defineBlocks({
  prose: lazy(() => loadBlocks().then((m) => ({ default: m.ProseBlockView }))),
  "card-grid": lazy(() => loadBlocks().then((m) => ({ default: m.CardGridBlockView }))),
  columns: lazy(() => loadBlocks().then((m) => ({ default: m.ColumnsBlockView }))),
  "badge-list": lazy(() => loadBlocks().then((m) => ({ default: m.BadgeListBlockView }))),
  panel: lazy(() => loadBlocks().then((m) => ({ default: m.PanelBlockView }))),
  "social-links": lazy(() => loadBlocks().then((m) => ({ default: m.SocialLinksBlockView }))),
});

const ContentList = lazy(() =>
  import("./pages/content-list").then((m) => ({ default: m.ContentListPage }))
);
const Taxonomy = lazy(() => import("./pages/taxonomy").then((m) => ({ default: m.TaxonomyPage })));

export const theme: Theme = {
  name: "tailwind",
  // Density is a Cloudscape concept with no counterpart here (spec decision 6).
  capabilities: { colorModes: ["light", "dark", "system"], density: false, textSize: true },
  applySettings,
  blocks,
  markdown,
  Shell,
  Loading: Spinner,
  PageFrame,
  pages: {
    Article: lazy(() => import("./pages/article").then((m) => ({ default: m.ArticlePage }))),
    Landing: lazy(() => import("./pages/landing").then((m) => ({ default: m.LandingPageLayout }))),
    Home: lazy(() => import("./pages/home").then((m) => ({ default: m.HomePage }))),
    Posts: ContentList,
    KnowledgeBase: ContentList,
    NotFound: lazy(() => import("./pages/not-found").then((m) => ({ default: m.NotFoundPage }))),
    Categories: Taxonomy,
    Tags: Taxonomy,
  },
};
export default theme;
