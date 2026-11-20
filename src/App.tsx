import { lazy, Suspense } from "react";

import { BrowserRouter, Routes, Route } from "react-router-dom";
import activeTheme from "@theme";
import { SettingsProvider } from "./core/settings-context";
import { PagesProvider } from "./pages/landing/pages-context";
import { guideRoutePattern } from "./core/navigation";
import { AppShell } from "./core/pages/app-shell";

// Lazy-loaded route components — each becomes its own chunk
const HomePage = lazy(() =>
  import("./core/pages/home-route").then((m) => ({ default: m.HomeRoute }))
);
const PostsPage = lazy(() =>
  import("./core/pages/posts-route").then((m) => ({ default: m.PostsRoute }))
);
const KnowledgeBasePage = lazy(() =>
  import("./core/pages/knowledge-base-route").then((m) => ({ default: m.KnowledgeBaseRoute }))
);

// Landing pages live as runtime content now (landing-page-editor). The catch-all resolver
// decides, from the pages manifest, whether a path is a landing page or a post; both the
// landing renderer and ContentPage are reached through it.
const LandingOrContent = lazy(() =>
  import("./pages/landing/landing-or-content").then((m) => ({ default: m.LandingOrContent }))
);

const ContentPage = lazy(() =>
  import("./core/pages/article-route").then((m) => ({ default: m.ContentPage }))
);
const CategoriesPage = lazy(() =>
  import("./core/pages/taxonomy-route").then((m) => ({ default: m.CategoriesRoute }))
);
const TagsPage = lazy(() =>
  import("./core/pages/taxonomy-route").then((m) => ({ default: m.TagsRoute }))
);

import { TagRedirect } from "./components/tag-redirect";

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
  }
}

const { PageFrame, Loading } = activeTheme;

function AppContent() {
  const guidePattern = guideRoutePattern();
  return (
    <AppShell>
      <Suspense
        fallback={
          <PageFrame>
            <Loading />
          </PageFrame>
        }
      >
        <Routes>
          <Route
            path="/"
            element={
              <PageFrame>
                <HomePage />
              </PageFrame>
            }
          />
          <Route
            path="/posts"
            element={
              <PageFrame>
                <PostsPage />
              </PageFrame>
            }
          />
          <Route
            path="/knowledge-base"
            element={
              <PageFrame>
                <KnowledgeBasePage />
              </PageFrame>
            }
          />
          <Route path="/knowledge-base/:slug" element={<ContentPage basePath="knowledge-base" />} />
          <Route
            path="/categories"
            element={
              <PageFrame>
                <CategoriesPage />
              </PageFrame>
            }
          />
          <Route path="/categories/:name" element={<TagRedirect />} />
          <Route
            path="/tags"
            element={
              <PageFrame>
                <TagsPage />
              </PageFrame>
            }
          />
          <Route path="/tags/:name" element={<TagRedirect />} />
          {guidePattern && <Route path={guidePattern} element={<ContentPage basePath="pages" />} />}
          {/*
            Catch-all resolver. A path that matches no explicit route above is either a
            landing page (slug in the runtime pages manifest) or a post; LandingOrContent
            decides, landing-first, and renders the 404 page for anything that is neither.
            This replaces both the old per-slug landing routes and the `/:slug → posts`
            route, and absorbs the former `*` → NotFound: ContentPage already 404s an
            unknown post. More specific routes (e.g. the configured guide section above)
            still win by React Router's specificity ranking.
          */}
          <Route
            path="*"
            element={
              <PageFrame>
                <LandingOrContent />
              </PageFrame>
            }
          />
        </Routes>
      </Suspense>
    </AppShell>
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
