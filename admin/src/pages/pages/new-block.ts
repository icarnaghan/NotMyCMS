import type { Block, BlockType } from "../../api/pages";

/**
 * A new block of the given type with sensible empty defaults, ready for the editor.
 *
 * Separate from `block-editor.tsx` so that file can export only its component (the
 * fast-refresh rule), and because the editor page needs this without the component.
 */
export function newBlock(type: BlockType, id: string): Block {
  switch (type) {
    case "prose":
      return { id, type, version: 1, markdown: "" };
    case "panel":
      return { id, type, version: 1, markdown: "" };
    case "card-grid":
      return { id, type, version: 1, items: [] };
    case "columns":
      return {
        id,
        type,
        version: 1,
        columns: [
          { title: "", markdown: "" },
          { title: "", markdown: "" },
        ],
      };
    case "badge-list":
      return { id, type, version: 1, items: [] };
    case "social-links":
      return { id, type, version: 1 };
  }
}
