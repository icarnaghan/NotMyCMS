/**
 * Conformance: runs against every theme.
 *
 * Renders the whole app (core plus the active theme) with a mocked site and checks what a
 * visitor can do, using role and text queries only. A theme may differ in markup, in
 * whether a control is a link or a button, and in extras such as sorting, but each of these
 * behaviors must hold.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "../App";
import { KB, POSTS, stubBrowser } from "../test/site-fixtures";

/** Every link or button whose name matches, in document order. */
function clickables(name: RegExp | string, scope: HTMLElement = document.body) {
  const q = within(scope);
  return [...q.queryAllByRole("link", { name }), ...q.queryAllByRole("button", { name })];
}

/**
 * The search field on the page itself. Cloudscape keeps its (closed) search modal in the
 * DOM, so there can be a second field; the page's own comes first.
 */
const pageSearchbox = () => screen.getAllByRole("searchbox")[0];

const POST_TITLE = /^Post number \d+$/;
const GUIDE_TITLE = /^Guide number \d+$/;

async function visit(url: string) {
  window.history.pushState({}, "", url);
  render(<App />);
}

/** Titles of the list items currently shown. */
async function shownTitles(pattern: RegExp) {
  await waitFor(() => expect(clickables(pattern).length).toBeGreaterThan(0));
  return clickables(pattern).map(
    (el) => within(el).queryByText(pattern)?.textContent ?? el.textContent!.trim()
  );
}

beforeEach(() => {
  stubBrowser();
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  window.history.pushState({}, "", "/");
});

describe("posts list", () => {
  it("shows the first page of posts, twenty at a time, with the total", async () => {
    await visit("/posts");
    const titles = await shownTitles(POST_TITLE);
    expect(titles).toHaveLength(20);
    expect(await screen.findByRole("heading", { level: 1, name: /Posts/ })).toHaveTextContent("45");
  });

  it("moves to the next page and shows different posts", async () => {
    await visit("/posts");
    const first = await shownTitles(POST_TITLE);

    await userEvent.click(clickables(/^(Page )?2$/)[0]);

    await waitFor(async () => {
      const second = await shownTitles(POST_TITLE);
      expect(second).toHaveLength(20);
      expect(second.some((t) => first.includes(t))).toBe(false);
    });
  });

  it("opens straight onto the page named in the URL", async () => {
    await visit("/posts");
    const first = await shownTitles(POST_TITLE);
    cleanup();

    await visit("/posts?page=3");
    const third = await shownTitles(POST_TITLE);
    expect(third).toHaveLength(5); // 45 posts, 20 per page
    expect(third.some((t) => first.includes(t))).toBe(false);
  });

  it("filters by text", async () => {
    await visit("/posts");
    await shownTitles(POST_TITLE);

    await userEvent.type(pageSearchbox(), "number 07");

    await waitFor(async () => expect(await shownTitles(POST_TITLE)).toEqual(["Post number 07"]));
  });

  it("filters by the tag in the URL", async () => {
    const withTag = POSTS.filter((p) => p.tags.includes("react")).length;
    await visit("/posts?tag=react");
    await shownTitles(POST_TITLE);

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(`${withTag}/45`);
  });

  it("filters by tag when a tag is chosen in the list", async () => {
    const withTag = POSTS.filter((p) => p.tags.includes("aws")).length;
    await visit("/posts");
    await shownTitles(POST_TITLE);

    await userEvent.click(clickables("AWS")[0]);

    await waitFor(() =>
      expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(`${withTag}/45`)
    );
  });

  it("says so when nothing matches", async () => {
    await visit("/posts");
    await shownTitles(POST_TITLE);

    await userEvent.type(pageSearchbox(), "zzzzzz");

    expect(await screen.findByText("No matches found")).toBeInTheDocument();
  });
});

describe("knowledge base", () => {
  it("shows twenty-four articles a page and reaches the rest", async () => {
    await visit("/knowledge-base");
    expect(await shownTitles(GUIDE_TITLE)).toHaveLength(24);

    await userEvent.click(clickables(/^(Page )?2$/)[0]);

    await waitFor(async () => expect(await shownTitles(GUIDE_TITLE)).toHaveLength(KB.length - 24));
  });

  it("filters on title only", async () => {
    await visit("/knowledge-base");
    await shownTitles(GUIDE_TITLE);

    // Posts match on category and tags; the knowledge base does not.
    await userEvent.type(pageSearchbox(), "coding");

    expect(await screen.findByText("No matches found")).toBeInTheDocument();
  });
});

