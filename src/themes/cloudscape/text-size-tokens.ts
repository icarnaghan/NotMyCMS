/**
 * Cloudscape sets type sizes through design tokens, so a larger text size is a token
 * override rather than a CSS rule. The scale applies to every body and heading token
 * together so proportions between them are unchanged. "default" applies nothing, which
 * leaves the stock Cloudscape appearance exactly as it was.
 */
import { TEXT_SCALE, type TextSizePreference } from "../../lib/text-size";

/** Cloudscape's stock `[font-size, line-height]` in px for each token pair. */
const BASE = {
  BodyS: [12, 16],
  BodyM: [14, 20],
  HeadingXs: [14, 20],
  HeadingS: [16, 20],
  HeadingM: [18, 22],
  HeadingL: [20, 24],
  HeadingXl: [24, 30],
  DisplayL: [42, 48],
} as const;

/**
 * Typography token overrides for a size, or `undefined` for the default. Sizes are
 * rounded to whole pixels so text stays on the pixel grid.
 */
export function textSizeTokens(size: TextSizePreference): Record<string, string> | undefined {
  if (size === "default") return undefined;
  const scale = TEXT_SCALE[size];
  const tokens: Record<string, string> = {};
  for (const [name, [fontSize, lineHeight]] of Object.entries(BASE)) {
    tokens[`fontSize${name}`] = `${Math.round(fontSize * scale)}px`;
    tokens[`lineHeight${name}`] = `${Math.round(lineHeight * scale)}px`;
  }
  return tokens;
}
