import { describe, it, expect } from "vitest";
import { filterContentItem } from "./content-filter";
import type { ContentItem } from "../../api/content";

/**
 * Unit tests for the content filter logic used in ContentListPage.
 * Validates Requirement 2.3: filter by title, categories, and tags.
 */

function makeItem(overrides: Partial<ContentItem> = {}): ContentItem {
  return {
    slug: "test-item",
    type: "posts",
    title: "Default Title",
    date: "2024-01-15",
    categories: [],
    tags: [],
    draft: false,
    images: [],
    lastModified: "2024-01-15T10:00:00Z",
    ...overrides,
  };
}

describe("filterContentItem", () => {
  describe("title matching", () => {
    it("matches when filter text is found in title (case-insensitive)", () => {
      const item = makeItem({ title: "Getting Started with TypeScript" });
      expect(filterContentItem(item, "typescript")).toBe(true);
    });

    it("matches partial title text", () => {
      const item = makeItem({ title: "Getting Started with TypeScript" });
      expect(filterContentItem(item, "started")).toBe(true);
    });

    it("is case-insensitive for title matching", () => {
      const item = makeItem({ title: "Hello World" });
      expect(filterContentItem(item, "HELLO")).toBe(true);
    });

    it("does not match when filter text is not in title, categories, or tags", () => {
      const item = makeItem({ title: "Hello World", categories: ["Tech"], tags: ["js"] });
      expect(filterContentItem(item, "python")).toBe(false);
    });
  });

  describe("category matching", () => {
    it("matches when filter text is found in a category", () => {
      const item = makeItem({ categories: ["Technology", "Science"] });
      expect(filterContentItem(item, "tech")).toBe(true);
    });

    it("is case-insensitive for category matching", () => {
      const item = makeItem({ categories: ["Web Development"] });
      expect(filterContentItem(item, "WEB")).toBe(true);
    });

    it("matches partial category text", () => {
      const item = makeItem({ categories: ["Programming"] });
      expect(filterContentItem(item, "gram")).toBe(true);
    });

    it("matches any category in the list", () => {
      const item = makeItem({ categories: ["Finance", "Technology", "Health"] });
      expect(filterContentItem(item, "health")).toBe(true);
    });
  });

  describe("tag matching", () => {
    it("matches when filter text is found in a tag", () => {
      const item = makeItem({ tags: ["javascript", "react", "node"] });
      expect(filterContentItem(item, "react")).toBe(true);
    });

    it("is case-insensitive for tag matching", () => {
      const item = makeItem({ tags: ["TypeScript"] });
      expect(filterContentItem(item, "typescript")).toBe(true);
    });

    it("matches partial tag text", () => {
      const item = makeItem({ tags: ["infrastructure"] });
      expect(filterContentItem(item, "struct")).toBe(true);
    });

    it("matches any tag in the list", () => {
      const item = makeItem({ tags: ["aws", "docker", "kubernetes"] });
      expect(filterContentItem(item, "docker")).toBe(true);
    });
  });

  describe("combined matching", () => {
    it("matches title even when categories and tags do not match", () => {
      const item = makeItem({
        title: "Docker Best Practices",
        categories: ["DevOps"],
        tags: ["containers"],
      });
      expect(filterContentItem(item, "docker")).toBe(true);
    });

    it("matches category even when title and tags do not match", () => {
      const item = makeItem({
        title: "My Post",
        categories: ["Machine Learning"],
        tags: ["python"],
      });
      expect(filterContentItem(item, "machine")).toBe(true);
    });

    it("matches tag even when title and categories do not match", () => {
      const item = makeItem({
        title: "My Post",
        categories: ["General"],
        tags: ["serverless"],
      });
      expect(filterContentItem(item, "serverless")).toBe(true);
    });
  });

  describe("edge cases", () => {
    it("returns true for empty filter text (matches all)", () => {
      const item = makeItem({ title: "Any Title" });
      expect(filterContentItem(item, "")).toBe(true);
    });

    it("handles item with empty categories and tags", () => {
      const item = makeItem({ title: "Only Title", categories: [], tags: [] });
      expect(filterContentItem(item, "only")).toBe(true);
    });

    it("does not match when all fields are empty and filter text is provided", () => {
      const item = makeItem({ title: "", categories: [], tags: [] });
      expect(filterContentItem(item, "something")).toBe(false);
    });
  });
});
