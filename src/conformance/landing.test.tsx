/**
 * Conformance: runs against every theme. Tests for the generic page renderer: metadata,
 * breadcrumbs, and the leniency rules.
 *
 * Block-level rendering is covered in `blocks.test.tsx`.
 */
import { siteConfig } from "../lib/site-config";
import { Suspense } from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import type { Block, LandingPage } from "../lib/page-schema";
import { LandingPageView } from "../core/pages/landing-route";

function page(overrides: Partial<LandingPage> = {}): LandingPage {
  return {
    schemaVersion: 1,
    slug: "example",
    seo: { title: "Example", description: "An example." },
    header: { title: "Example Page" },
    blocks: [{ id: "intro", type: "prose", version: 1, markdown: "Intro copy." }],
    ...overrides,
  };
}

/**
 * The theme loads its landing layout and blocks lazily, as the app does, so render inside
 * a Suspense boundary and wait for the page heading: the boundary reveals the whole page
 * at once, so once the heading is visible every block has loaded too.
 */
async function renderPage(p: LandingPage) {
  const result = render(
    <MemoryRouter initialEntries={["/example"]}>
      <Suspense fallback={null}>
        <Routes>
          <Route path="/example" element={<LandingPageView page={p} />} />
          <Route path="/teaching" element={<p>teaching page</p>} />
        </Routes>
      </Suspense>
    </MemoryRouter>
  );
  await screen.findByRole("heading", { level: 1 });
  return result;
}

describe("page metadata", () => {
  it("renders the header title and description", async () => {
    await renderPage(page({ header: { title: "Classes I Teach", description: "Since 2007." } }));

    expect(screen.getByRole("heading", { level: 1, name: "Classes I Teach" })).toBeInTheDocument();
    expect(screen.getByText("Since 2007.")).toBeInTheDocument();
  });

  it("renders a header with no description", async () => {
    // /bitesize-javascript shows a bare title.
    await renderPage(page({ header: { title: "Bitesize JavaScript" } }));

    expect(
      screen.getByRole("heading", { level: 1, name: "Bitesize JavaScript" })
    ).toBeInTheDocument();
  });

  it("sets the document title from seo.title, not the header title", async () => {
    // These genuinely differ: teaching shows "Classes I Teach" but titles the document
    // "Teaching".
    await renderPage(
      page({ seo: { title: "Teaching", description: "d" }, header: { title: "Classes I Teach" } })
    );

    expect(document.title).toBe(`Teaching | ${siteConfig.siteName}`);
  });

  it("renders blocks in order", async () => {
    const blocks: Block[] = [
      { id: "first", type: "prose", version: 1, markdown: "AAA" },
      { id: "second", type: "prose", version: 1, markdown: "BBB" },
    ];
    await renderPage(page({ blocks }));

    const text = document.body.textContent ?? "";
    expect(text.indexOf("AAA")).toBeLessThan(text.indexOf("BBB"));
  });
});

describe("breadcrumbs", () => {
  const breadcrumbs = [
    { text: "Home", to: "/" },
    { text: "Teaching", to: "/teaching" },
    { text: "CMST 388 Project Tips" },
  ];

  it("renders no breadcrumb group when the page has none", async () => {
    await renderPage(page());

    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
  });

  // Cloudscape's BreadcrumbGroup renders each crumb twice — once visibly and once in an
  // aria-hidden copy used for the collapsed dropdown. Role queries see only the visible
  // one, so they are used for crumbs that are links.
  const crumb = (name: string) => screen.getByRole("link", { name });
  // The current page's crumb has no destination, so a theme may render it as plain text.
  // Cloudscape also renders a hidden duplicate, so take the first match.
  const currentCrumb = () => screen.getAllByText("CMST 388 Project Tips")[0];

  it("renders every crumb", async () => {
    await renderPage(page({ breadcrumbs }));

    expect(crumb("Home")).toBeInTheDocument();
    expect(crumb("Teaching")).toBeInTheDocument();
    // The current page is shown, but how (a disabled link, plain text) is the theme's call.
    expect(currentCrumb()).toBeInTheDocument();
  });

  it("navigates when a crumb with a destination is followed", async () => {
    await renderPage(page({ breadcrumbs }));

    await userEvent.click(crumb("Teaching"));

    expect(screen.getByText("teaching page")).toBeInTheDocument();
  });

  it("does not navigate when the current-page crumb is clicked", async () => {
    // The page this replaces gave the final crumb href="#" and still routed it, which
    // made the current page a link to itself.
    await renderPage(page({ breadcrumbs }));

    await userEvent.click(currentCrumb());

    expect(screen.getByRole("heading", { level: 1, name: "Example Page" })).toBeInTheDocument();
  });
});

describe("leniency", () => {
  let warn: ReturnType<typeof vi.spyOn>;
  let error: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    error = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    warn.mockRestore();
    error.mockRestore();
  });

  it("skips an unknown block type and warns", async () => {
    // Reachable when stored content is newer than the deployed build.
    const blocks = [
      { id: "intro", type: "prose", version: 1, markdown: "kept" },
      { id: "future", type: "carousel", version: 1 },
    ] as unknown as Block[];
    await renderPage(page({ blocks }));

    expect(screen.getByText("kept")).toBeInTheDocument();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('no renderer for type "carousel"'));
  });

  it("renders the remaining blocks when one throws", async () => {
    // A card-grid whose items are not an array throws inside Cloudscape. The point is
    // that the sibling prose block survives.
    const blocks = [
      { id: "before", type: "prose", version: 1, markdown: "before text" },
      { id: "broken", type: "card-grid", version: 1, items: null },
      { id: "after", type: "prose", version: 1, markdown: "after text" },
    ] as unknown as Block[];
    await renderPage(page({ blocks }));

    expect(screen.getByText("before text")).toBeInTheDocument();
    expect(screen.getByText("after text")).toBeInTheDocument();
    expect(error).toHaveBeenCalledWith(
      expect.stringContaining('Block "broken" failed to render'),
      expect.anything(),
      expect.anything()
    );
  });

  it("still renders the header when every block fails", async () => {
    const blocks = [
      { id: "broken", type: "card-grid", version: 1, items: null },
    ] as unknown as Block[];
    await renderPage(page({ blocks }));

    expect(screen.getByRole("heading", { level: 1, name: "Example Page" })).toBeInTheDocument();
  });
});
