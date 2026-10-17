import { describe, it, expect } from "vitest";
import { validateFrontmatter, isFormValid, getContentWarnings } from "./content-validation";
import type { FrontmatterValue } from "../../components/frontmatter-form";

/**
 * Unit tests for content form validation.
 * Validates that title is required for save (Requirement 15.4 — slug preview
 * requires title; without title, save is disabled).
 */

function makeFormValue(overrides: Partial<FrontmatterValue> = {}): FrontmatterValue {
  return {
    title: "A Valid Title",
    date: "2024-01-15",
    description: "",
    author: "",
    categories: [],
    tags: [],
    draft: false,
    ...overrides,
  };
}

describe("validateFrontmatter", () => {
  it("returns no errors for a valid form with title", () => {
    const value = makeFormValue({ title: "My Post Title" });
    expect(validateFrontmatter(value)).toEqual({});
  });

  it("returns title error when title is empty", () => {
    const value = makeFormValue({ title: "" });
    expect(validateFrontmatter(value)).toEqual({ title: "Title is required" });
  });

  it("returns title error when title is only whitespace", () => {
    const value = makeFormValue({ title: "   " });
    expect(validateFrontmatter(value)).toEqual({ title: "Title is required" });
  });

  it("returns title error when title is only newlines/tabs", () => {
    const value = makeFormValue({ title: "\n\t  " });
    expect(validateFrontmatter(value)).toEqual({ title: "Title is required" });
  });

  it("accepts a title with leading/trailing spaces (non-empty content)", () => {
    const value = makeFormValue({ title: "  Hello  " });
    expect(validateFrontmatter(value)).toEqual({});
  });

  it("does not require other fields for validation to pass", () => {
    const value = makeFormValue({
      title: "Title Only",
      description: "",
      author: "",
      categories: [],
      tags: [],
    });
    expect(validateFrontmatter(value)).toEqual({});
  });
});

describe("isFormValid", () => {
  it("returns true when form has a valid title", () => {
    const value = makeFormValue({ title: "Valid" });
    expect(isFormValid(value)).toBe(true);
  });

  it("returns false when title is empty", () => {
    const value = makeFormValue({ title: "" });
    expect(isFormValid(value)).toBe(false);
  });

  it("returns false when title is whitespace-only", () => {
    const value = makeFormValue({ title: "   " });
    expect(isFormValid(value)).toBe(false);
  });
});

describe("getContentWarnings — links and images", () => {
  // A form value that on its own produces no non-link warnings, so tests can
  // assert precisely on link/image messages.
  const cleanValue = makeFormValue({
    title: "A Reasonable Post Title",
    description:
      "A description that comfortably sits within the fifty to one-sixty character band.",
    categories: ["coding"],
    tags: ["react"],
  });

  const messages = (body: string) => getContentWarnings(cleanValue, body).map((w) => w.message);

  it("flags images missing alt text", () => {
    const msgs = messages("Here is a picture: ![](images/photo.png)");
    expect(msgs.some((m) => /missing alt text/i.test(m))).toBe(true);
  });

  it("does not flag images that have alt text", () => {
    const msgs = messages("Here is a picture: ![A grey cat](images/photo.png)");
    expect(msgs.some((m) => /missing alt text/i.test(m))).toBe(false);
  });

  it("flags links with an empty target", () => {
    const msgs = messages("See [the docs]() for details.");
    expect(msgs.some((m) => /empty target/i.test(m))).toBe(true);
  });

  it("flags placeholder links (#, localhost, example.com)", () => {
    const msgs = messages("[a](#) and [b](http://localhost:3000) and [c](https://example.com/x)");
    expect(msgs.some((m) => /placeholder link/i.test(m))).toBe(true);
  });

  it("does not flag well-formed links and images", () => {
    const msgs = messages(
      "![A grey cat](images/cat.png) and [my site](https://www.carnaghan.com/about)."
    );
    expect(msgs.some((m) => /missing alt text|empty target|placeholder link/i.test(m))).toBe(false);
  });
});

