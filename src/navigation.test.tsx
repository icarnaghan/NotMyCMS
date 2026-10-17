/**
 * Pins the top navigation's contents and order.
 *
 * The navigation used to be six hand-written entries in `App.tsx`; it is now generated
 * from the page registry merged with the framework's own routes and sorted by one
 * `order` key. That is exactly the kind of change that silently reorders a menu, so the
 * expected sequence is asserted literally rather than derived — a test that computed the
 * expected order from the same registry would pass no matter what the registry said.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "./App";
import { TEST_PAGES, TEST_PAGES_MANIFEST } from "./pages/landing/test-pages-fixture";

/** The navigation as it has always read, top to bottom. */
const EXPECTED_NAV = [
  "About Me",
  "Apps",
  "Teaching",
  "Bitesize JavaScript",
  "Blog Posts",
  "Knowledge Base",
];

/**
 * The navigation is generated from the runtime pages manifest now, merged with the
 * framework routes. Serve the manifest (and each page's JSON) from the shared fixture
 * (the compiled registry was removed in stage 4) so the nav populates exactly as it ships.
 */
const PAGES = TEST_PAGES;
const PAGES_MANIFEST = TEST_PAGES_MANIFEST;

function json(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

describe("top navigation", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith("/content/pages/manifest.json")) {
          return Promise.resolve(json(PAGES_MANIFEST));
        }
        const pageMatch = url.match(/\/content\/pages\/(.+)\/page\.json$/);
        if (pageMatch) {
          const page = PAGES.find((p) => p.slug === pageMatch[1]);
          return page
            ? Promise.resolve(json(page))
            : Promise.resolve(new Response("not found", { status: 404 }));
        }
        return Promise.resolve(json([]));
      })
    );
    vi.stubGlobal(
      "matchMedia",
      vi.fn().mockReturnValue({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })
    );
    window.history.pushState({}, "", "/");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  /**
   * Cloudscape's TopNavigation measures available width to decide what to collapse into
   * an overflow menu. jsdom reports zero width, so it renders every item and also a
   * hidden copy for measurement — hence filtering to buttons whose text is one of the
   * known labels, and de-duplicating.
   */
  function navLabels(): string[] {
    const seen = new Set<string>();
    return [...document.querySelectorAll("button, a")]
      .map((el) => (el.textContent ?? "").trim())
      .filter((text) => EXPECTED_NAV.includes(text))
      .filter((text) => {
        if (seen.has(text)) return false;
        seen.add(text);
        return true;
      });
  }

  it("lists every navigation entry in the expected order", async () => {
    render(<App />);

    // Nav from the manifest is async; wait for the registry entries to appear.
    await waitFor(() => expect(navLabels()).toEqual(EXPECTED_NAV));
  });

  it("places registry pages before the framework routes", async () => {
    // The manifest supplies the first four; /posts and /knowledge-base are framework
    // routes with no page in site/pages/.
    render(<App />);

    await waitFor(() => {
      const labels = navLabels();
      expect(labels.indexOf("Bitesize JavaScript")).toBeLessThan(labels.indexOf("Blog Posts"));
    });
  });

  /**
   * Cloudscape renders each utility as `<a role="button" aria-label="...">`, and with
   * zero reported width it emits a duplicate measurement copy inside a container jsdom
   * treats as hidden — so role-based queries find nothing. Selecting on the aria-label
   * attribute is what actually works here.
   */
  const utility = (label: string) =>
    document.querySelectorAll<HTMLElement>(`[aria-label="${label}"]`);

  it("navigates to the right page from a generated entry", async () => {
    // Confirms the generated onClick targets `/${slug}` and not, say, the nav label.
    render(<App />);

    // The nav entry only exists once the manifest has loaded.
    await waitFor(() => expect(utility("Teaching").length).toBeGreaterThan(0));
    await userEvent.click(utility("Teaching")[0]);

    expect(
      await screen.findByRole("heading", { level: 1, name: "Classes I Teach" })
    ).toBeInTheDocument();
  });

  it("keeps the behavioural utilities, which are not derivable from the registry", () => {
    render(<App />);

    expect(utility("Search").length).toBeGreaterThan(0);
    expect(utility("Cookies Policy").length).toBeGreaterThan(0);
    expect(utility("Settings").length).toBeGreaterThan(0);
  });

  it("omits pages that have no nav entry", async () => {
    // /teaching/cmst388-tips is reachable but deliberately unlisted.
    render(<App />);

    // Wait until the nav has populated so the absence is meaningful, not just un-loaded.
    await waitFor(() => expect(navLabels()).toContain("About Me"));
    expect(navLabels()).not.toContain("CMST 388 Project Tips");
  });
});
