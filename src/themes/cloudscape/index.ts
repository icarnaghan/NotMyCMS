/**
 * The Cloudscape theme.
 *
 * Only what every page needs is imported eagerly: the shell, the page frame, settings and
 * the Markdown element components (which carry no Markdown parser). Pages and landing
 * blocks load on demand, so each route keeps its own chunk and the Markdown parser that
 * the prose blocks pull in is not on the startup path. The router's Suspense boundary
 * covers the loading state.
 */
import { lazy } from "react";
import { defineBlocks } from "../../core/define-blocks";
import type { Theme } from "../types";
import { applySettings } from "./apply-settings";
import { markdown } from "./markdown";
import { PageLayout } from "./page-frame";
import { Shell } from "./shell";
import { Loading } from "./loading";

/** All six blocks come from one module, so they share one chunk. */
const loadBlocks = () => import("./block-registry");
const blocks = defineBlocks({
  prose: lazy(() => loadBlocks().then((m) => ({ default: m.ProseBlockView }))),
  "card-grid": lazy(() => loadBlocks().then((m) => ({ default: m.CardGridBlockView }))),
  columns: lazy(() => loadBlocks().then((m) => ({ default: m.ColumnsBlockView }))),
  "badge-list": lazy(() => loadBlocks().then((m) => ({ default: m.BadgeListBlockView }))),
  panel: lazy(() => loadBlocks().then((m) => ({ default: m.PanelBlockView }))),
  "social-links": lazy(() => loadBlocks().then((m) => ({ default: m.SocialLinksBlockView }))),
});

export const theme: Theme = {
  name: "cloudscape",
  capabilities: { colorModes: ["light", "dark", "system"], density: true, textSize: true },
  applySettings,
  blocks,
  markdown,
  Shell,
  Loading,
  PageFrame: PageLayout,
  pages: {
    Article: lazy(() => import("./pages/article").then((m) => ({ default: m.ArticlePage }))),
    Landing: lazy(() => import("./pages/landing").then((m) => ({ default: m.LandingPageLayout }))),
    Home: lazy(() => import("./pages/home").then((m) => ({ default: m.HomePage }))),
    Posts: lazy(() => import("./pages/posts").then((m) => ({ default: m.PostsPage }))),
    KnowledgeBase: lazy(() =>
      import("./pages/knowledge-base").then((m) => ({ default: m.KnowledgeBasePage }))
    ),
    NotFound: lazy(() => import("./pages/not-found").then((m) => ({ default: m.NotFoundPage }))),
    Categories: lazy(() => import("./pages/taxonomy").then((m) => ({ default: m.TaxonomyPage }))),
    Tags: lazy(() => import("./pages/taxonomy").then((m) => ({ default: m.TaxonomyPage }))),
  },
};
export default theme;
