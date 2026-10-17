/**
 * Route resolution tests against the real route table in `App.tsx`.
 *
 * `/:slug` is a catch-all serving all 628 blog posts, so a new route that matches too
 * broadly can shadow every one of them. That failure is close to invisible from
 * outside: a prerendered `dist/<slug>/index.html` exists for every post, so the URL
 * still returns 200 with correct markup and only goes wrong once React hydrates and the
 * router picks the other route. No request-level check can see it.
 *
 * One thing these tests do **not** guard, despite a comment in `App.tsx` that used to
 * claim otherwise: declaration order. React Router ranks routes by specificity, not by
 * the order they appear, so a literal segment beats a dynamic `:slug` wherever it is
 * written. Confirmed by moving `/:slug` above the other routes and re-running this
 * file — resolution does not change. What these guard is the resolution itself, which
 * is what matters when a route pattern changes.
 *
 * Now that the landing-page routes are generated from `site/pages/`, they also guard
 * the generation: a registry page whose route pattern came out wrong would show up here
 * as either a missing heading or a post appearing where a page should.
 *
 * They render the real `App` rather than a reconstruction of its routes, so they cannot
 * drift from what ships.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import App from "./App";
import { TEST_PAGES, TEST_PAGES_MANIFEST } from "./pages/landing/test-pages-fixture";

/**
 * Markdown the content renderer will accept, so a post route settles into its loaded
 * state rather than its not-found state.
 */
const MARKDOWN = `---\ntitle: A Real Post\n---\n\nBody text.\n`;

/**
 * Landing pages are runtime content now (landing-page-editor): the SPA fetches a pages
 * manifest at startup and each page's JSON on navigation. These tests serve both from a
 * shared fixture (not the former compiled registry, which was removed in stage 4), so
 * they prove the runtime fetch path resolves the pages and renders their content.
 */
const PAGES = TEST_PAGES;
const PAGES_MANIFEST = TEST_PAGES_MANIFEST;

function json(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

function mockFetch() {
  return vi.fn((input: RequestInfo | URL) => {
    const url = String(input);

    if (url.endsWith("/content/pages/manifest.json")) {
      return Promise.resolve(json(PAGES_MANIFEST));
    }

    // A landing page's JSON: /content/pages/<slug>/page.json. Match against the registry.
    const pageMatch = url.match(/\/content\/pages\/(.+)\/page\.json$/);
    if (pageMatch) {
      const page = PAGES.find((p) => p.slug === pageMatch[1]);
      return page
        ? Promise.resolve(json(page))
        : Promise.resolve(new Response("not found", { status: 404 }));
    }

    if (url.endsWith("/index.md")) {
      return Promise.resolve(
        new Response(MARKDOWN, { status: 200, headers: { "content-type": "text/markdown" } })
      );
    }
    // Other manifests and the search index.
    return Promise.resolve(json([]));
  });
}

function visit(path: string) {
  window.history.pushState({}, "", path);
  return render(<App />);
}

describe("route precedence", () => {
  let warn: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.stubGlobal("fetch", mockFetch());
    // matchMedia is used by the theme preference; jsdom does not implement it.
    vi.stubGlobal(
      "matchMedia",
      vi.fn().mockReturnValue({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })
    );
    warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    warn.mockRestore();
    vi.unstubAllGlobals();
    window.history.pushState({}, "", "/");
  });

  it("serves a post from the /:slug catch-all", async () => {
    // The case that matters: the generated landing-page routes must not shadow this.
    visit("/some-real-post-slug");

    expect(
      await screen.findByRole("heading", { level: 1, name: "A Real Post" })
    ).toBeInTheDocument();
  });

  it("serves a post whose slug begins with a registry page's name", async () => {
    // A route matching by prefix rather than by whole path segment would shadow this —
    // `/about-my-new-job` is a post, not the `/about` landing page.
    visit("/about-my-new-job");

    expect(
      await screen.findByRole("heading", { level: 1, name: "A Real Post" })
    ).toBeInTheDocument();
  });

  it("renders /apps from the page registry", async () => {
    // /apps is the first route served from site/pages/ rather than a component. The
    // differential test that proved the conversion was deleted with the old component,
    // so this is what remains to catch the route going blank.
    visit("/apps");

    expect(await screen.findByRole("heading", { level: 1, name: "Apps" })).toBeInTheDocument();
    expect(await screen.findByText("Logstead")).toBeInTheDocument();
  });

  it("renders /bitesize-javascript from the page registry", async () => {
    visit("/bitesize-javascript");

    expect(
      await screen.findByRole("heading", { level: 1, name: "Bitesize JavaScript" })
    ).toBeInTheDocument();
    // The second grid's heading, which is the only thing distinguishing the two grids.
    expect(
      await screen.findByRole("heading", { level: 2, name: "Other JavaScript Tutorials" })
    ).toBeInTheDocument();
  });

  it("renders /teaching from the page registry", async () => {
    visit("/teaching");

    expect(
      await screen.findByRole("heading", { level: 1, name: "Classes I Teach" })
    ).toBeInTheDocument();
    // The two grids the `current: boolean` filter used to produce.
    expect(
      await screen.findByRole("heading", { level: 2, name: "Current Courses" })
    ).toBeInTheDocument();
    expect(
      await screen.findByRole("heading", { level: 2, name: "Previous Courses" })
    ).toBeInTheDocument();
  });

  it("renders /about from the page registry", async () => {
    visit("/about");

    expect(await screen.findByRole("heading", { level: 1, name: "About Me" })).toBeInTheDocument();
    // One heading from each of the four block types this page needs.
    for (const name of ["Background", "Skills & Technologies", "Doctoral Research", "Connect"]) {
      expect(await screen.findByRole("heading", { level: 2, name })).toBeInTheDocument();
    }
  });

  it("renders /teaching/cmst388-tips from the page registry", async () => {
    // A registry page whose slug contains a slash, and the only one with breadcrumbs.
    visit("/teaching/cmst388-tips");

    expect(
      await screen.findByRole("heading", { level: 1, name: "CMST 388 Project Tips" })
    ).toBeInTheDocument();
    expect(
      await screen.findByRole("heading", { level: 2, name: "Additional Resources" })
    ).toBeInTheDocument();
  });

  it("still routes the nested teaching pages ahead of the catch-all", async () => {
    // /teaching/cmst388-tips/:slug must not be swallowed by /:slug either.
    visit("/teaching/cmst388-tips/project-1-javascript-selectors");

    expect(
      await screen.findByRole("heading", { level: 1, name: "A Real Post" })
    ).toBeInTheDocument();
  });
});
