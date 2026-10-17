/**
 * Tests for each block renderer.
 *
 * Weighted toward the things that are easy to get wrong and invisible when they are:
 * which arrangement a card header picks, whether an internal link routes or reloads,
 * whether an external link carries `rel="noopener noreferrer"`, and whether raw HTML in
 * prose is rendered as text.
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import type {
  BadgeListBlock,
  CardGridBlock,
  CardItem,
  ColumnsBlock,
  PanelBlock,
  ProseBlock,
  SocialLinksBlock,
} from "../../lib/page-schema";
import { ProseBlockView } from "./blocks/prose-block";
import { CardGridBlockView } from "./blocks/card-grid-block";
import { ColumnsBlockView } from "./blocks/columns-block";
import { BadgeListBlockView } from "./blocks/badge-list-block";
import { PanelBlockView } from "./blocks/panel-block";
import { SocialLinksBlockView } from "./blocks/social-links-block";
import { BLOCK_REGISTRY, RENDERABLE_BLOCK_TYPES } from "./block-registry";
import { siteConfig } from "../../lib/site-config";

/** Renders inside a router, with extra routes so navigation is observable. */
function mount(ui: React.ReactNode) {
  return render(
    <MemoryRouter initialEntries={["/start"]}>
      <Routes>
        <Route path="/start" element={<>{ui}</>} />
        <Route path="/posts" element={<p>posts page</p>} />
        <Route path="/somewhere" element={<p>somewhere page</p>} />
      </Routes>
    </MemoryRouter>
  );
}

const card = (overrides: Partial<CardItem> = {}): CardItem => ({
  id: "one",
  title: "Card One",
  ...overrides,
});

const grid = (overrides: Partial<CardGridBlock> = {}): CardGridBlock => ({
  id: "g",
  type: "card-grid",
  version: 1,
  items: [card()],
  ...overrides,
});

describe("prose spacing", () => {
  // The class here and the rules in src/styles.css are a pair with nothing else
  // connecting them. This half asserts the class is applied; `verify-build.js` asserts
  // the rules reach the shipped CSS, which is where Vitest cannot help — it stubs CSS
  // imports to an empty string by default.
  it("applies the class in every block that renders prose", () => {
    for (const ui of [
      <ProseBlockView key="p" block={{ id: "p", type: "prose", version: 1, markdown: "x" }} />,
      <ColumnsBlockView
        key="c"
        block={{
          id: "c",
          type: "columns",
          version: 1,
          columns: [
            { title: "A", markdown: "x" },
            { title: "B", markdown: "y" },
          ],
        }}
      />,
      <PanelBlockView key="pa" block={{ id: "pa", type: "panel", version: 1, markdown: "x" }} />,
    ]) {
      const { unmount } = mount(ui);
      expect(document.querySelectorAll(".landing-prose").length).toBeGreaterThan(0);
      unmount();
    }
  });
});

describe("the block registry", () => {
  it("has a renderer for every type the validator accepts", () => {
    // Drift here means stored content validates but silently does not render.
    expect([...RENDERABLE_BLOCK_TYPES].sort()).toEqual([
      "badge-list",
      "card-grid",
      "columns",
      "panel",
      "prose",
      "social-links",
    ]);
  });

  it("is keyed by the type each component renders", () => {
    expect(Object.keys(BLOCK_REGISTRY)).toHaveLength(6);
  });
});

