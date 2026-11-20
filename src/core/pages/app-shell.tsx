/**
 * The chrome around every route: navigation, search, cookie notice and settings. Builds the
 * view model and hands it to the active theme, which renders the routed page as `children`.
 */
import { useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import activeTheme from "@theme";
import { usePages } from "../../pages/landing/pages-context";
import { siteConfig } from "../../lib/site-config";
import { buildNav, usePageViewTracking } from "../navigation";
import { resultUrl, useSearch } from "../search";
import { useSettings } from "../settings-context";

export function AppShell({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const { navEntries } = usePages();
  const settings = useSettings();
  usePageViewTracking(settings.analyticsOptOut);
  const [searchOpen, setSearchOpen] = useState(false);
  const search = useSearch(searchOpen);
  const Shell = activeTheme.Shell;

  return (
    <Shell
      siteTitle={siteConfig.siteName}
      // Until the pages manifest loads, only the framework's own links show; the rest
      // appear once it resolves.
      nav={buildNav(navEntries).map(({ label, to }) => ({ label, to }))}
      settings={{
        colorMode: settings.theme,
        onColorModeChange: settings.setTheme,
        density: settings.density,
        onDensityChange: settings.setDensity,
        textSize: settings.textSize,
        onTextSizeChange: settings.setTextSize,
        analyticsOptOut: settings.analyticsOptOut,
        onAnalyticsOptOutChange: settings.setAnalyticsOptOut,
      }}
      capabilities={settings.capabilities}
      search={{
        open: searchOpen,
        onOpen: () => setSearchOpen(true),
        onClose: () => setSearchOpen(false),
        query: search.query,
        onQueryChange: search.setQuery,
        results: search.results.map((r) => ({
          slug: r.slug,
          title: r.title,
          excerpt: r.excerpt,
          href: resultUrl(r),
          kind: r.basePath === "posts" ? "posts" : "knowledge-base",
        })),
        announcement: search.announcement,
        choose: (result) => {
          navigate(result.href);
          search.reset();
          setSearchOpen(false);
        },
      }}
      goTo={navigate}
    >
      {children}
    </Shell>
  );
}
