export interface PostMeta {
  slug: string;
  title: string;
  date: string;
  description?: string;
  excerpt?: string;
  categories?: string;
  tags?: string[];
}

/**
 * Fetches the content manifest for the given base path.
 * Returns an empty array if the fetch fails, and logs the error to the console.
 */
export async function fetchManifest(
  basePath: "posts" | "knowledge-base" | "pages"
): Promise<PostMeta[]> {
  try {
    const res = await fetch(`/content/${basePath}/manifest.json`);
    if (!res.ok) throw new Error(`Failed to load ${basePath} manifest: ${res.status}`);
    return await res.json();
  } catch (err) {
    console.error(err);
    return [];
  }
}

/**
 * Format a publication date for display.
 *
 * Rendered in UTC deliberately. Frontmatter dates are calendar dates, stored as
 * UTC midnight (`2024-01-15` or `2024-01-15T00:00:00.000Z`). Formatting those in
 * the viewer's local timezone shifts them backwards for every reader west of
 * UTC — a post dated the 15th displayed as "January 14" across the Americas.
 * A publication date is the day it was published, not an instant that should
 * move with the reader.
 *
 * This also makes the output deterministic regardless of the machine's timezone,
 * which matters for tests: CI runs in UTC, developer machines usually don't.
 */
export function formatDate(date: string, style: "long" | "short" = "long"): string {
  return new Date(date).toLocaleDateString("en-US", {
    year: "numeric",
    month: style,
    day: "numeric",
    timeZone: "UTC",
  });
}

/** Special-case display labels for tags/categories that don't title-case well */
const LABEL_OVERRIDES: Record<string, string> = {
  aws: "AWS",
  cicd: "CI/CD",
  "ci-cd": "CI/CD",
  cka: "CKA",
  cms: "CMS",
  css: "CSS",
  devops: "DevOps",
  iis: "IIS",
  mysql: "MySQL",
  nginx: "Nginx",
  php: "PHP",
  seo: "SEO",
  ssd: "SSD",
  vps: "VPS",
  "ux-design": "UX Design",
  wordpress: "WordPress",
  "wordpress-plugins": "WordPress Plugins",
  studiopress: "StudioPress",
  "google-adsense": "Google AdSense",
  kubectl: "kubectl",
};

/** Converts a slug-style tag/category to a display label */
export function toDisplayLabel(slug: string): string {
  const s = String(slug);
  if (LABEL_OVERRIDES[s]) return LABEL_OVERRIDES[s];
  return s
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}