describe("prose", () => {
  const prose = (markdown: string): ProseBlock => ({
    id: "p",
    type: "prose",
    version: 1,
    markdown,
  });

  it("renders markdown", () => {
    mount(<ProseBlockView block={prose("Some **bold** copy.")} />);

    expect(screen.getByText("bold")).toBeInTheDocument();
  });

  it("renders raw HTML as text rather than parsing it", () => {
    // The reason this component exists rather than reusing content-renderer.tsx, which
    // enables rehypeRaw. Block prose becomes admin-editable and so is untrusted.
    mount(<ProseBlockView block={prose("before <script>window.pwned=1</script> after")} />);

    expect(screen.getByText(/window.pwned=1/)).toBeInTheDocument();
    expect(document.querySelector("script")).toBeNull();
    expect((window as unknown as Record<string, unknown>).pwned).toBeUndefined();
  });

  it("renders an injected img tag as text, not an element", () => {
    mount(<ProseBlockView block={prose('<img src=x onerror="window.pwned=1">')} />);

    expect(document.querySelector("img")).toBeNull();
  });

  it("wraps content in the class the spacing rule targets", () => {
    // jsdom does not load src/styles.css, so the visual effect is not testable here.
    // What is testable is that the hook the rule depends on is present — without it,
    // every prose block silently regains the browser's default paragraph margins.
    mount(<ProseBlockView block={prose("A paragraph.")} />);

    const wrapper = document.querySelector(".landing-prose");
    expect(wrapper).not.toBeNull();
    expect(wrapper?.querySelector("p")?.textContent).toBe("A paragraph.");
  });

  it("routes an internal markdown link client-side", async () => {
    // The page this replaces used a plain <a>, which caused a full reload.
    mount(<ProseBlockView block={prose("see [somewhere](/somewhere)")} />);

    await userEvent.click(screen.getByRole("link", { name: /somewhere/ }));

    expect(screen.getByText("somewhere page")).toBeInTheDocument();
  });

  it("opens an external markdown link in a new tab with rel protection", () => {
    mount(<ProseBlockView block={prose("see [UMGC](https://webapps.umgc.edu/soc/us.cfm)")} />);
    const link = screen.getByRole("link", { name: /UMGC/ });

    expect(link).toHaveAttribute("href", "https://webapps.umgc.edu/soc/us.cfm");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link.getAttribute("rel")).toContain("noopener");
    expect(link.getAttribute("rel")).toContain("noreferrer");
  });

  it("neutralises a javascript: markdown link", () => {
    // react-markdown sanitises URLs by default, reducing this to an empty href — so
    // there is no link role to query. Assert the property that matters instead: no
    // anchor anywhere carries a javascript: destination. Written this way so a future
    // config change that disables the sanitiser cannot pass unnoticed.
    mount(<ProseBlockView block={prose("[click](javascript:window.pwned=1)")} />);

    const hrefs = [...document.querySelectorAll("a")].map((a) => a.getAttribute("href") ?? "");
    expect(hrefs.some((h) => h.toLowerCase().startsWith("javascript:"))).toBe(false);
    // The label text survives; only the destination is dropped.
    expect(screen.getByText("click")).toBeInTheDocument();
  });

  it("does not treat a protocol-relative link as internal", () => {
    mount(<ProseBlockView block={prose("[x](//evil.test/path)")} />);
    const link = screen.getByRole("link", { name: "x" });

    // Must be external-handled, so it cannot be fed to the client-side router.
    expect(link).toHaveAttribute("target", "_blank");
  });
});

