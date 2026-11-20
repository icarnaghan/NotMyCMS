import type { ComponentType } from "react";
import type { Block, BlockType } from "../lib/page-schema";

export type BlockRegistry = Record<BlockType, ComponentType<{ block: Block }>>;

/** What a theme supplies: for each block type, a component taking that exact block shape. */
export type BlockViews = {
  [T in BlockType]: ComponentType<{ block: Extract<Block, { type: T }> }>;
};

/**
 * Builds a registry from per-type components. The signature is where "every block type has
 * a renderer" is enforced: leaving one out is a type error. The single widening cast lives
 * here, once, because the lookup by `block.type` is sound even though the map type is not.
 */
export function defineBlocks(views: BlockViews): BlockRegistry {
  return views as unknown as BlockRegistry;
}
