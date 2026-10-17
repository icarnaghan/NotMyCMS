import Box from "@cloudscape-design/components/box";
import Header from "@cloudscape-design/components/header";
import SpaceBetween from "@cloudscape-design/components/space-between";
import type { ProseBlock } from "../../../lib/page-schema";
import { Prose } from "../prose";

/**
 * A block of markdown prose, optionally under an `h2`.
 *
 * `Box variant="div"` rather than `"p"`: markdown produces its own `<p>` elements, and
 * the page this replaces wrapped them in a `Box variant="p"` — a `<p>` inside a `<p>`,
 * which browsers silently unnest into something other than what the markup says.
 *
 * The colour follows `muted` rather than being fixed. An earlier version always used the
 * secondary colour, which would have made `/apps` and `/teaching` visibly greyer than
 * they are today; those two use the default while `/bitesize-javascript` and
 * `/teaching/cmst388-tips` use secondary.
 */
export function ProseBlockView({ block }: { block: ProseBlock }) {
  const body = (
    <Box variant="div" {...(block.muted ? { color: "text-body-secondary" as const } : {})}>
      <Prose markdown={block.markdown} />
    </Box>
  );

  if (!block.title) return body;

  // `size="m"` matches the gap the cmst388-tips page puts between its "Additional
  // Resources" heading and the prose beneath it.
  return (
    <SpaceBetween size="m">
      <Header variant="h2">{block.title}</Header>
      {body}
    </SpaceBetween>
  );
}
