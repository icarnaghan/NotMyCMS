/**
 * Shared test fixtures: a deterministic site (45 posts, 30 knowledge-base articles, the five
 * landing pages) served through a mocked `fetch`, so route-level tests do not depend on the
 * real content repository.
 */
import { vi } from "vitest";
import { TEST_PAGES, TEST_PAGES_MANIFEST } from "../pages/landing/test-pages-fixture";

const CATEGORIES = ["coding", "wordpress", "hosting", "seo"];
const TAGS = ["react", "aws", "php", "css", "seo", "linux"];

/** Deterministic manifest entries. 45 posts gives three pages at the 20-per-page size. */
function makeEntries(prefix: string, count: number) {
  return Array.from({ length: count }, (_, i) => {
    const n = String(i + 1).padStart(2, "0");
    return {
      slug: `${prefix}-${n}`,
      title: `${prefix === "post" ? "Post" : "Guide"} number ${n}`,
      date: `2024-${String((i % 12) + 1).padStart(2, "0")}-15T00:00:00.000Z`,
      description: `Description for ${prefix} ${n}.`,
      excerpt: `Excerpt for ${prefix} ${n}.`,
      categories: CATEGORIES[i % CATEGORIES.length],
      tags: [TAGS[i % TAGS.length], TAGS[(i + 2) % TAGS.length]],
    };
  });
}
export const POSTS = makeEntries("post", 45);
export const KB = makeEntries("guide", 30);

export const MARKDOWN = `---
title: A Rich Article
date: 2024-03-15
categories: coding
tags: [react, aws]
---

Intro paragraph with a [link](https://example.com) and **bold** text.

## First section

Some text.

### A subsection

- one
- two

\`\`\`ts
const answer: number = 42;
\`\`\`

| Name | Value |
| ---- | ----- |
| a    | 1     |

## Second section

![Alt text](pic.png)
`;

export function json(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

export function mockFetch() {
  return vi.fn((input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith("/content/posts/manifest.json")) return Promise.resolve(json(POSTS));
    if (url.endsWith("/content/knowledge-base/manifest.json")) return Promise.resolve(json(KB));
    if (url.endsWith("/content/pages/manifest.json")) {
      return Promise.resolve(json(TEST_PAGES_MANIFEST));
    }
    if (url === "/search-index.json") {
      return Promise.resolve(
        json([
          ...POSTS.map((p) => ({ ...p, basePath: "posts" })),
          ...KB.map((p) => ({ ...p, basePath: "knowledge-base" })),
        ])
      );
    }
    const pageMatch = url.match(/\/content\/pages\/(.+)\/page\.json$/);
    if (pageMatch) {
      const page = TEST_PAGES.find((p) => p.slug === pageMatch[1]);
      return Promise.resolve(page ? json(page) : new Response("not found", { status: 404 }));
    }
    const md = url.match(/\/content\/(posts|knowledge-base|pages)\/(.+)\/index\.md$/);
    if (md) {
      // A slug beginning "missing" simulates content that does not exist.
      if (md[2].startsWith("missing")) {
        return Promise.resolve(new Response("not found", { status: 404 }));
      }
      return Promise.resolve(
        new Response(MARKDOWN, { status: 200, headers: { "content-type": "text/markdown" } })
      );
    }
    return Promise.resolve(new Response("not found", { status: 404 }));
  });
}

/** What jsdom lacks and the app calls: matchMedia, scrollTo. Pair with `vi.unstubAllGlobals`. */
export function stubBrowser() {
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
}
