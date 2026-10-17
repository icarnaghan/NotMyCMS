import "@cloudscape-design/global-styles/index.css";
import { lazy, Suspense, useEffect, useState } from "react";
import TopNavigation from "@cloudscape-design/components/top-navigation";
import Modal from "@cloudscape-design/components/modal";
import Box from "@cloudscape-design/components/box";
import Button from "@cloudscape-design/components/button";
import SpaceBetween from "@cloudscape-design/components/space-between";
import Spinner from "@cloudscape-design/components/spinner";

import { BrowserRouter, Routes, Route, useNavigate, useLocation } from "react-router-dom";
import { PageLayout } from "./components/page-layout";
import { SettingsProvider, useSettings } from "./lib/settings-context";
import { siteConfig } from "./lib/site-config";
import { SearchModal } from "./components/search";
import { PagesProvider, usePages } from "./pages/landing/pages-context";

/**
 * Navigation entries for routes the framework owns rather than the page registry.
 *
 * Carried here with explicit `order` values so the whole navigation is sorted by one
 * key. Registry pages currently hold 1 to 4, so these two land after them — but a new
 * registry page with `nav.order: 7` would sort last rather than being forced in front,
 * which a "registry first, then framework" rule would have done.
 */
const FRAMEWORK_NAV = [
  { label: "Blog Posts", to: "/posts", order: 5 },
  { label: "Knowledge Base", to: "/knowledge-base", order: 6 },
];

// Lazy-loaded route components — each becomes its own chunk
const HomePage = lazy(() =>
  import("./pages/home/home-page").then((m) => ({ default: m.HomePage }))
);
const PostsPage = lazy(() =>
  import("./pages/posts/posts-page").then((m) => ({ default: m.PostsPage }))
);
const KnowledgeBasePage = lazy(() =>
  import("./pages/knowledge-base/knowledge-base-page").then((m) => ({
    default: m.KnowledgeBasePage,
  }))
);

// Landing pages live as runtime content now (landing-page-editor). The catch-all resolver
// decides, from the pages manifest, whether a path is a landing page or a post; both the
// landing renderer and ContentPage are reached through it.
const LandingOrContent = lazy(() =>
  import("./pages/landing/landing-or-content").then((m) => ({ default: m.LandingOrContent }))
);

const ContentPage = lazy(() =>
  import("./components/content-renderer").then((m) => ({ default: m.ContentPage }))
);
const CategoriesPage = lazy(() =>
  import("./pages/categories/categories-page").then((m) => ({ default: m.CategoriesPage }))
);
const TagsPage = lazy(() =>
  import("./pages/tags/tags-page").then((m) => ({ default: m.TagsPage }))
);

import { TagRedirect } from "./components/tag-redirect";

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
  }
}

