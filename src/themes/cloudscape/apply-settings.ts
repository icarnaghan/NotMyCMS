/**
 * Applies the visitor's appearance settings to the document using Cloudscape's own APIs.
 *
 * The core owns the settings state and storage; this is the only place that knows how
 * Cloudscape expresses them. Color mode and density are cheap and idempotent, so they are
 * applied on every call. Text size is a token override whose runtime is about 60 KB gzip,
 * so it loads lazily and is only touched when the size actually changes.
 */
import { applyMode, applyDensity, Mode, Density } from "@cloudscape-design/global-styles";
import type { AppearanceSettings } from "../types";
import type { TextSizePreference } from "../../lib/text-size";
import { textSizeTokens } from "./text-size-tokens";

let appliedTextSize: TextSizePreference = "default";
let resetTextSize: (() => void) | undefined;
/** Guards against a slow import resolving after a newer choice was made. */
let generation = 0;

export function applySettings(settings: AppearanceSettings): void {
  applyMode(settings.resolvedMode === "dark" ? Mode.Dark : Mode.Light);
  applyDensity(settings.density === "compact" ? Density.Compact : Density.Comfortable);

  if (settings.textSize === appliedTextSize) return;
  appliedTextSize = settings.textSize;
  const mine = ++generation;
  // Reset first so sizes never stack.
  resetTextSize?.();
  resetTextSize = undefined;
  const tokens = textSizeTokens(settings.textSize);
  if (!tokens) return;
  import("@cloudscape-design/components/theming").then(({ applyTheme }) => {
    if (mine !== generation) return;
    resetTextSize = applyTheme({ theme: { tokens } }).reset;
  });
}
