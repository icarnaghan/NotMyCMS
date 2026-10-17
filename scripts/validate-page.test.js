import { describe, it, expect } from "vitest";
import { KNOWN_BLOCK_TYPES, validatePage } from "./validate-page.js";

/** A minimal valid page. Tests clone and break one thing at a time. */
function page(overrides = {}) {
  return {
    schemaVersion: 1,
    slug: "example",
    seo: { title: "Example", description: "An example page." },
    header: { title: "Example" },
    blocks: [{ id: "intro", type: "prose", version: 1, markdown: "Hello." }],
    ...overrides,
  };
}

/** A card-grid page, for the item-level tests. */
function gridPage(items) {
  return page({
    blocks: [{ id: "grid", type: "card-grid", version: 1, items }],
  });
}

const card = (overrides = {}) => ({ id: "one", title: "One", ...overrides });

describe("a valid page", () => {
  it("passes", () => {
    expect(validatePage(page())).toEqual([]);
  });

  it("accepts every block type", () => {
    const blocks = [
      { id: "a", type: "prose", version: 1, markdown: "text" },
      { id: "b", type: "card-grid", version: 1, items: [] },
      {
        id: "c",
        type: "columns",
        version: 1,
        columns: [
          { title: "One", markdown: "a" },
          { title: "Two", markdown: "b" },
        ],
      },
      { id: "d", type: "badge-list", version: 1, items: ["React"] },
      { id: "e", type: "panel", version: 1, lead: "Lead", markdown: "body" },
      { id: "f", type: "social-links", version: 1 },
    ];

    expect(validatePage(page({ blocks }))).toEqual([]);
    expect(blocks.map((b) => b.type).sort()).toEqual([...KNOWN_BLOCK_TYPES].sort());
  });

  it("accepts a nested slug", () => {
    expect(validatePage(page({ slug: "teaching/cmst388-tips" }))).toEqual([]);
  });

  it("accepts a page with no nav entry", () => {
    // teaching/cmst388-tips is reachable but not listed in the navigation.
    expect(validatePage(page())).toEqual([]);
  });
});

describe("the page envelope", () => {
  it("requires schemaVersion 1", () => {
    expect(validatePage(page({ schemaVersion: 2 }))).toEqual([
      expect.stringContaining("schemaVersion must be 1"),
    ]);
  });

  it("rejects a non-object", () => {
    expect(validatePage(null)).toEqual(["page must be a JSON object"]);
    expect(validatePage([])).toEqual(["page must be a JSON object"]);
  });

  it("rejects an unknown page field", () => {
    expect(validatePage(page({ layout: "wide" }))).toEqual([
      expect.stringContaining("layout is not a recognised page field"),
    ]);
  });

  it("rejects a slug with leading or trailing slashes", () => {
    expect(validatePage(page({ slug: "/example" }))).toEqual([
      expect.stringContaining('slug must not start or end with "/"'),
    ]);
    expect(validatePage(page({ slug: "example/" }))).toEqual([
      expect.stringContaining('slug must not start or end with "/"'),
    ]);
  });

  it("rejects a slug with uppercase or spaces", () => {
    expect(validatePage(page({ slug: "My Page" }))).toEqual([
      expect.stringContaining("slug segments must be lowercase"),
    ]);
  });

  it("requires seo title and description", () => {
    expect(validatePage(page({ seo: { title: "Only" } }))).toEqual([
      expect.stringContaining("seo.description is required"),
    ]);
  });

  it("requires a header title but not a description", () => {
    // /bitesize-javascript shows a bare title.
    expect(validatePage(page({ header: { title: "Bitesize JavaScript" } }))).toEqual([]);
    expect(validatePage(page({ header: {} }))).toEqual([
      expect.stringContaining("header.title is required"),
    ]);
  });

  it("requires nav.order to be an integer when nav is present", () => {
    expect(validatePage(page({ nav: { label: "Example", order: "3" } }))).toEqual([
      expect.stringContaining("nav.order is required and must be an integer"),
    ]);
  });

  it("rejects an empty blocks array", () => {
    expect(validatePage(page({ blocks: [] }))).toEqual([
      expect.stringContaining("blocks must not be empty"),
    ]);
  });

  it("names the page slug in every message", () => {
    const problems = validatePage(page({ slug: "teaching", header: {} }));

    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/^teaching › /);
  });

  it("falls back to a placeholder when the slug itself is missing", () => {
    const problems = validatePage(page({ slug: undefined }));

    expect(problems.every((p) => p.startsWith("<unknown slug> › "))).toBe(true);
  });
});

