import { describe, it, expect } from "vitest";
import { createElement } from "react";
import {
  extractHeadings,
  headingId,
  nodeToText,
  readingStats,
  resolveImageSrc,
  sectionCrumb,
} from "./article";

describe("headings", () => {
  it("extracts h2 and h3 only", () => {
    const md = "# Title\n\n## One\n\ntext\n\n### Two\n\n#### Four\n";
    expect(extractHeadings(md)).toEqual([
      { text: "One", id: "one", level: 2 },
      { text: "Two", id: "two", level: 3 },
    ]);
  });

  it("reduces inline Markdown to the text that will render", () => {
    const [h] = extractHeadings("## Using `fetch` and [links](https://x.y) *well*\n");
    expect(h.text).toBe("Using fetch and links well");
  });

  // The table of contents links to `#id`; the rendered heading must carry the same id.
  it("produces the id a rendered heading will carry", () => {
    const [h] = extractHeadings("## Using `fetch` and **bold** text\n");
    const rendered = [
      "Using ",
      createElement("code", null, "fetch"),
      " and ",
      createElement("strong", null, "bold"),
      " text",
    ];
    expect(headingId(rendered)).toBe(h.id);
  });
});

describe("nodeToText", () => {
  it("flattens nested elements, numbers and ignores booleans and null", () => {
    expect(
      nodeToText([
        "a",
        1,
        null,
        false,
        createElement("b", null, ["c", createElement("i", null, "d")]),
      ])
    ).toBe("a1cd");
  });
});

describe("readingStats", () => {
  it("counts words and rounds minutes up, with a one minute floor", () => {
    expect(readingStats("one two three")).toEqual({ words: 3, minutes: 1 });
    expect(readingStats(Array(201).fill("w").join(" "))).toEqual({ words: 201, minutes: 2 });
  });
  it("treats empty content as zero words and one minute", () => {
    expect(readingStats("")).toEqual({ words: 0, minutes: 1 });
  });
});

describe("sectionCrumb", () => {
  it("names the posts and knowledge base sections", () => {
    expect(sectionCrumb("posts")).toEqual({ label: "Posts", href: "/posts" });
    expect(sectionCrumb("knowledge-base")).toEqual({
      label: "Knowledge Base",
      href: "/knowledge-base",
    });
  });
});

describe("resolveImageSrc", () => {
  it("leaves absolute and root-relative URLs alone", () => {
    for (const src of [
      "https://a.b/c.png",
      "http://a.b/c.png",
      "data:image/png;base64,xx",
      "/img/c.png",
    ]) {
      expect(resolveImageSrc(src, "posts", "s")).toBe(src);
    }
  });
  it("resolves a relative path against the article's content directory", () => {
    expect(resolveImageSrc("pic.png", "posts", "my-post")).toBe("/content/posts/my-post/pic.png");
  });
  it("tolerates a missing src", () => {
    expect(resolveImageSrc(undefined, "posts", "s")).toBe("/content/posts/s/");
  });
});
