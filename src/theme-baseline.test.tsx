/**
 * Theme-system characterization baseline (theme-system spec, stage 0).
 *
 * Renders the real `<App/>` for every route and snapshots what a user can observe: the
 * accessibility tree (landmarks, headings, links, controls and their names) plus the
 * document title. It deliberately ignores class names and wrapper markup, so the same
 * snapshots can be used to check a second theme exposes the same structure.
 *
 * These snapshots record the CURRENT behavior of the Cloudscape UI, including its
 * defects (for example, category and tag badges are click-only spans with no role, so
 * they do not appear here as links or buttons). An update to a snapshot is a change in
 * user-visible structure and must be explained in the commit that makes it.
 *
 * Visual parity is not covered. Check that by eye in a browser.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "./App";
import { a11yTree } from "./test/a11y-tree";
import { mockFetch } from "./test/site-fixtures";

/**
 * Pin the site identity so the snapshots do not depend on which site.config.json is
 * checked out (the reference deployment, the public placeholder, or a fork).
 */
vi.mock("./lib/site-config", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./lib/site-config")>();
  return {
    ...actual,
    siteConfig: {
      ...actual.siteConfig,
      siteName: "Example Site",
      siteTitle: "example.com",
      tagline: "An example tagline",
      siteDescription: "An example description",
      guideSection: { path: "teaching/cmst388-tips", label: "CMST 388 Project Tips" },
      siteUrl: "https://www.example.com",
      author: { name: "Example Author", email: "author@example.com", avatar: "/images/avatar.jpg" },
      social: [
        { id: "github", label: "GitHub", href: "https://github.com/example" },
        { id: "linkedin", label: "LinkedIn", href: "https://www.linkedin.com/in/example/" },
      ],
    },
  };
});

/**
 * Wait until the rendered structure stops changing and contains a level-1 heading.
 * Generic on purpose: each route settles on different elements, and lazy chunks and
 * fetches resolve in no fixed order.
 */
async function settledTree(): Promise<string> {
  let last = "";
  let stableFor = 0;
  await waitFor(
    () => {
      const now = a11yTree();
      stableFor = now === last ? stableFor + 1 : 0;
      last = now;
      if (!now.includes("heading level=1") || stableFor < 3) {
        throw new Error("not settled");
      }
    },
    { timeout: 15000, interval: 40 }
  );
  return last;
}

/**
 * Cloudscape keeps closed modals in the DOM and hides them with CSS, which jsdom does
 * not apply. Dropping the trailing dialog entries from route snapshots keeps them about
 * the page; the search test keeps them because there the modal is open.
 */
function snapshotOf(tree: string, keepDialogs = false): string {
  const body = keepDialogs ? tree : tree.replace(/\ndialog [\s\S]*$/, "\n");
  return `title: ${document.title}\n${body}`;
}

const ROUTES: string[] = [
  "/",
  "/posts",
  "/posts?page=2",
  "/posts?page=3",
  "/posts?tag=react",
  "/knowledge-base",
  "/knowledge-base?page=2",
  "/categories",
  "/tags",
  "/post-07",
  "/knowledge-base/guide-03",
  "/about",
  "/apps",
  "/teaching",
  "/bitesize-javascript",
  "/teaching/cmst388-tips",
  "/teaching/cmst388-tips/some-guide",
  "/missing-post-slug",
];

// Each test waits up to 15s for the page to settle, so the per-test limit must exceed that.
// Under a parallel full-suite run the first render, which loads Cloudscape cold, is slow.
describe("theme baseline", { timeout: 30000 }, () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", mockFetch());
    vi.stubGlobal(
      "matchMedia",
      vi.fn().mockReturnValue({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })
    );
    vi.stubGlobal("scrollTo", vi.fn());
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    document.title = "";
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    window.history.pushState({}, "", "/");
  });

  it.each(ROUTES)("route %s", async (route) => {
    window.history.pushState({}, "", route);
    render(<App />);
    expect(snapshotOf(await settledTree())).toMatchSnapshot();
  });

  it("search modal: open and query", async () => {
    window.history.pushState({}, "", "/");
    render(<App />);
    await settledTree();
    const user = userEvent.setup();
    // jsdom has no layout, so Cloudscape collapses every utility into its overflow and
    // marks them hidden. Query by label instead of role, as navigation.test.tsx does.
    const trigger = document.querySelector<HTMLElement>('[aria-label="Search"]');
    expect(trigger).not.toBeNull();
    await user.click(trigger!);
    const box = await screen.findByRole("searchbox").catch(() => screen.findByRole("textbox"));
    await user.type(box, "number 07");
    await waitFor(() => expect(a11yTree()).toContain("number 07"), { timeout: 5000 });
    expect(snapshotOf(await settledTree(), true)).toMatchSnapshot();
  });
});
