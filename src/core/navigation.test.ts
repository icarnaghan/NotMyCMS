import { describe, it, expect } from "vitest";
import { FRAMEWORK_NAV, buildNav } from "./navigation";

const entry = (slug: string, label: string, order: number) => ({
  slug,
  nav: { label, order },
  seo: { title: label, description: "" },
});

describe("buildNav", () => {
  it("sorts registry pages and framework entries by one order key", () => {
    const nav = buildNav([entry("about", "About", 1), entry("apps", "Apps", 2)]);
    expect(nav.map((n) => n.label)).toEqual(["About", "Apps", "Blog Posts", "Knowledge Base"]);
  });
  it("does not force registry pages ahead of framework entries", () => {
    const nav = buildNav([entry("late", "Late", 7)]);
    expect(nav.at(-1)?.label).toBe("Late");
  });
  it("links registry pages by slug, including slashes", () => {
    expect(buildNav([entry("a/b", "AB", 1)])[0].to).toBe("/a/b");
  });
  it("returns just the framework entries when there are no pages", () => {
    expect(buildNav([])).toEqual([...FRAMEWORK_NAV]);
  });
});
