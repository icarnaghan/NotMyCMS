/**
 * Build tooling for the Tailwind theme. Loaded by `vite.config.ts` only when this theme is
 * selected (see `scripts/theme-build.ts`), so a Cloudscape build never runs Tailwind.
 */
import tailwindcss from "@tailwindcss/vite";

export default function plugins() {
  return [tailwindcss()];
}