describe("breadcrumbs", () => {
  it("accepts a trail whose last crumb has no destination", () => {
    const breadcrumbs = [
      { text: "Home", to: "/" },
      { text: "Teaching", to: "/teaching" },
      { text: "CMST 388 Project Tips" },
    ];

    expect(validatePage(page({ breadcrumbs }))).toEqual([]);
  });

  it("validates a crumb destination like any other internal link", () => {
    const breadcrumbs = [{ text: "Home", to: "https://evil.test" }];

    expect(validatePage(page({ breadcrumbs }))).toEqual([
      expect.stringContaining('breadcrumbs[0].to must start with "/"'),
      expect.stringContaining('breadcrumbs[0].to must not contain "//"'),
      expect.stringContaining('breadcrumbs[0].to must not contain ":"'),
    ]);
  });

  it("requires crumb text", () => {
    expect(validatePage(page({ breadcrumbs: [{ to: "/" }] }))).toEqual([
      expect.stringContaining("breadcrumbs[0].text is required"),
    ]);
  });
});

describe("blocks", () => {
  it("rejects an unknown block type", () => {
    const blocks = [{ id: "x", type: "carousel", version: 1 }];

    expect(validatePage(page({ blocks }))).toEqual([
      expect.stringContaining('blocks[0].type is not a recognised block type (got "carousel"'),
    ]);
  });

  it("rejects an unknown field on a known block type", () => {
    const blocks = [{ id: "x", type: "prose", version: 1, markdown: "a", align: "center" }];

    expect(validatePage(page({ blocks }))).toEqual([
      expect.stringContaining("blocks[0].align is not a recognised prose block field"),
    ]);
  });

  it("rejects a field that belongs to a different block type", () => {
    // `items` is valid on card-grid but not on prose; the allow-list is per type.
    const blocks = [{ id: "x", type: "prose", version: 1, markdown: "a", items: [] }];

    expect(validatePage(page({ blocks }))).toEqual([
      expect.stringContaining("blocks[0].items is not a recognised prose block field"),
    ]);
  });

  it("requires a block version of 1", () => {
    const blocks = [{ id: "x", type: "prose", version: 2, markdown: "a" }];

    expect(validatePage(page({ blocks }))).toEqual([
      expect.stringContaining("blocks[0].version must be 1"),
    ]);
  });

  it("rejects duplicate block ids", () => {
    const blocks = [
      { id: "same", type: "prose", version: 1, markdown: "a" },
      { id: "same", type: "prose", version: 1, markdown: "b" },
    ];

    expect(validatePage(page({ blocks }))).toEqual([
      expect.stringContaining("blocks[1].id is already used by another block"),
    ]);
  });

  it("rejects an id that is not slug-shaped", () => {
    const blocks = [{ id: "My Block", type: "prose", version: 1, markdown: "a" }];

    expect(validatePage(page({ blocks }))).toEqual([
      expect.stringContaining("blocks[0].id must be lowercase"),
    ]);
  });

  it("names the block index and field path", () => {
    const blocks = [
      { id: "a", type: "prose", version: 1, markdown: "ok" },
      { id: "b", type: "card-grid", version: 1, items: [card({ actions: [{ label: "x" }] })] },
    ];

    expect(validatePage(page({ blocks }))).toEqual([
      expect.stringContaining("blocks[1].items[0].actions[0] must have either `to`"),
    ]);
  });

  it("rejects a tone outside the semantic set", () => {
    // "green" was the old stored value; it is a Cloudscape colour, not a tone.
    const blocks = [{ id: "g", type: "card-grid", version: 1, tone: "green", items: [] }];

    expect(validatePage(page({ blocks }))).toEqual([
      expect.stringContaining("blocks[0].tone must be one of active, neutral, muted"),
    ]);
  });

  it("rejects a columns count the renderer has no mapping for", () => {
    const blocks = [{ id: "g", type: "card-grid", version: 1, columns: 4, items: [] }];

    expect(validatePage(page({ blocks }))).toEqual([
      expect.stringContaining("blocks[0].columns must be one of 1, 2, 3"),
    ]);
  });
});

describe("the columns block", () => {
  it("requires at least two columns", () => {
    const blocks = [
      { id: "c", type: "columns", version: 1, columns: [{ title: "One", markdown: "a" }] },
    ];

    expect(validatePage(page({ blocks }))).toEqual([
      expect.stringContaining("blocks[0].columns must have at least 2 columns"),
    ]);
  });

  it("requires a title and markdown per column", () => {
    const blocks = [
      {
        id: "c",
        type: "columns",
        version: 1,
        columns: [{ title: "One", markdown: "a" }, { title: "Two" }],
      },
    ];

    expect(validatePage(page({ blocks }))).toEqual([
      expect.stringContaining("blocks[0].columns[1].markdown is required"),
    ]);
  });
});

