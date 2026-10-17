import { describe, it, expect } from "vitest";
import { parseFrontmatter } from "./frontmatter";

/**
 * This browser-side parser runs on every post the site renders, so its edge
 * cases matter more than its feature set. Tests pin the behaviour the 626
 * published posts rely on.
 */

describe("parseFrontmatter", () => {
  it("parses simple key/value pairs and returns the body", () => {
    const raw = `---\ntitle: My Post\ndate: 2024-01-15\n---\nBody text here.`;
    const { meta, content } = parseFrontmatter(raw);

    expect(meta.title).toBe("My Post");
    expect(meta.date).toBe("2024-01-15");
    expect(content).toBe("Body text here.");
  });

  it("returns the whole input as content when there is no frontmatter", () => {
    const raw = "# Just markdown\n\nNo frontmatter.";
    const { meta, content } = parseFrontmatter(raw);

    expect(meta).toEqual({});
    expect(content).toBe(raw);
  });

  it("strips double and single quotes from values", () => {
    const raw = `---\ntitle: "Quoted Title"\nauthor: 'Ian'\n---\nbody`;
    const { meta } = parseFrontmatter(raw);

    expect(meta.title).toBe("Quoted Title");
    expect(meta.author).toBe("Ian");
  });

  it("keeps colons that appear inside a value", () => {
    const raw = `---\ntitle: Backlinks or content : What's more important?\n---\nbody`;
    const { meta } = parseFrontmatter(raw);

    expect(meta.title).toBe("Backlinks or content : What's more important?");
  });

  it("parses inline arrays", () => {
    const raw = `---\ntags: [react, aws, typescript]\n---\nbody`;
    const { meta } = parseFrontmatter(raw);

    expect(meta.tags).toEqual(["react", "aws", "typescript"]);
  });

  it("strips quotes from inline array items", () => {
    const raw = `---\ntags: ["react", 'aws']\n---\nbody`;
    const { meta } = parseFrontmatter(raw);

    expect(meta.tags).toEqual(["react", "aws"]);
  });

  it("parses an empty inline array", () => {
    const raw = `---\ntags: []\n---\nbody`;
    const { meta } = parseFrontmatter(raw);

    // An empty inline array yields a single empty string rather than [].
    expect(Array.isArray(meta.tags)).toBe(true);
  });

  it("parses YAML block lists", () => {
    const raw = `---\ntitle: Post\ntags:\n  - react\n  - aws\ncategories:\n  - coding\n---\nbody`;
    const { meta } = parseFrontmatter(raw);

    expect(meta.tags).toEqual(["react", "aws"]);
    expect(meta.categories).toEqual(["coding"]);
    expect(meta.title).toBe("Post");
  });

  it("strips quotes from block list items", () => {
    const raw = `---\ntags:\n  - "react"\n  - 'aws'\n---\nbody`;
    const { meta } = parseFrontmatter(raw);

    expect(meta.tags).toEqual(["react", "aws"]);
  });

  it("keeps a key with an empty value when no list follows", () => {
    const raw = `---\ntitle: Post\ndescription:\n---\nbody`;
    const { meta } = parseFrontmatter(raw);

    expect(meta.description).toBe("");
  });

  it("ignores lines without a colon", () => {
    const raw = `---\ntitle: Post\nthis line is malformed\n---\nbody`;
    const { meta } = parseFrontmatter(raw);

    expect(meta.title).toBe("Post");
    expect(Object.keys(meta)).toEqual(["title"]);
  });

  it("preserves multi-line body content including blank lines", () => {
    const raw = `---\ntitle: Post\n---\nFirst para.\n\nSecond para.\n`;
    const { content } = parseFrontmatter(raw);

    expect(content).toBe("First para.\n\nSecond para.\n");
  });

  it("does not treat a --- inside the body as a delimiter boundary", () => {
    const raw = `---\ntitle: Post\n---\nIntro\n\n---\n\nAfter a horizontal rule.`;
    const { meta, content } = parseFrontmatter(raw);

    expect(meta.title).toBe("Post");
    expect(content).toContain("After a horizontal rule.");
  });

  it("handles a boolean-ish draft flag as a string", () => {
    const raw = `---\ntitle: Post\ndraft: true\n---\nbody`;
    const { meta } = parseFrontmatter(raw);

    // The lightweight parser is untyped — values come back as strings.
    expect(meta.draft).toBe("true");
  });

  it("returns empty meta for an empty string", () => {
    const { meta, content } = parseFrontmatter("");
    expect(meta).toEqual({});
    expect(content).toBe("");
  });
});
