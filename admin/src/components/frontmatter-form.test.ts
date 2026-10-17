import { describe, it, expect } from "vitest";
import { slugify } from "./slugify";

/**
 * Unit tests for slug generation.
 * Validates Requirement 15.4: slug preview generation from title.
 */

describe("slugify", () => {
  it("converts a simple title to lowercase hyphenated slug", () => {
    expect(slugify("Hello World")).toBe("hello-world");
  });

  it("strips straight apostrophes", () => {
    expect(slugify("It's a Test")).toBe("its-a-test");
  });

  it("strips curly apostrophes (left, right, reversed)", () => {
    expect(slugify("It\u2018s \u2019here\u201B")).toBe("its-here");
  });

  it("replaces special characters with hyphens", () => {
    expect(slugify("Hello & Goodbye! @World")).toBe("hello-goodbye-world");
  });

  it("collapses consecutive hyphens into one", () => {
    expect(slugify("one---two")).toBe("one-two");
  });

  it("strips leading and trailing hyphens", () => {
    expect(slugify("--hello--")).toBe("hello");
  });

  it("handles titles with numbers", () => {
    expect(slugify("Top 10 Tips for 2024")).toBe("top-10-tips-for-2024");
  });

  it("returns empty string for empty input", () => {
    expect(slugify("")).toBe("");
  });

  it("handles title with only special characters", () => {
    expect(slugify("!!!@@@###")).toBe("");
  });

  it("handles mixed case with unicode apostrophes", () => {
    expect(slugify("What\u2019s New in TypeScript")).toBe("whats-new-in-typescript");
  });

  // Additional edge cases for slug preview generation
  it("handles titles with parentheses and brackets", () => {
    expect(slugify("React (v19) vs [Angular]")).toBe("react-v19-vs-angular");
  });

  it("handles titles with dots and commas", () => {
    expect(slugify("Node.js, Express, and MongoDB")).toBe("node-js-express-and-mongodb");
  });

  it("handles titles with multiple consecutive spaces", () => {
    expect(slugify("Too   Many   Spaces")).toBe("too-many-spaces");
  });

  it("handles single character title", () => {
    expect(slugify("A")).toBe("a");
  });

  it("handles title that is just a number", () => {
    expect(slugify("42")).toBe("42");
  });

  it("handles title with em dash and en dash", () => {
    expect(slugify("Part One \u2013 Introduction \u2014 Summary")).toBe(
      "part-one-introduction-summary"
    );
  });

  it("handles title with possessive and contractions", () => {
    expect(slugify("Developer\u2019s Guide: Don\u2019t Panic")).toBe("developers-guide-dont-panic");
  });

  it("preserves hyphens already in the title", () => {
    expect(slugify("well-known-fact")).toBe("well-known-fact");
  });
});
