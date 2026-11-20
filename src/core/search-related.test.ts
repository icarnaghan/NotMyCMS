import { describe, it, expect } from "vitest";
import { createSearcher, resultUrl, resultsAnnouncement, type SearchItem } from "./search";
import { selectRelated } from "./related-posts";

const item = (slug: string, title: string, basePath = "posts"): SearchItem => ({
  slug,
  basePath,
  title,
  excerpt: `About ${title}`,
  categories: "",
  tags: [],
});

describe("createSearcher", () => {
  const search = createSearcher([
    item("a", "Configuring Nginx"),
    item("b", "Docker networking"),
    item("c", "Guide", "knowledge-base"),
  ]);
  it("finds a fuzzy match", () => {
    expect(search("nginx").map((i) => i.slug)).toEqual(["a"]);
  });
  it("returns nothing below two characters", () => {
    expect(search("n")).toEqual([]);
    expect(search("")).toEqual([]);
  });
  it("returns nothing when nothing matches", () => {
    expect(search("zzzzzzz")).toEqual([]);
  });
});

describe("resultUrl", () => {
  it("puts posts at the root and everything else under the knowledge base", () => {
    expect(resultUrl({ basePath: "posts", slug: "x" })).toBe("/x");
    expect(resultUrl({ basePath: "knowledge-base", slug: "x" })).toBe("/knowledge-base/x");
  });
});

describe("resultsAnnouncement", () => {
  it("handles none, one and many", () => {
    expect(resultsAnnouncement(0)).toBe("No results found");
    expect(resultsAnnouncement(1)).toBe("1 result found");
    expect(resultsAnnouncement(7)).toBe("7 results found");
  });
});

describe("selectRelated", () => {
  const p = (slug: string, tags: string[] = [], categories = "") => ({
    slug,
    title: slug,
    date: "2024-01-01",
    tags,
    categories,
  });
  const ALL = [
    p("cur", ["react"], "coding"),
    p("cat-only", [], "coding"),
    p("tag-and-cat", ["React"], "coding"),
    p("two-tags", ["react", "aws"], ""),
    p("none", ["php"], "seo"),
  ];
  const current = { slug: "cur", tags: ["react", "aws"], categories: "coding" };
  it("scores tags at 2 and categories at 1, case-insensitively, best first", () => {
    expect(selectRelated(ALL, current).map((x) => x.slug)).toEqual([
      "two-tags", // react + aws = 4
      "tag-and-cat", // React 2 + coding 1 = 3
      "cat-only", // coding 1
    ]);
  });
  it("excludes the current item and zero scores", () => {
    const slugs = selectRelated(ALL, current).map((x) => x.slug);
    expect(slugs).not.toContain("cur");
    expect(slugs).not.toContain("none");
  });
  it("returns nothing without tags or categories to compare", () => {
    expect(selectRelated(ALL, { slug: "cur", tags: [], categories: "" })).toEqual([]);
  });
  it("limits to four", () => {
    const many = Array.from({ length: 10 }, (_, i) => p(`m${i}`, ["react"]));
    expect(selectRelated(many, current)).toHaveLength(4);
  });
});
