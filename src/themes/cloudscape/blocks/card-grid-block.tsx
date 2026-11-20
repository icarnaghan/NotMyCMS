import Cards from "@cloudscape-design/components/cards";
import Header from "@cloudscape-design/components/header";
import Box from "@cloudscape-design/components/box";
import Badge from "@cloudscape-design/components/badge";
import Button from "@cloudscape-design/components/button";
import Link from "@cloudscape-design/components/link";
import SpaceBetween from "@cloudscape-design/components/space-between";
import { useNavigate, type NavigateFunction } from "react-router-dom";
import type { Action, CardGridBlock, CardItem, Tone } from "../../../lib/page-schema";
import { badgeColor, cardsPerRow, TAG_COLOR, tagFilterUrl } from "../tone";

/**
 * A responsive grid of cards. The workhorse: four of the five pages being replaced are
 * mostly one or two of these.
 */

/**
 * Renders the badge and title.
 *
 * Three arrangements exist across the pages this replaces, and all three are *derived*
 * from which fields are present rather than configured:
 *
 *   badge.tagFilter set    the badge is its own link, the title is plain text
 *                          (teaching: the course code filters the blog)
 *   badge + titleLink      the badge sits inside the title link
 *                          (bitesize: the lesson number is part of the link)
 *   badge only             neither is a link
 *                          (apps: the category is a label)
 *
 * Deriving it means page data cannot express an arrangement the renderer has no
 * behaviour for, and there is no fourth field to get wrong.
 */
function CardHeader({
  item,
  tone,
  navigate,
}: {
  item: CardItem;
  tone: Tone | undefined;
  navigate: NavigateFunction;
}) {
  const badge = item.badge ? <Badge color={badgeColor(tone)}>{item.badge.text}</Badge> : null;

  // A filterable badge links somewhere different from the title, so it cannot be
  // nested inside the title's link.
  if (item.badge?.tagFilter) {
    const url = tagFilterUrl(item.badge.tagFilter);
    return (
      <SpaceBetween size="xs" direction="horizontal" alignItems="center">
        <span className="clickable-tag">
          <Link
            variant="secondary"
            href={url}
            onFollow={(e) => {
              e.preventDefault();
              navigate(url);
            }}
          >
            {badge}
          </Link>
        </span>
        <Box variant="h3">{item.title}</Box>
      </SpaceBetween>
    );
  }

  if (item.titleLink) {
    const link = item.titleLink;
    const isInternal = link.to !== undefined;
    const href = isInternal ? link.to! : link.href!;

    return (
      <Link
        fontSize="heading-m"
        href={href}
        {...(isInternal
          ? {
              onFollow: (e) => {
                e.preventDefault();
                navigate(href);
              },
            }
          : { external: true })}
      >
        {badge ? <>{badge} </> : null}
        {item.title}
      </Link>
    );
  }

  if (badge) {
    return (
      <SpaceBetween size="xs" direction="horizontal" alignItems="center">
        {badge}
        <Box variant="h3">{item.title}</Box>
      </SpaceBetween>
    );
  }

  return <Box variant="h3">{item.title}</Box>;
}

function CardActions({ actions, navigate }: { actions: Action[]; navigate: NavigateFunction }) {
  return (
    <SpaceBetween size="xs" direction="horizontal">
      {actions.map((action) =>
        action.to !== undefined ? (
          <Button
            key={action.label}
            variant={action.primary ? "primary" : "normal"}
            onClick={() => navigate(action.to!)}
          >
            {action.label}
          </Button>
        ) : (
          <Button
            key={action.label}
            variant={action.primary ? "primary" : "normal"}
            href={action.href}
            target="_blank"
            rel="noopener noreferrer"
            iconAlign="right"
            iconName="external"
          >
            {action.label}
          </Button>
        )
      )}
    </SpaceBetween>
  );
}

/**
 * Builds the section list from the fields this grid's items actually use.
 *
 * **A section returning `null` is not skipped.** Cloudscape renders the section wrapper
 * regardless, with its spacing: an earlier version declared all four sections
 * unconditionally and returned `null` from the unused ones, which added 76px to every
 * card on `/bitesize-javascript` — three empty wrappers worth 8px, 16px and 8px, plus
 * the one real section growing from 40px to 56px. Measured in Chrome against the old
 * component: 124px per card before, 200px after. A code comment here previously claimed
 * null sections were skipped; it was wrong.
 *
 * Computed per grid rather than per item, so every card in a grid still has the same
 * section list and they line up with each other.
 */
function buildSections(
  items: CardItem[],
  navigate: NavigateFunction
): { id: string; content: (item: CardItem) => React.ReactNode }[] {
  const sections = [];

  if (items.some((i) => i.meta)) {
    sections.push({
      id: "meta",
      content: (item: CardItem) =>
        item.meta ? (
          <Box color="text-body-secondary" fontSize="body-s">
            {item.meta}
          </Box>
        ) : null,
    });
  }

  if (items.some((i) => i.description)) {
    sections.push({
      id: "description",
      content: (item: CardItem) =>
        item.description ? <Box color="text-body-secondary">{item.description}</Box> : null,
    });
  }

  if (items.some((i) => i.tags?.length)) {
    sections.push({
      id: "tags",
      content: (item: CardItem) =>
        item.tags?.length ? (
          <SpaceBetween size="xxs" direction="horizontal">
            {item.tags.map((tag) => (
              <Badge key={tag} color={TAG_COLOR}>
                {tag}
              </Badge>
            ))}
          </SpaceBetween>
        ) : null,
    });
  }

  if (items.some((i) => i.actions?.length)) {
    sections.push({
      id: "actions",
      content: (item: CardItem) =>
        item.actions?.length ? <CardActions actions={item.actions} navigate={navigate} /> : null,
    });
  }

  return sections;
}

export function CardGridBlockView({ block }: { block: CardGridBlock }) {
  const navigate = useNavigate();
  const sections = buildSections(block.items, navigate);

  return (
    <Cards<CardItem>
      {...(block.title ? { header: <Header variant="h2">{block.title}</Header> } : {})}
      items={block.items}
      cardsPerRow={cardsPerRow(block.columns)}
      trackBy="id"
      {...(block.emptyText
        ? {
            empty: (
              <Box textAlign="center" color="text-body-secondary" padding="m">
                {block.emptyText}
              </Box>
            ),
          }
        : {})}
      cardDefinition={{
        header: (item) => <CardHeader item={item} tone={block.tone} navigate={navigate} />,
        sections,
      }}
    />
  );
}