describe("card-grid", () => {
  it("renders a title as an h2 and omits the header when untitled", () => {
    const { unmount } = mount(<CardGridBlockView block={grid({ title: "Current Courses" })} />);
    expect(screen.getByRole("heading", { level: 2, name: "Current Courses" })).toBeInTheDocument();
    unmount();

    mount(<CardGridBlockView block={grid()} />);
    expect(screen.queryByRole("heading", { level: 2 })).not.toBeInTheDocument();
  });

  it("renders meta, description and tags when present", () => {
    const item = card({ meta: "3 Credits", description: "A course.", tags: ["React", "AWS"] });
    mount(<CardGridBlockView block={grid({ items: [item] })} />);

    expect(screen.getByText("3 Credits")).toBeInTheDocument();
    expect(screen.getByText("A course.")).toBeInTheDocument();
    expect(screen.getByText("React")).toBeInTheDocument();
    expect(screen.getByText("AWS")).toBeInTheDocument();
  });

  describe("section count", () => {
    // Cloudscape renders a section wrapper even when the section's content function
    // returns null, and that wrapper carries spacing. Declaring all four sections and
    // returning null from the unused ones added 76px to every card on
    // /bitesize-javascript — measured in Chrome as 200px per card against the old
    // component's 124px. Nothing text-based caught it, because the text was identical.
    const sectionCount = () => document.querySelectorAll('[class*="awsui_section_"]').length;

    it("renders one section for an item with only a description", () => {
      mount(<CardGridBlockView block={grid({ items: [card({ description: "d" })] })} />);

      expect(sectionCount()).toBe(1);
    });

    it("renders no sections for an item with only a title", () => {
      mount(<CardGridBlockView block={grid({ items: [card()] })} />);

      expect(sectionCount()).toBe(0);
    });

    it("renders one section per field the grid actually uses", () => {
      const item = card({
        meta: "3 Credits",
        description: "d",
        tags: ["React"],
        actions: [{ label: "Go", to: "/somewhere" }],
      });
      mount(<CardGridBlockView block={grid({ items: [item] })} />);

      expect(sectionCount()).toBe(4);
    });

    it("includes a field used by only some items in the grid", () => {
      // The section list is per grid, so every card lines up with its neighbours even
      // when one of them has nothing to put in a section.
      const items = [card({ description: "d" }), { ...card({ id: "two" }), meta: "m" }];
      mount(<CardGridBlockView block={grid({ items })} />);

      expect(sectionCount()).toBe(2 * items.length);
    });
  });

  it("shows the empty text when there are no items", () => {
    mount(<CardGridBlockView block={grid({ items: [], emptyText: "No apps listed yet." })} />);

    expect(screen.getByText("No apps listed yet.")).toBeInTheDocument();
  });

  describe("card header arrangements", () => {
    it("links the badge separately when it carries a tag filter", async () => {
      // teaching: the course code filters the blog, the title is plain text.
      const item = card({ badge: { text: "CMST 388", tagFilter: "cmst-388" } });
      mount(<CardGridBlockView block={grid({ items: [item] })} />);

      const link = screen.getByRole("link", { name: "CMST 388" });
      expect(link).toHaveAttribute("href", "/posts?tag=cmst-388");

      await userEvent.click(link);
      expect(screen.getByText("posts page")).toBeInTheDocument();
    });

    it("encodes a tag filter into the query string", () => {
      const item = card({ badge: { text: "C&C", tagFilter: "a&b" } });
      mount(<CardGridBlockView block={grid({ items: [item] })} />);

      expect(screen.getByRole("link", { name: "C&C" })).toHaveAttribute("href", "/posts?tag=a%26b");
    });

    it("puts the badge inside the title link when there is no tag filter", () => {
      // bitesize: the lesson number is part of the link.
      const item = card({ badge: { text: "1" }, titleLink: { to: "/somewhere" } });
      mount(<CardGridBlockView block={grid({ items: [item] })} />);

      const link = screen.getByRole("link", { name: /1\s*Card One/ });
      expect(link).toHaveAttribute("href", "/somewhere");
    });

    it("links neither badge nor title when the badge is only a label", () => {
      // apps: the category is a label.
      const item = card({ badge: { text: "Finance" } });
      mount(<CardGridBlockView block={grid({ items: [item] })} />);

      expect(screen.getByText("Finance")).toBeInTheDocument();
      expect(screen.queryByRole("link")).not.toBeInTheDocument();
    });

    it("renders a plain title when there is no badge and no link", () => {
      mount(<CardGridBlockView block={grid({ items: [card()] })} />);

      expect(screen.getByText("Card One")).toBeInTheDocument();
      expect(screen.queryByRole("link")).not.toBeInTheDocument();
    });

    it("marks an external title link as external", () => {
      const item = card({ titleLink: { href: "https://example.test" } });
      mount(<CardGridBlockView block={grid({ items: [item] })} />);
      const link = screen.getByRole("link", { name: /Card One/ });

      expect(link).toHaveAttribute("target", "_blank");
      expect(link.getAttribute("rel")).toContain("noopener");
    });
  });

  describe("actions", () => {
    it("routes an internal action client-side", async () => {
      const item = card({ actions: [{ label: "Project Tips", to: "/somewhere", primary: true }] });
      mount(<CardGridBlockView block={grid({ items: [item] })} />);

      await userEvent.click(screen.getByRole("button", { name: "Project Tips" }));

      expect(screen.getByText("somewhere page")).toBeInTheDocument();
    });

    it("gives an external action target and rel", () => {
      const item = card({ actions: [{ label: "Source", href: "https://github.test/x" }] });
      mount(<CardGridBlockView block={grid({ items: [item] })} />);
      const link = screen.getByRole("link", { name: /Source/ });

      expect(link).toHaveAttribute("href", "https://github.test/x");
      expect(link).toHaveAttribute("target", "_blank");
      expect(link.getAttribute("rel")).toContain("noopener");
      expect(link.getAttribute("rel")).toContain("noreferrer");
    });

    it("renders no action area when the item has none", () => {
      mount(<CardGridBlockView block={grid({ items: [card()] })} />);

      expect(screen.queryByRole("button")).not.toBeInTheDocument();
    });
  });

  describe("tone", () => {
    // Tone is semantic in the data and becomes a colour only here, so the mapping is
    // worth asserting rather than assuming.
    const toneClass = (tone: CardGridBlock["tone"]) => {
      const { unmount } = mount(
        <CardGridBlockView block={grid({ tone, items: [card({ badge: { text: "B" } })] })} />
      );
      const className = screen.getByText("B").className;
      unmount();
      return className;
    };

    it("maps active, neutral and muted to three distinct colours", () => {
      const active = toneClass("active");
      const neutral = toneClass("neutral");
      const muted = toneClass("muted");

      expect(new Set([active, neutral, muted]).size).toBe(3);
    });

    it("defaults to the neutral colour", () => {
      expect(toneClass(undefined)).toBe(toneClass("neutral"));
    });
  });
});

