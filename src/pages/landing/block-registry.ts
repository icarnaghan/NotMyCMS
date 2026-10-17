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
import type { ComponentType } from "react";
import type { Block, BlockType } from "../../lib/page-schema";
import { ProseBlockView } from "./blocks/prose-block";
import { CardGridBlockView } from "./blocks/card-grid-block";
import { ColumnsBlockView } from "./blocks/columns-block";
import { BadgeListBlockView } from "./blocks/badge-list-block";
import { PanelBlockView } from "./blocks/panel-block";
import { SocialLinksBlockView } from "./blocks/social-links-block";

/**
 * Every renderer takes `{ block }`. The cast is contained to this table: each component
 * declares the specific block type it accepts, and the registry is keyed by that same
 * `type`, so the lookup in `landing-page.tsx` is sound even though the map's value type
 * is widened.
 */
export const BLOCK_REGISTRY: Record<BlockType, ComponentType<{ block: Block }>> = {
  prose: ProseBlockView as ComponentType<{ block: Block }>,
  "card-grid": CardGridBlockView as ComponentType<{ block: Block }>,
  columns: ColumnsBlockView as ComponentType<{ block: Block }>,
  "badge-list": BadgeListBlockView as ComponentType<{ block: Block }>,
  panel: PanelBlockView as ComponentType<{ block: Block }>,
  "social-links": SocialLinksBlockView as ComponentType<{ block: Block }>,
};

/** Block types this build can render. */
export const RENDERABLE_BLOCK_TYPES = Object.keys(BLOCK_REGISTRY) as BlockType[];
