import { describe, it, expect } from "vitest";
import { toContentItem } from "./content-item";

const post = {
  slug: "my-post",
  title: "My Post",
  date: "2024-01-15T00:00:00.000Z",
  description: "Desc",
  excerpt: "Exc",
  categories: "coding",
  tags: ["aws", "react"],
};

describe("toContentItem", () => {
  it("formats dates and labels once, in the core", () => {
    const item = toContentItem(post);
    expect(item.dateLong).toBe("January 15, 2024");
    expect(item.dateShort).toBe("Jan 15, 2024");
    expect(item.categoryLabel).toBe("Coding");
    expect(item.tags[0]).toEqual({ slug: "aws", label: "AWS", href: "/posts?tag=aws" });
  });
  it("links posts at the root and knowledge-base items under their section", () => {
    expect(toContentItem(post).href).toBe("/my-post");
    expect(toContentItem(post, "knowledge-base").href).toBe("/knowledge-base/my-post");
  });
  it("tolerates missing optional fields", () => {
    const item = toContentItem({ slug: "x", title: "X", date: "" });
    expect(item).toMatchObject({ dateLong: "", dateShort: "", categoryLabel: "", tags: [] });
    expect(item.description).toBeUndefined();
  });
  it("encodes tags in the filter URL", () => {
    expect(toContentItem({ ...post, tags: ["a b"] }).tags[0].href).toBe("/posts?tag=a%20b");
  });
});