function AppContent() {
  const navigate = useNavigate();
  const location = useLocation();
  const { navEntries } = usePages();
  const { theme, density, analyticsOptOut, setTheme, setDensity, setAnalyticsOptOut } =
    useSettings();

  // Track SPA page views in Google Analytics, unless the visitor opted out.
  // (The GA opt-out flag also suppresses collection at the gtag level; this
  // avoids queueing the event at all.)
  useEffect(() => {
    if (analyticsOptOut) return;
    if (typeof window.gtag === "function") {
      window.gtag("event", "page_view", { page_path: location.pathname + location.search });
    }
  }, [location, analyticsOptOut]);
  const [cookiesVisible, setCookiesVisible] = useState(false);
  const [searchVisible, setSearchVisible] = useState(false);

  return (
    <>
      <TopNavigation
        i18nStrings={{
          overflowMenuTriggerText: "More",
          overflowMenuTitleText: "All",
        }}
        identity={{
          href: "/",
          title: siteConfig.siteName,
          onFollow: (e) => {
            e.preventDefault();
            navigate("/");
          },
        }}
        utilities={[
          // Navigation links, generated from the pages manifest (fetched at runtime) plus
          // the framework's own routes, sorted by one `order` key. Until the manifest
          // loads, navEntries is empty and only the framework links show; they appear
          // once it resolves. Previously read from the compiled registry.
          ...[
            ...navEntries.map((p) => ({
              label: p.nav!.label,
              to: `/${p.slug}`,
              order: p.nav!.order,
            })),
            ...FRAMEWORK_NAV,
          ]
            .sort((a, b) => a.order - b.order)
            .map(({ label, to }) => ({
              type: "button" as const,
              text: label,
              onClick: () => navigate(to),
            })),
          // The remaining utilities are behavioural, not navigational, so they are not
          // derivable from the registry.
          {
            type: "button",
            iconName: "search",
            ariaLabel: "Search",
            onClick: () => setSearchVisible(true),
          },
          {
            type: "button",
            iconName: "lock-private",
            ariaLabel: "Cookies Policy",
            onClick: () => setCookiesVisible(true),
          },
          {
            type: "menu-dropdown",
            iconName: "settings",
            ariaLabel: "Settings",
            title: "Settings",
            items: [
              {
                id: "theme",
                text: "Theme",
                items: [
                  {
                    id: "theme-light",
                    text: "Light",
                    itemType: "checkbox",
                    checked: theme === "light",
                  },
                  {
                    id: "theme-dark",
                    text: "Dark",
                    itemType: "checkbox",
                    checked: theme === "dark",
                  },
                  {
                    id: "theme-system",
                    text: "System",
                    itemType: "checkbox",
                    checked: theme === "system",
                  },
                ],
              },
              {
                id: "density",
                text: "Density",
                items: [
                  {
                    id: "density-comfortable",
                    text: "Comfortable",
                    itemType: "checkbox",
                    checked: density === "comfortable",
                  },
                  {
                    id: "density-compact",
                    text: "Compact",
                    itemType: "checkbox",
                    checked: density === "compact",
                  },
                ],
              },
              {
                id: "privacy",
                text: "Privacy",
                items: [
                  {
                    id: "analytics-opt-out",
                    text: "Don't track my visits",
                    itemType: "checkbox",
                    checked: analyticsOptOut,
                  },
                ],
              },
            ],
            onItemClick: ({ detail }) => {
              switch (detail.id) {
                case "theme-light":
                  setTheme("light");
                  break;
                case "theme-dark":
                  setTheme("dark");
                  break;
                case "theme-system":
                  setTheme("system");
                  break;
                case "density-comfortable":
                  setDensity("comfortable");
                  break;
                case "density-compact":
                  setDensity("compact");
                  break;
                case "analytics-opt-out":
                  setAnalyticsOptOut(!analyticsOptOut);
                  break;
              }
            },
          },
        ]}
      />
      <Modal
        visible={cookiesVisible}
        onDismiss={() => setCookiesVisible(false)}
        header="Cookies Policy"
        closeAriaLabel="Close"
        footer={
          <Box float="right">
            <Button variant="primary" onClick={() => setCookiesVisible(false)}>
              Close
            </Button>
          </Box>
        }
      >
        <SpaceBetween size="m">
          <Box variant="p">
            This site uses cookies - small text files that are placed on your machine to help the
            site provide a better user experience. In general, cookies are used to retain user
            preferences, store information for things like shopping carts, and provide anonymised
            tracking data to third party applications like Google Analytics. As a rule, cookies will
            make your browsing experience better. However, you may prefer to disable cookies on this
            site and on others. The most effective way to do this is to disable cookies in your
            browser. We suggest consulting the Help section of your browser or taking a look at the
            About Cookies website which offers guidance for all modern browsers
          </Box>
        </SpaceBetween>
      </Modal>
      <SearchModal visible={searchVisible} onDismiss={() => setSearchVisible(false)} />
      <Suspense
        fallback={
          <PageLayout>
            <Spinner size="large" />
          </PageLayout>
        }
      >
        <Routes>
          <Route
            path="/"
            element={
              <PageLayout>
                <HomePage />
              </PageLayout>
            }
          />
          <Route
            path="/posts"
            element={
              <PageLayout>
                <PostsPage />
              </PageLayout>
            }
          />
          <Route
            path="/knowledge-base"
            element={
              <PageLayout>
                <KnowledgeBasePage />
              </PageLayout>
            }
          />
          <Route path="/knowledge-base/:slug" element={<ContentPage basePath="knowledge-base" />} />
          <Route
            path="/categories"
            element={
              <PageLayout>
                <CategoriesPage />
              </PageLayout>
            }
          />
          <Route path="/categories/:name" element={<TagRedirect />} />
          <Route
            path="/tags"
            element={
              <PageLayout>
                <TagsPage />
              </PageLayout>
            }
          />
          <Route path="/tags/:name" element={<TagRedirect />} />
          <Route path="/teaching/cmst388-tips/:slug" element={<ContentPage basePath="pages" />} />
          {/*
            Catch-all resolver. A path that matches no explicit route above is either a
            landing page (slug in the runtime pages manifest) or a post; LandingOrContent
            decides, landing-first, and renders the 404 page for anything that is neither.
            This replaces both the old per-slug landing routes and the `/:slug → posts`
            route, and absorbs the former `*` → NotFound: ContentPage already 404s an
            unknown post. More specific routes (e.g. the cmst388-tips child guides above)
            still win by React Router's specificity ranking.
          */}
          <Route
            path="*"
            element={
              <PageLayout>
                <LandingOrContent />
              </PageLayout>
            }
          />
        </Routes>
      </Suspense>
    </>
  );
}

function App() {
  return (
    <BrowserRouter>
      <SettingsProvider>
        <PagesProvider>
          <AppContent />
        </PagesProvider>
      </SettingsProvider>
    </BrowserRouter>
  );
}

export default App;
