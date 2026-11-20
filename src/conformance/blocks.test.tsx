/**
 * Conformance: runs against every theme.
 *
 * What a landing-page block must do regardless of how it looks: render its content, route
 * internal links without a reload, protect external links, and treat authored Markdown as
 * untrusted. Styling checks (section spacing, tone colors) belong to each theme's own tests.
 */
import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import activeTheme from "@theme";
import { siteConfig } from "../lib/site-config";
import type {
  BadgeListBlock,
  CardGridBlock,
  CardItem,
  ColumnsBlock,
  PanelBlock,
  ProseBlock,
  SocialLinksBlock,
} from "../lib/page-schema";
import { clickable, mountBlock } from "./helpers";

const BLOCK_TYPES = ["prose", "card-grid", "columns", "badge-list", "panel", "social-links"];

describe("the active theme's block registry", () => {
  it("has a renderer for every block type", () => {
    expect(Object.keys(activeTheme.blocks).sort()).toEqual([...BLOCK_TYPES].sort());
  });
});

describe("prose", () => {
  const prose = (markdown: string): ProseBlock => ({
    id: "p",
    type: "prose",
    version: 1,
    markdown,
  });

  it("renders markdown", async () => {
    await mountBlock(prose("Some **bold** copy."));
    expect(screen.getByText("bold")).toBeInTheDocument();
  });

  it("renders a title as an h2", async () => {
    await mountBlock({ ...prose("Body."), title: "Additional Resources" });
    expect(
      screen.getByRole("heading", { level: 2, name: "Additional Resources" })
    ).toBeInTheDocument();
  });

  it("renders raw HTML as text rather than parsing it", async () => {
    // Block prose is admin-editable, so it is untrusted.
    await mountBlock(prose("before <script>window.pwned=1</script> after"));
    expect(screen.getByText(/window.pwned=1/)).toBeInTheDocument();
    expect(document.querySelector("script")).toBeNull();
    expect((window as unknown as Record<string, unknown>).pwned).toBeUndefined();
  });

  it("renders an injected img tag as text, not an element", async () => {
    await mountBlock(prose('<img src=x onerror="window.pwned=1">'));
    expect(document.querySelector("img")).toBeNull();
  });

  it("routes an internal markdown link client-side", async () => {
    await mountBlock(prose("see [somewhere](/somewhere)"));
    await userEvent.click(screen.getByRole("link", { name: /somewhere/ }));
    expect(screen.getByText("somewhere page")).toBeInTheDocument();
  });

  it("opens an external markdown link in a new tab with rel protection", async () => {
    await mountBlock(prose("see [UMGC](https://webapps.umgc.edu/soc/us.cfm)"));
    const link = screen.getByRole("link", { name: /UMGC/ });
    expect(link).toHaveAttribute("href", "https://webapps.umgc.edu/soc/us.cfm");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link.getAttribute("rel")).toContain("noopener");
    expect(link.getAttribute("rel")).toContain("noreferrer");
  });

  it("neutralises a javascript: markdown link", async () => {
    await mountBlock(prose("[click](javascript:window.pwned=1)"));
    const hrefs = [...document.querySelectorAll("a")].map((a) => a.getAttribute("href") ?? "");
    expect(hrefs.some((h) => h.toLowerCase().startsWith("javascript:"))).toBe(false);
    expect(screen.getByText("click")).toBeInTheDocument();
  });

  it("does not treat a protocol-relative link as internal", async () => {
    await mountBlock(prose("[x](//evil.test/path)"));
    // Must be handled as external, so it cannot be fed to the client-side router.
    expect(screen.getByRole("link", { name: /^x\b/ })).toHaveAttribute("target", "_blank");
  });
});

