/**
 * Maps semantic page data onto Cloudscape's vocabulary.
 *
 * This file is the whole reason page data stores `tone: "active"` rather than
 * `color: "green"`, and `columns: 2` rather than `cardsPerRow`. The pages being replaced
 * stored the Cloudscape values directly — `cardsPerRow` is literally the name of a
 * Cloudscape `Cards` prop — which would mean that changing component library later
 * required migrating stored content. Once pages are admin-edited and published, that is
 * the expensive kind of change.
 *
 * A theme is then an alternative block registry with a different version of this file.
 */
import type { Tone } from "../../lib/page-schema";

type BadgeColor = "green" | "blue" | "grey" | "red" | "severity-low";

/**
 * Tone to badge colour.
 *
 * Preserves what the pages render today: teaching's current courses were green and
 * previous were blue, and `/about`'s skills were blue.
 */
const BADGE_COLOR: Record<Tone, BadgeColor> = {
  active: "green",
  neutral: "blue",
  muted: "grey",
};

/** Default when a block sets no tone. Blue is what the unstyled grids used. */
const DEFAULT_TONE: Tone = "neutral";

export function badgeColor(tone: Tone | undefined): BadgeColor {
  return BADGE_COLOR[tone ?? DEFAULT_TONE];
}

/**
 * Item tags render grey regardless of the block's tone.
 *
 * `/apps` shows a blue category badge and grey technology badges on the same card, so
 * the two are independent rather than one following the other.
 */
export const TAG_COLOR: BadgeColor = "grey";

/**
 * Columns to Cloudscape's responsive `cardsPerRow`.
 *
 * Always one card per row on narrow screens; the configured count applies from 500px up,
 * which is the breakpoint every one of these pages already used.
 */
export function cardsPerRow(
  columns: 1 | 2 | 3 | undefined
): { cards: number; minWidth?: number }[] {
  const target = columns ?? 2;
  if (target === 1) return [{ cards: 1 }];
  return [{ cards: 1 }, { minWidth: 500, cards: target }];
}

/**
 * URL for a badge's tag filter.
 *
 * Page data stores the tag, not this URL, so changing the filter format stays a change
 * here rather than a content migration. Matches the shape `content-renderer.tsx` uses
 * for post tags, so a course badge and a post tag lead to the same place.
 */
export function tagFilterUrl(tag: string): string {
  return `/posts?tag=${encodeURIComponent(tag)}`;
}
