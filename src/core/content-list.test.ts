import { describe, it, expect } from "vitest";
import { filterByTitle, filterPosts, paginate, sortItems, topCategories } from "./content-list";
import { countCategories, countTags, filterTaxonomy } from "./taxonomy";

const p = (
  slug: string,
  o: Partial<{
    title: string;
    date: string;
    categories: string;
    tags: string[];
    description: string;
  }> = {}
) => ({ slug, title: o.title ?? slug, date: o.date ?? "2024-01-01", ...o });

const ITEMS = [
  p("a", { title: "Alpha", categories: "coding", tags: ["react"], date: "2024-03-01" }),
  p("b", {
    title: "Beta",
    categories: "coding, hosting",
    tags: ["aws", "react"],
    date: "2024-01-01",
  }),
  p("c", {
    title: "Gamma",
    categories: "hosting",
    description: "about servers",
    date: "2024-02-01",
  }),
  p("d", { title: "Delta" }),
];

describe("topCategories", () => {
  it("orders by use and splits multi-category items", () => {
    expect(topCategories(ITEMS)).toEqual(["coding", "hosting"]);
  });
  it("honors the limit", () => {
    expect(topCategories(ITEMS, 1)).toEqual(["coding"]);
  });
});

describe("filterPosts", () => {
  it("returns everything with no filters", () => {
    expect(filterPosts(ITEMS, "", null)).toHaveLength(4);
  });
  it("matches title, category, description and tags, case-insensitively", () => {
    expect(filterPosts(ITEMS, "ALPHA", null).map((i) => i.slug)).toEqual(["a"]);
    expect(filterPosts(ITEMS, "hosting", null).map((i) => i.slug)).toEqual(["b", "c"]);
    expect(filterPosts(ITEMS, "servers", null).map((i) => i.slug)).toEqual(["c"]);
    expect(filterPosts(ITEMS, "aws", null).map((i) => i.slug)).toEqual(["b"]);
  });
  it("applies the category before the text", () => {
    expect(filterPosts(ITEMS, "react", "hosting").map((i) => i.slug)).toEqual(["b"]);
  });
});

describe("filterByTitle", () => {
  it("matches on title only", () => {
    expect(filterByTitle(ITEMS, "coding")).toEqual([]);
    expect(filterByTitle(ITEMS, "gam").map((i) => i.slug)).toEqual(["c"]);
  });
});

describe("sortItems", () => {
  it("sorts ascending and descending without mutating the input", () => {
    const copy = [...ITEMS];
    expect(sortItems(ITEMS, "title", false).map((i) => i.slug)).toEqual(["a", "b", "d", "c"]);
    expect(sortItems(ITEMS, "date", true).map((i) => i.slug)).toEqual(["a", "c", "b", "d"]);
    expect(ITEMS).toEqual(copy);
  });
});

describe("paginate", () => {
  const nums = Array.from({ length: 45 }, (_, i) => i);
  it("slices a page", () => {
    const r = paginate(nums, 2, 20);
    expect(r.items[0]).toBe(20);
    expect(r.pageCount).toBe(3);
  });
  it("clamps an out-of-range page", () => {
    expect(paginate(nums, 99, 20).page).toBe(3);
    expect(paginate(nums, 0, 20).page).toBe(1);
  });
  it("reports one page for no items", () => {
    expect(paginate([], 5, 20)).toEqual({ page: 1, pageCount: 1, items: [] });
  });
});

describe("taxonomy", () => {
  it("counts categories and tags, most used first", () => {
    expect(countCategories(ITEMS)).toEqual([
      { name: "coding", count: 2 },
      { name: "hosting", count: 2 },
    ]);
    expect(countTags(ITEMS)[0]).toEqual({ name: "react", count: 2 });
  });
  it("filters by name", () => {
    expect(filterTaxonomy(countTags(ITEMS), "AW")).toEqual([{ name: "aws", count: 1 }]);
  });
});