describe("getContentWarnings — draft and scheduled state", () => {
  const base = makeFormValue({
    title: "A Reasonable Post Title",
    description:
      "A description that comfortably sits within the fifty to one-sixty character band.",
    categories: ["coding"],
    tags: ["react"],
  });

  const messages = (overrides: Partial<FrontmatterValue>) =>
    getContentWarnings({ ...base, ...overrides }, "Body.").map((w) => w.message);

  it("warns that a draft is not listed anywhere", () => {
    const msgs = messages({ draft: true, date: "2020-01-01" });
    expect(msgs.some((m) => /won't be listed anywhere/i.test(m))).toBe(true);
  });

  // The warning used to say a draft "will NOT appear on the live site", which reads as
  // inaccessible. It isn't: the content route fetches the markdown directly and never
  // checks the flag, so a draft is readable by URL. Someone drafting something sensitive
  // would have been misled, so the honest framing is pinned here.
  it("says a draft is still readable by URL, rather than implying it is private", () => {
    const msgs = messages({ draft: true, date: "2020-01-01" });
    expect(msgs.some((m) => /readable by anyone who has the URL/i.test(m))).toBe(true);
    expect(msgs.some((m) => /unlisted, not private/i.test(m))).toBe(true);
    expect(msgs.some((m) => /NOT appear on the live site/.test(m))).toBe(false);
  });

  it("says nothing about drafts for a published post", () => {
    const msgs = messages({ draft: false, date: "2020-01-01" });
    expect(msgs.some((m) => /draft/i.test(m))).toBe(false);
  });

  it("promises scheduled publishing only when the post is published", () => {
    const msgs = messages({ draft: false, date: "2999-01-01" });
    expect(msgs.some((m) => /Scheduled — this won't appear/i.test(m))).toBe(true);
  });

  it("does not promise scheduled publishing for a future-dated draft", () => {
    // Both conditions apply: the date passing changes nothing while it's a draft,
    // so the note must not imply it will go live on its own.
    const msgs = messages({ draft: true, date: "2999-01-01" });
    expect(msgs.some((m) => /Scheduled — this won't appear/i.test(m))).toBe(false);
    expect(msgs.some((m) => /while it stays a draft the date has no effect/i.test(m))).toBe(true);
    // The draft warning is still present alongside it.
    expect(msgs.some((m) => /won't be listed anywhere/i.test(m))).toBe(true);
  });

  it("puts the draft warning first, since it overrides everything else", () => {
    const warnings = getContentWarnings({ ...base, draft: true }, "Body.");
    expect(warnings[0].message).toMatch(/draft/i);
    expect(warnings[0].level).toBe("warning");
  });
});

describe("getContentWarnings — missing referenced images", () => {
  const cleanValue = makeFormValue({
    title: "A Reasonable Post Title",
    description:
      "A description that comfortably sits within the fifty to one-sixty character band.",
    categories: ["coding"],
    tags: ["react"],
  });

  const missingMsgs = (body: string, available?: string[]) =>
    getContentWarnings(cleanValue, body, available)
      .map((w) => w.message)
      .filter((m) => /not found for this post/i.test(m));

  it("flags an image that is not in the uploaded list", () => {
    const msgs = missingMsgs("![a](images/gone.png)", ["images/present.png"]);
    expect(msgs).toHaveLength(1);
    expect(msgs[0]).toContain("images/gone.png");
  });

  it("does not flag an image that exists", () => {
    expect(missingMsgs("![a](images/present.png)", ["images/present.png"])).toHaveLength(0);
  });

  it("skips the check entirely when the list is unknown", () => {
    // undefined means "not loaded yet" — must not produce false positives.
    expect(missingMsgs("![a](images/anything.png)", undefined)).toHaveLength(0);
  });

  it("flags everything when the post has no uploads at all", () => {
    const msgs = missingMsgs("![a](images/one.png) ![b](images/two.png)", []);
    expect(msgs).toHaveLength(1);
    expect(msgs[0]).toContain("images/one.png");
    expect(msgs[0]).toContain("images/two.png");
  });

  it("ignores external images, which cannot be verified", () => {
    expect(missingMsgs("![a](https://example.com/remote.png)", [])).toHaveLength(0);
  });

  it("ignores root-relative paths, which live outside the post", () => {
    expect(missingMsgs("![a](/images/site/logo.png)", [])).toHaveLength(0);
  });

  it("normalises a leading ./ on both sides", () => {
    expect(missingMsgs("![a](./images/present.png)", ["images/present.png"])).toHaveLength(0);
  });

  it("does not report the same missing file twice", () => {
    const msgs = missingMsgs("![a](images/gone.png) and again ![b](images/gone.png)", []);
    expect(msgs).toHaveLength(1);
    // Mentioned once, not duplicated in the list.
    expect(msgs[0].match(/images\/gone\.png/g)).toHaveLength(1);
  });

  it("truncates a long list of missing images", () => {
    const body = ["a", "b", "c", "d", "e"].map((n) => `![${n}](images/${n}.png)`).join("\n");
    const msgs = missingMsgs(body, []);
    expect(msgs[0]).toContain("…");
  });

  it("ignores a markdown title after the path", () => {
    expect(
      missingMsgs('![a](images/present.png "A caption")', ["images/present.png"])
    ).toHaveLength(0);
  });
});