describe("categories and tags", () => {
  it("lists categories with their post counts", async () => {
    await visit("/categories");
    expect(
      await screen.findByRole("heading", { level: 1, name: /Categories/ })
    ).toBeInTheDocument();
    for (const label of ["Coding", "WordPress", "Hosting", "SEO"]) {
      expect(await screen.findByText(label)).toBeInTheDocument();
    }
    expect(screen.getAllByText(/\d+ posts?/).length).toBeGreaterThanOrEqual(4);
  });

  it("goes to the filtered posts list when a category is chosen", async () => {
    await visit("/categories");
    await userEvent.click(await screen.findByText("Hosting"));

    // Nothing in the fixture tags a post "hosting", so the filtered list is empty. What
    // matters is that the posts list opened with the filter applied.
    expect(await screen.findByRole("heading", { level: 1, name: /Posts/ })).toBeInTheDocument();
    expect(window.location.search).toBe("?tag=hosting");
    expect(await screen.findByDisplayValue("hosting")).toBeInTheDocument();
  });

  it("lists tags and goes to the filtered posts list", async () => {
    await visit("/tags");
    expect(await screen.findByRole("heading", { level: 1, name: /Tags/ })).toBeInTheDocument();
    await userEvent.click(await screen.findByText("React"));

    expect(await screen.findByRole("heading", { level: 1, name: /Posts/ })).toBeInTheDocument();
    expect(await screen.findByDisplayValue("react")).toBeInTheDocument();
  });
});

describe("article", () => {
  it("renders the title, headings, a table and an image", async () => {
    await visit("/post-07");
    expect(
      await screen.findByRole("heading", { level: 1, name: "A Rich Article" })
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "First section" })).toHaveAttribute(
      "id",
      "first-section"
    );
    expect(screen.getByRole("heading", { level: 3, name: "A subsection" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Name" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Alt text" })).toHaveAttribute(
      "src",
      "/content/posts/post-07/pic.png"
    );
  });

  it("links the table of contents to headings that exist", async () => {
    await visit("/post-07");
    await screen.findByRole("heading", { level: 1, name: "A Rich Article" });

    const contents = screen.getAllByRole("link", { name: "First section" });
    const target = contents[0].getAttribute("href")!;
    expect(target).toBe("#first-section");
    expect(document.getElementById(target.slice(1))).not.toBeNull();
    expect(screen.getAllByRole("link", { name: "Second section" })[0]).toHaveAttribute(
      "href",
      "#second-section"
    );
  });

  it("labels and shows fenced code", async () => {
    await visit("/post-07");
    const block = await screen.findByRole("group", { name: "TypeScript code block" });
    expect(block).toHaveTextContent("const answer");
  });

  it("offers a way to copy code", async () => {
    await visit("/post-07");
    const block = await screen.findByRole("group", { name: "TypeScript code block" });
    // Cloudscape's copy control names itself only through its icon; ours say "Copy".
    expect(within(block).getAllByRole("button").length).toBeGreaterThan(0);
  });

  it("shows related posts that share tags", async () => {
    await visit("/post-07");
    await screen.findByRole("heading", { level: 1, name: "A Rich Article" });
    expect(await screen.findByRole("heading", { name: "Related Posts" })).toBeInTheDocument();
  });

  it("goes to the posts list filtered by a tag", async () => {
    await visit("/post-07");
    await screen.findByRole("heading", { level: 1, name: "A Rich Article" });

    await userEvent.click(clickables("React")[0]);

    expect(await screen.findByRole("heading", { level: 1, name: /Posts/ })).toBeInTheDocument();
    expect(await screen.findByDisplayValue("react")).toBeInTheDocument();
  });

  it("serves a knowledge-base article", async () => {
    await visit("/knowledge-base/guide-03");
    expect(
      await screen.findByRole("heading", { level: 1, name: "A Rich Article" })
    ).toBeInTheDocument();
  });

  it("shows a not-found page for an article that does not exist", async () => {
    await visit("/missing-post-slug");
    expect(
      await screen.findByRole("heading", { level: 1, name: /Page Not Found/ })
    ).toBeInTheDocument();
    expect(clickables("Go Home").length).toBeGreaterThan(0);
  });
});

describe("search", () => {
  const openSearch = async () => {
    // Both themes label the control "Search". Cloudscape renders it among hidden measuring
    // copies that role queries cannot see, so find it by label.
    const trigger = document.querySelector<HTMLElement>('[aria-label="Search"]');
    expect(trigger).not.toBeNull();
    await userEvent.click(trigger!);
  };

  it("finds posts, announces the count, and opens the chosen result", async () => {
    await visit("/");
    await shownTitles(POST_TITLE);
    await openSearch();

    await userEvent.type(await screen.findByRole("searchbox"), "number 07");

    expect(await screen.findByText(/\d+ results? found/)).toBeInTheDocument();
    const results = await waitFor(() => {
      const found = clickables(/^Post number 07/);
      expect(found.length).toBeGreaterThan(0);
      return found;
    });
    await userEvent.click(results[results.length - 1]);

    expect(
      await screen.findByRole("heading", { level: 1, name: "A Rich Article" })
    ).toBeInTheDocument();
  });

  it("says so when nothing matches", async () => {
    await visit("/");
    await openSearch();

    await userEvent.type(await screen.findByRole("searchbox"), "zzzzzzzz");

    expect(
      await screen.findByText(/No results found/, { selector: "[aria-live]" })
    ).toBeInTheDocument();
  });
});
