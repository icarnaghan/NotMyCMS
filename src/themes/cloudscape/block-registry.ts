/**
 * Maps a block type to the component that renders it.
 *
 * The seam a theme would replace: same page JSON, a different registry. That is the
 * cheapest form of theming to support, and the reason page data stores semantic values
 * instead of Cloudscape ones.
 *
 * Kept separate from `landing-page.tsx` so the page renderer has no knowledge of
 * individual block types, and adding a block type is one entry here plus one component.
 */
import type { BlockType } from "../../lib/page-schema";
import { defineBlocks, type BlockRegistry } from "../../core/define-blocks";
import { ProseBlockView } from "./blocks/prose-block";
import { CardGridBlockView } from "./blocks/card-grid-block";
import { ColumnsBlockView } from "./blocks/columns-block";
import { BadgeListBlockView } from "./blocks/badge-list-block";
import { PanelBlockView } from "./blocks/panel-block";
import { SocialLinksBlockView } from "./blocks/social-links-block";

export const BLOCK_REGISTRY: BlockRegistry = defineBlocks({
  prose: ProseBlockView,
  "card-grid": CardGridBlockView,
  columns: ColumnsBlockView,
  "badge-list": BadgeListBlockView,
  panel: PanelBlockView,
  "social-links": SocialLinksBlockView,
});

/** Block types this build can render. */
export const RENDERABLE_BLOCK_TYPES = Object.keys(BLOCK_REGISTRY) as BlockType[];

// Re-exported so the theme entry can load every block from this one module.
export {
  ProseBlockView,
  CardGridBlockView,
  ColumnsBlockView,
  BadgeListBlockView,
  PanelBlockView,
  SocialLinksBlockView,
};
