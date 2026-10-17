/**
 * Tests for the generic page renderer: metadata, breadcrumbs, and the leniency rules.
 *
 * Block-level rendering is covered in `blocks.test.tsx`.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import type { Block, LandingPage } from "../../lib/page-schema";
import { LandingPageView } from "./landing-page";

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

function renderPage(p: LandingPage) {
  return render(
    <MemoryRouter initialEntries={["/example"]}>
      <Routes>
        <Route path="/example" element={<LandingPageView page={p} />} />
        <Route path="/teaching" element={<p>teaching page</p>} />
      </Routes>
    </MemoryRouter>
  );
}

describe("page metadata", () => {
  it("renders the header title and description", () => {
    renderPage(page({ header: { title: "Classes I Teach", description: "Since 2007." } }));

    expect(screen.getByRole("heading", { level: 1, name: "Classes I Teach" })).toBeInTheDocument();
    expect(screen.getByText("Since 2007.")).toBeInTheDocument();
  });

  it("renders a header with no description", () => {
    // /bitesize-javascript shows a bare title.
    renderPage(page({ header: { title: "Bitesize JavaScript" } }));

    expect(
      screen.getByRole("heading", { level: 1, name: "Bitesize JavaScript" })
    ).toBeInTheDocument();
  });

  it("sets the document title from seo.title, not the header title", () => {
    // These genuinely differ: teaching shows "Classes I Teach" but titles the document
    // "Teaching".
    renderPage(
      page({ seo: { title: "Teaching", description: "d" }, header: { title: "Classes I Teach" } })
    );

    expect(document.title).toBe("Teaching | Ian Carnaghan");
  });

  it("renders blocks in order", () => {
    const blocks: Block[] = [
      { id: "first", type: "prose", version: 1, markdown: "AAA" },
      { id: "second", type: "prose", version: 1, markdown: "BBB" },
    ];
    renderPage(page({ blocks }));

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

  it("renders no breadcrumb group when the page has none", () => {
    renderPage(page());

    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
  });

  // Cloudscape's BreadcrumbGroup renders each crumb twice — once visibly and once in an
  // aria-hidden copy used for the collapsed dropdown. Role queries see only the visible
  // one, so they are used here instead of getByText.
  const crumb = (name: string) => screen.getByRole("link", { name });

  it("renders every crumb", () => {
    renderPage(page({ breadcrumbs }));

    expect(crumb("Home")).toBeInTheDocument();
    expect(crumb("Teaching")).toBeInTheDocument();
    expect(crumb("CMST 388 Project Tips")).toBeInTheDocument();
  });

  it("navigates when a crumb with a destination is followed", async () => {
    renderPage(page({ breadcrumbs }));

    await userEvent.click(crumb("Teaching"));

    expect(screen.getByText("teaching page")).toBeInTheDocument();
  });

  it("does not navigate when the current-page crumb is clicked", async () => {
    // The page this replaces gave the final crumb href="#" and still routed it, which
    // made the current page a link to itself.
    renderPage(page({ breadcrumbs }));

    await userEvent.click(crumb("CMST 388 Project Tips"));

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

  it("skips an unknown block type and warns", () => {
    // Reachable when stored content is newer than the deployed build.
    const blocks = [
      { id: "intro", type: "prose", version: 1, markdown: "kept" },
      { id: "future", type: "carousel", version: 1 },
    ] as unknown as Block[];
    renderPage(page({ blocks }));

    expect(screen.getByText("kept")).toBeInTheDocument();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('no renderer for type "carousel"'));
  });

  it("renders the remaining blocks when one throws", () => {
    // A card-grid whose items are not an array throws inside Cloudscape. The point is
    // that the sibling prose block survives.
    const blocks = [
      { id: "before", type: "prose", version: 1, markdown: "before text" },
      { id: "broken", type: "card-grid", version: 1, items: null },
      { id: "after", type: "prose", version: 1, markdown: "after text" },
    ] as unknown as Block[];
    renderPage(page({ blocks }));

    expect(screen.getByText("before text")).toBeInTheDocument();
    expect(screen.getByText("after text")).toBeInTheDocument();
    expect(error).toHaveBeenCalledWith(
      expect.stringContaining('Block "broken" failed to render'),
      expect.anything(),
      expect.anything()
    );
  });

  it("still renders the header when every block fails", () => {
    const blocks = [
      { id: "broken", type: "card-grid", version: 1, items: null },
    ] as unknown as Block[];
    renderPage(page({ blocks }));

    expect(screen.getByRole("heading", { level: 1, name: "Example Page" })).toBeInTheDocument();
  });
});
