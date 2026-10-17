import Container from "@cloudscape-design/components/container";
import Header from "@cloudscape-design/components/header";
import Badge from "@cloudscape-design/components/badge";
import SpaceBetween from "@cloudscape-design/components/space-between";
import type { BadgeListBlock } from "../../../lib/page-schema";
import { badgeColor } from "../tone";

/** A wrapping row of short labels — `/about`'s skills list. */
export function BadgeListBlockView({ block }: { block: BadgeListBlock }) {
  const badges = (
    <SpaceBetween size="xs" direction="horizontal">
      {block.items.map((item) => (
        <Badge key={item} color={badgeColor(block.tone)}>
          {item}
        </Badge>
      ))}
    </SpaceBetween>
  );

  // Untitled, the block is just the badges. A Container with an empty header would add
  // a visible border and padding the page did not ask for.
  if (!block.title) return badges;

  return <Container header={<Header variant="h2">{block.title}</Header>}>{badges}</Container>;
}
