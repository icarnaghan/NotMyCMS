/** The site's navigation model, independent of how a theme draws it. */
import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { siteConfig } from "../lib/site-config";
import type { PageManifestEntry } from "../pages/landing/pages-manifest";

export interface NavItem {
  label: string;
  to: string;
  order: number;
}

/**
 * Entries for routes the framework owns rather than the page registry. They carry explicit
 * `order` values so the whole navigation is sorted by one key. Registry pages currently
 * hold 1 to 4, so these land after them, but a new registry page with `nav.order: 7`
 * sorts last rather than being forced in front.
 */
export const FRAMEWORK_NAV: readonly NavItem[] = [
  { label: "Blog Posts", to: "/posts", order: 5 },
  { label: "Knowledge Base", to: "/knowledge-base", order: 6 },
];

/** Landing pages that opted into navigation, merged with the framework entries and sorted. */
export function buildNav(navEntries: PageManifestEntry[]): NavItem[] {
  return [
    ...navEntries.map((p) => ({ label: p.nav!.label, to: `/${p.slug}`, order: p.nav!.order })),
    ...FRAMEWORK_NAV,
  ].sort((a, b) => a.order - b.order);
}

/** The route pattern for the configured guide section, or null when the site has none. */
export function guideRoutePattern(): string | null {
  return siteConfig.guideSection ? `/${siteConfig.guideSection.path}/:slug` : null;
}

/**
 * Reports each client-side navigation to Google Analytics as a page view, unless the
 * visitor opted out. The opt-out flag also suppresses collection at the gtag level;
 * skipping here avoids queueing the event at all.
 */
export function usePageViewTracking(optedOut: boolean): void {
  const location = useLocation();
  useEffect(() => {
    if (optedOut) return;
    if (typeof window.gtag === "function") {
      window.gtag("event", "page_view", { page_path: location.pathname + location.search });
    }
  }, [location, optedOut]);
}
