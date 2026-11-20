/**
 * The leniency rules for landing-page blocks. Headless: the theme supplies the registry
 * (block type to component) and the layout around the list; this decides what happens
 * when a block cannot be rendered.
 *
 * **Lenient on purpose.** An unrecognised block type is skipped with a warning, and a
 * block that throws is contained rather than taking the page with it. The build-time
 * validator is the opposite: strict, failing on an unknown type or field. The asymmetry
 * is deliberate. This repository's own content cannot be quietly wrong, but a page
 * authored by a newer admin should still render the blocks an older deployment
 * understands, and one bad block should never blank a page.
 */
import { Component, type ErrorInfo, type ReactNode } from "react";
import type { Block } from "../lib/page-schema";

import type { BlockRegistry } from "./define-blocks";

/**
 * Contains a render error to the single block that caused it. Renders nothing on failure:
 * a visitor cannot act on "block failed", and an error panel in the middle of a page is
 * worse than a missing section. The gap is visible in the console.
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

export function BlockRenderer({ block, registry }: { block: Block; registry: BlockRegistry }) {
  const Renderer = registry[block.type];
  if (!Renderer) {
    // Reachable when stored content is newer than this build.
    console.warn(
      `Skipping block "${block.id}": no renderer for type "${block.type}". ` +
        `This build understands: ${Object.keys(registry).join(", ")}.`
    );
    return null;
  }
  return (
    <BlockBoundary blockId={block.id}>
      <Renderer block={block} />
    </BlockBoundary>
  );
}