describe("card items", () => {
  it("requires an id and title", () => {
    expect(validatePage(gridPage([{}]))).toEqual([
      expect.stringContaining("items[0].id is required"),
      expect.stringContaining("items[0].title is required"),
    ]);
  });

  it("rejects duplicate item ids within a grid", () => {
    const problems = validatePage(gridPage([card(), card()]));

    expect(problems).toEqual([expect.stringContaining("items[1].id is already used in this grid")]);
  });

  it("accepts a badge with a tag filter", () => {
    // The stored value is the tag, not the finished /posts?tag=… URL.
    const item = card({ badge: { text: "CMST 388", tagFilter: "cmst-388" } });

    expect(validatePage(gridPage([item]))).toEqual([]);
  });

  it("rejects an unknown badge field", () => {
    const item = card({ badge: { text: "X", color: "green" } });

    expect(validatePage(gridPage([item]))).toEqual([
      expect.stringContaining("items[0].badge.color is not a recognised badge field"),
    ]);
  });

  it("accepts tags and actions", () => {
    const item = card({
      tags: ["React", "AWS"],
      actions: [
        { label: "Read the write-up", to: "/some-post", primary: true },
        { label: "Source", href: "https://github.com/example/repo" },
      ],
    });

    expect(validatePage(gridPage([item]))).toEqual([]);
  });

  it("rejects more than one primary action", () => {
    const item = card({
      actions: [
        { label: "A", to: "/a", primary: true },
        { label: "B", to: "/b", primary: true },
      ],
    });

    expect(validatePage(gridPage([item]))).toEqual([
      expect.stringContaining("items[0].actions has 2 primary actions, at most one is allowed"),
    ]);
  });

  it("requires an action label", () => {
    const item = card({ actions: [{ to: "/a" }] });

    expect(validatePage(gridPage([item]))).toEqual([
      expect.stringContaining("items[0].actions[0].label is required"),
    ]);
  });
});

describe("link validation", () => {
  const withLink = (link) => gridPage([card({ titleLink: link })]);

  it("accepts a root-relative internal path", () => {
    expect(validatePage(withLink({ to: "/teaching/cmst388-tips" }))).toEqual([]);
  });

  it("accepts http, https and mailto", () => {
    for (const href of [
      "http://example.test",
      "https://example.test/path?q=1",
      "mailto:someone@example.test",
    ]) {
      expect(validatePage(withLink({ href }))).toEqual([]);
    }
  });

  it("rejects a javascript: URL", () => {
    // The headline case: a stored link must never become script execution.
    expect(validatePage(withLink({ href: "javascript:alert(1)" }))).toEqual([
      expect.stringContaining("scheme must be one of http:, https:, mailto: (got javascript:)"),
    ]);
  });

  it("rejects a javascript: value smuggled through `to`", () => {
    expect(validatePage(withLink({ to: "javascript:alert(1)" }))).toEqual([
      expect.stringContaining('.to must start with "/"'),
      expect.stringContaining('.to must not contain ":"'),
    ]);
  });

  it("rejects a protocol-relative URL that would leave the site", () => {
    expect(validatePage(withLink({ to: "//evil.test/path" }))).toEqual([
      expect.stringContaining('.to must not contain "//"'),
    ]);
  });

  it("rejects an embedded // later in the path", () => {
    expect(validatePage(withLink({ to: "/teaching//evil.test" }))).toEqual([
      expect.stringContaining('.to must not contain "//"'),
    ]);
  });

  it("rejects a data: URL", () => {
    expect(validatePage(withLink({ href: "data:text/html,<script>alert(1)</script>" }))).toEqual([
      expect.stringContaining("scheme must be one of"),
    ]);
  });

  it("rejects a relative path as href", () => {
    expect(validatePage(withLink({ href: "some/path" }))).toEqual([
      expect.stringContaining("must be an absolute URL"),
    ]);
  });

  it("rejects both to and href on one link", () => {
    // Ambiguous: the renderer would have to guess whether to route or open a new tab.
    expect(validatePage(withLink({ to: "/a", href: "https://example.test" }))).toEqual([
      expect.stringContaining("must have either `to` or `href`, not both"),
    ]);
  });

  it("rejects a link with neither", () => {
    expect(validatePage(withLink({}))).toEqual([
      expect.stringContaining("must have either `to` (internal) or `href` (external)"),
    ]);
  });
});

describe("reporting", () => {
  it("returns every problem rather than stopping at the first", () => {
    const broken = page({
      schemaVersion: 9,
      header: {},
      seo: {},
      blocks: [{ id: "bad", type: "unknown-type", version: 3 }],
    });

    expect(validatePage(broken).length).toBeGreaterThan(3);
  });
});
