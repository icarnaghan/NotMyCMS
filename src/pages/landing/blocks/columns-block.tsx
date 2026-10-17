import ColumnLayout from "@cloudscape-design/components/column-layout";
import Header from "@cloudscape-design/components/header";
import SpaceBetween from "@cloudscape-design/components/space-between";
import Box from "@cloudscape-design/components/box";
import type { ColumnsBlock } from "../../../lib/page-schema";
import { Prose } from "../prose";

/**
 * Side-by-side titled prose. Collapses to a single column on narrow screens, which
 * `ColumnLayout` handles.
 *
 * `variant="text-grid"` matches what `/about` renders today — it adds the dividers
 * between columns.
 */
export function ColumnsBlockView({ block }: { block: ColumnsBlock }) {
  // ColumnLayout accepts 1-4. The validator requires at least 2, and clamping here
  // means a wider block degrades rather than throwing inside Cloudscape.
  const columns = Math.min(block.columns.length, 4) as 1 | 2 | 3 | 4;

  return (
    <ColumnLayout columns={columns} variant="text-grid">
      {block.columns.map((column) => (
        <SpaceBetween size="s" key={column.title}>
          <Header variant="h2">{column.title}</Header>
          <Box variant="div">
            <Prose markdown={column.markdown} />
          </Box>
        </SpaceBetween>
      ))}
    </ColumnLayout>
  );
}
