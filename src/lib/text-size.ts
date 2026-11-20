/**
 * Visitor-selectable text size.
 *
 * "default" is the theme's own sizing. Each theme decides how a larger size is applied;
 * the scale factors are shared so every theme grows text by the same proportion.
 */
export type TextSizePreference = "default" | "large" | "larger";

export const TEXT_SIZES: readonly TextSizePreference[] = ["default", "large", "larger"];

export function isTextSize(value: unknown): value is TextSizePreference {
  return typeof value === "string" && (TEXT_SIZES as readonly string[]).includes(value);
}

export function textSizeLabel(size: TextSizePreference): string {
  return { default: "Default", large: "Large", larger: "Larger" }[size];
}

/** Multiplier for each size, relative to the theme's default. */
export const TEXT_SCALE: Record<TextSizePreference, number> = {
  default: 1,
  large: 1.125,
  larger: 1.25,
};
