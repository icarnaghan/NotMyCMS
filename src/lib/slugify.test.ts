import { describe, it, expect } from "vitest";
import { slugify } from "./slugify";

describe("slugify", () => {
  it("lowercases and hyphenates", () => {
    expect(slugify("Hello World")).toBe("hello-world");
  });

  it("collapses runs of non-alphanumerics into a single hyphen", () => {
    expect(slugify("Hello & Goodbye! @World")).toBe("hello-goodbye-world");
    expect(slugify("Too   Many   Spaces")).toBe("too-many-spaces");
    expect(slugify("one---two")).toBe("one-two");
  });

  it("trims leading and trailing hyphens", () => {
    expect(slugify("--hello--")).toBe("hello");
    expect(slugify("!!!Wrapped!!!")).toBe("wrapped");
  });

  it("keeps digits", () => {
    expect(slugify("Top 10 Tips for 2024")).toBe("top-10-tips-for-2024");
    expect(slugify("42")).toBe("42");
  });

  it("strips straight and curly apostrophes", () => {
    expect(slugify("It's a Test")).toBe("its-a-test");
    expect(slugify("What\u2019s New")).toBe("whats-new");
    expect(slugify("It\u2018s \u2019here\u201B")).toBe("its-here");
  });

  it("returns an empty string when nothing survives", () => {
    expect(slugify("")).toBe("");
    expect(slugify("!!!@@@###")).toBe("");
  });

  it("leaves an already-slug-shaped string alone", () => {
    expect(slugify("well-known-fact")).toBe("well-known-fact");
  });

  it("treats dashes and dots as separators", () => {
    expect(slugify("Node.js, Express, and MongoDB")).toBe("node-js-express-and-mongodb");
    expect(slugify("Part One \u2013 Introduction \u2014 Summary")).toBe(
      "part-one-introduction-summary"
    );
  });
});

describe("canonical slugs for real published titles", () => {
  /**
   * All six slugify implementations must agree (see the list in slugify.ts).
   * These cases come from real posts whose titles contain apostrophes — the ones
   * that exposed the original inconsistency. Each package pins the same expected
   * output so the implementations cannot drift apart again.
   *
   * The left-hand values are also the directory names on disk after the rename
   * migration, and the previous non-stripping forms are 301-redirected from
   * infra/redirects.json.
   */
  const cases: Array<[string, string]> = [
    [
      "Here's the reason why you should not buy backlinks",
      "heres-the-reason-why-you-should-not-buy-backlinks",
    ],
    [
      "Why you shouldn't change WordPress theme often?",
      "why-you-shouldnt-change-wordpress-theme-often",
    ],
    [
      "Useful Wordpress Plugins You Probably Didn't Know About",
      "useful-wordpress-plugins-you-probably-didnt-know-about",
    ],
    [
      "Lessons Learned using Drupal\u2019s Domain Access Module",
      "lessons-learned-using-drupals-domain-access-module",
    ],
    ["Backlinks or content : What's more important?", "backlinks-or-content-whats-more-important"],
  ];

  it.each(cases)("%s -> %s", (title, expected) => {
    expect(slugify(title)).toBe(expected);
  });

  it("never leaves an apostrophe as a bare -s- separator", () => {
    // The old behaviour produced "here-s-the-reason..."; guard against regressing.
    expect(slugify("Here's the reason")).not.toContain("-s-");
    expect(slugify("Here's the reason")).toBe("heres-the-reason");
  });
});
