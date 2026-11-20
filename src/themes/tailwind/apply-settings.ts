/**
 * Applies appearance settings for the Tailwind theme: a `dark` class on the root element
 * (Tailwind's class-based dark mode) and the root font size for text size, which scales
 * everything sized in rem. Density is not supported, so the core never passes it here.
 *
 * `head.html` does the same before first paint; this keeps it in sync afterwards.
 */
import { TEXT_SCALE } from "../../lib/text-size";
import type { AppearanceSettings } from "../types";

export function applySettings(settings: AppearanceSettings): void {
  const root = document.documentElement;
  const dark = settings.resolvedMode === "dark";
  root.classList.toggle("dark", dark);
  root.style.colorScheme = dark ? "dark" : "light";
  root.style.fontSize =
    settings.textSize === "default" ? "" : `${TEXT_SCALE[settings.textSize] * 100}%`;
}
