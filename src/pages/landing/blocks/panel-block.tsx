import Container from "@cloudscape-design/components/container";
import Header from "@cloudscape-design/components/header";
import SpaceBetween from "@cloudscape-design/components/space-between";
import Box from "@cloudscape-design/components/box";
import type { PanelBlock } from "../../../lib/page-schema";
import { Prose } from "../prose";

/**
 * A bordered panel with an emphasised lead line above prose — `/about`'s doctoral
 * research section, where the lead is the paper title and the prose is the abstract.
 */
export function PanelBlockView({ block }: { block: PanelBlock }) {
  const body = (
    <SpaceBetween size="s">
      {block.lead ? (
        <Box variant="p" fontWeight="bold">
          {block.lead}
        </Box>
      ) : null}
      <Box variant="div" color="text-body-secondary">
        <Prose markdown={block.markdown} />
      </Box>
    </SpaceBetween>
  );

  if (!block.title) return body;

  return <Container header={<Header variant="h2">{block.title}</Header>}>{body}</Container>;
}