describe("card-grid", () => {
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

  it("renders a title as an h2 and no heading when untitled", async () => {
    const { unmount } = await mountBlock(grid({ title: "Current Courses" }));
    expect(screen.getByRole("heading", { level: 2, name: "Current Courses" })).toBeInTheDocument();
    unmount();

    await mountBlock(grid());
    expect(screen.queryByRole("heading", { level: 2 })).not.toBeInTheDocument();
  });

  it("renders meta, description and tags when present", async () => {
    await mountBlock(
      grid({
        items: [card({ meta: "3 Credits", description: "A course.", tags: ["React", "AWS"] })],
      })
    );
    for (const text of ["3 Credits", "A course.", "React", "AWS"]) {
      expect(screen.getByText(text)).toBeInTheDocument();
    }
  });

  it("shows the empty text when there are no items", async () => {
    await mountBlock(grid({ items: [], emptyText: "No apps listed yet." }));
    expect(screen.getByText("No apps listed yet.")).toBeInTheDocument();
  });

  it("renders every item", async () => {
    await mountBlock(
      grid({ items: [card({ id: "a", title: "Alpha" }), card({ id: "b", title: "Beta" })] })
    );
    expect(screen.getByText("Alpha")).toBeInTheDocument();
    expect(screen.getByText("Beta")).toBeInTheDocument();
  });

  describe("card headers", () => {
    it("links the badge to a tag filter, separately from the title", async () => {
      await mountBlock(
        grid({ items: [card({ badge: { text: "CMST 388", tagFilter: "cmst-388" } })] })
      );
      const link = screen.getByRole("link", { name: "CMST 388" });
      expect(link).toHaveAttribute("href", "/posts?tag=cmst-388");

      await userEvent.click(link);
      expect(screen.getByText("posts page")).toBeInTheDocument();
    });

    it("encodes a tag filter into the query string", async () => {
      await mountBlock(grid({ items: [card({ badge: { text: "C&C", tagFilter: "a&b" } })] }));
      expect(screen.getByRole("link", { name: "C&C" })).toHaveAttribute("href", "/posts?tag=a%26b");
    });

    it("links the title to an internal destination when it has one", async () => {
      await mountBlock(
        grid({ items: [card({ badge: { text: "1" }, titleLink: { to: "/somewhere" } })] })
      );
      const link = screen.getByRole("link", { name: /Card One/ });
      expect(link).toHaveAttribute("href", "/somewhere");
      expect(screen.getByText("1")).toBeInTheDocument();
    });

    it("links neither badge nor title when the badge is only a label", async () => {
      await mountBlock(grid({ items: [card({ badge: { text: "Finance" } })] }));
      expect(screen.getByText("Finance")).toBeInTheDocument();
      expect(screen.queryByRole("link")).not.toBeInTheDocument();
    });

    it("renders a plain title when there is no badge and no link", async () => {
      await mountBlock(grid());
      expect(screen.getByText("Card One")).toBeInTheDocument();
      expect(screen.queryByRole("link")).not.toBeInTheDocument();
    });

    it("marks an external title link as external", async () => {
      await mountBlock(grid({ items: [card({ titleLink: { href: "https://example.test" } })] }));
      const link = screen.getByRole("link", { name: /Card One/ });
      expect(link).toHaveAttribute("target", "_blank");
      expect(link.getAttribute("rel")).toContain("noopener");
    });
  });

  describe("actions", () => {
    it("routes an internal action client-side", async () => {
      await mountBlock(
        grid({
          items: [card({ actions: [{ label: "Project Tips", to: "/somewhere", primary: true }] })],
        })
      );
      await userEvent.click(clickable("Project Tips"));
      expect(screen.getByText("somewhere page")).toBeInTheDocument();
    });

    it("gives an external action target and rel", async () => {
      await mountBlock(
        grid({ items: [card({ actions: [{ label: "Source", href: "https://github.test/x" }] })] })
      );
      const link = screen.getByRole("link", { name: /Source/ });
      expect(link).toHaveAttribute("href", "https://github.test/x");
      expect(link).toHaveAttribute("target", "_blank");
      expect(link.getAttribute("rel")).toContain("noopener");
      expect(link.getAttribute("rel")).toContain("noreferrer");
    });

    it("renders no action controls when the item has none", async () => {
      await mountBlock(grid());
      expect(screen.queryByRole("button")).not.toBeInTheDocument();
      expect(screen.queryByRole("link")).not.toBeInTheDocument();
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

  it("renders each column's title as an h2 and its markdown", async () => {
    await mountBlock(columns());
    expect(screen.getByRole("heading", { level: 2, name: "Background" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "This Site" })).toBeInTheDocument();
    expect(screen.getByText("First column.")).toBeInTheDocument();
    expect(screen.getByText("Second column.")).toBeInTheDocument();
  });

  it("renders every column when given more than four", async () => {
    // A theme may limit how many sit side by side, but no content may be dropped.
    const many = Array.from({ length: 5 }, (_, i) => ({
      title: `Col ${i}`,
      markdown: `Body ${i}`,
    }));
    await mountBlock(columns({ columns: many }));
    for (let i = 0; i < 5; i++) expect(screen.getByText(`Body ${i}`)).toBeInTheDocument();
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

  it("renders every item", async () => {
    await mountBlock(badges());
    expect(screen.getByText("Python")).toBeInTheDocument();
    expect(screen.getByText("TypeScript")).toBeInTheDocument();
  });

  it("renders a title as an h2, and no heading when untitled", async () => {
    const { unmount } = await mountBlock(badges({ title: "Skills & Technologies" }));
    expect(
      screen.getByRole("heading", { level: 2, name: "Skills & Technologies" })
    ).toBeInTheDocument();
    unmount();

    await mountBlock(badges());
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

  it("renders title, lead and prose", async () => {
    await mountBlock(panel());
    expect(
      screen.getByRole("heading", { level: 2, name: "Doctoral Research" })
    ).toBeInTheDocument();
    expect(screen.getByText("A Paper Title")).toBeInTheDocument();
    expect(screen.getByText("The abstract.")).toBeInTheDocument();
  });

  it("renders without a lead", async () => {
    await mountBlock(panel({ lead: undefined }));
    expect(screen.getByText("The abstract.")).toBeInTheDocument();
    expect(screen.queryByText("A Paper Title")).not.toBeInTheDocument();
  });
});

describe("social-links", () => {
  const social: SocialLinksBlock = { id: "s", type: "social-links", version: 1, title: "Connect" };

  it("renders one external link per configured profile", async () => {
    // Sourced from site.config.json rather than page data.
    await mountBlock(social);
    for (const profile of siteConfig.social) {
      const link = screen.getByRole("link", { name: new RegExp(profile.label) });
      expect(link).toHaveAttribute("href", profile.href);
      expect(link).toHaveAttribute("target", "_blank");
    }
    expect(screen.getAllByRole("link")).toHaveLength(siteConfig.social.length);
  });
});