describe("columns", () => {
  const columns = (overrides: Partial<ColumnsBlock> = {}): ColumnsBlock => ({
    id: "c",
    type: "columns",
    version: 1,
    columns: [
      { title: "Background", markdown: "First column." },
      { title: "This Site", markdown: "Second column." },
    ],
    ...overrides,
  });

  it("renders each column's title as an h2 and its markdown", () => {
    mount(<ColumnsBlockView block={columns()} />);

    expect(screen.getByRole("heading", { level: 2, name: "Background" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "This Site" })).toBeInTheDocument();
    expect(screen.getByText("First column.")).toBeInTheDocument();
    expect(screen.getByText("Second column.")).toBeInTheDocument();
  });

  it("renders every column when given more than four", () => {
    // The column count is clamped for ColumnLayout, but no content may be dropped.
    const many = Array.from({ length: 5 }, (_, i) => ({
      title: `Col ${i}`,
      markdown: `Body ${i}`,
    }));
    mount(<ColumnsBlockView block={columns({ columns: many })} />);

    for (let i = 0; i < 5; i++) {
      expect(screen.getByText(`Body ${i}`)).toBeInTheDocument();
    }
  });
});

describe("badge-list", () => {
  const badges = (overrides: Partial<BadgeListBlock> = {}): BadgeListBlock => ({
    id: "b",
    type: "badge-list",
    version: 1,
    items: ["Python", "TypeScript"],
    ...overrides,
  });

  it("renders every item", () => {
    mount(<BadgeListBlockView block={badges()} />);

    expect(screen.getByText("Python")).toBeInTheDocument();
    expect(screen.getByText("TypeScript")).toBeInTheDocument();
  });

  it("renders a title as an h2", () => {
    mount(<BadgeListBlockView block={badges({ title: "Skills & Technologies" })} />);

    expect(
      screen.getByRole("heading", { level: 2, name: "Skills & Technologies" })
    ).toBeInTheDocument();
  });

  it("renders without a container when untitled", () => {
    mount(<BadgeListBlockView block={badges()} />);

    expect(screen.queryByRole("heading")).not.toBeInTheDocument();
  });
});

describe("panel", () => {
  const panel = (overrides: Partial<PanelBlock> = {}): PanelBlock => ({
    id: "pa",
    type: "panel",
    version: 1,
    title: "Doctoral Research",
    lead: "A Paper Title",
    markdown: "The abstract.",
    ...overrides,
  });

  it("renders title, lead and prose", () => {
    mount(<PanelBlockView block={panel()} />);

    expect(
      screen.getByRole("heading", { level: 2, name: "Doctoral Research" })
    ).toBeInTheDocument();
    expect(screen.getByText("A Paper Title")).toBeInTheDocument();
    expect(screen.getByText("The abstract.")).toBeInTheDocument();
  });

  it("renders without a lead", () => {
    mount(<PanelBlockView block={panel({ lead: undefined })} />);

    expect(screen.getByText("The abstract.")).toBeInTheDocument();
    expect(screen.queryByText("A Paper Title")).not.toBeInTheDocument();
  });
});

describe("social-links", () => {
  const social: SocialLinksBlock = { id: "s", type: "social-links", version: 1, title: "Connect" };

  it("renders one external link per configured profile", () => {
    // Sourced from site.config.json rather than page data, so the assertion is against
    // the config — adding a profile there should appear here without a page edit.
    mount(<SocialLinksBlockView block={social} />);

    for (const profile of siteConfig.social) {
      const link = screen.getByRole("link", { name: new RegExp(profile.label) });
      expect(link).toHaveAttribute("href", profile.href);
      expect(link).toHaveAttribute("target", "_blank");
    }
  });

  it("renders the configured number of links", () => {
    mount(<SocialLinksBlockView block={social} />);

    expect(screen.getAllByRole("link")).toHaveLength(siteConfig.social.length);
  });
});
