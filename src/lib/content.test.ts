import { describe, it, expect } from "vitest";
import { formatDate, toDisplayLabel } from "./content";

describe("formatDate", () => {
  it("formats an ISO date in long form by default", () => {
    expect(formatDate("2024-01-15T00:00:00.000Z")).toBe("January 15, 2024");
  });

  it("formats in short form when asked", () => {
    expect(formatDate("2024-01-15T00:00:00.000Z", "short")).toBe("Jan 15, 2024");
  });

  it("handles the date-only format used in frontmatter", () => {
    // Date-only strings are parsed as UTC midnight.
    expect(formatDate("2026-06-18")).toBe("June 18, 2026");
  });

  it("formats a single-digit day without padding", () => {
    expect(formatDate("2024-03-05T00:00:00.000Z")).toBe("March 5, 2024");
  });

  it("returns Invalid Date for unparseable input rather than throwing", () => {
    expect(() => formatDate("not a date")).not.toThrow();
    expect(formatDate("not a date")).toBe("Invalid Date");
  });

  it("returns Invalid Date for an empty string rather than throwing", () => {
    expect(() => formatDate("")).not.toThrow();
    expect(formatDate("")).toBe("Invalid Date");
  });

  it("formats in UTC, not the viewer's timezone", () => {
    // Frontmatter dates are calendar dates stored as UTC midnight. Formatting
    // them locally shifted every date back a day for readers west of UTC, so a
    // post dated the 15th displayed as the 14th across the Americas. These
    // assertions fail if the UTC pin is ever removed, whatever timezone the
    // machine running them is in.
    expect(formatDate("2024-01-15T00:00:00.000Z")).toBe("January 15, 2024");
    expect(formatDate("2024-01-01T00:00:00.000Z")).toBe("January 1, 2024");
    // Year boundary is the worst case: local formatting would report 2023.
    expect(formatDate("2024-01-01")).toBe("January 1, 2024");
    expect(formatDate("2026-09-25", "short")).toBe("Sep 25, 2026");
  });
});

describe("toDisplayLabel", () => {
  it("title-cases a hyphenated slug", () => {
    expect(toDisplayLabel("web-development")).toBe("Web Development");
  });

  it("title-cases a single word", () => {
    expect(toDisplayLabel("coding")).toBe("Coding");
  });

  it("applies acronym overrides", () => {
    expect(toDisplayLabel("aws")).toBe("AWS");
    expect(toDisplayLabel("seo")).toBe("SEO");
    expect(toDisplayLabel("css")).toBe("CSS");
    expect(toDisplayLabel("php")).toBe("PHP");
  });

  it("applies mixed-case brand overrides", () => {
    expect(toDisplayLabel("wordpress")).toBe("WordPress");
    expect(toDisplayLabel("devops")).toBe("DevOps");
    expect(toDisplayLabel("mysql")).toBe("MySQL");
    expect(toDisplayLabel("studiopress")).toBe("StudioPress");
  });

  it("applies overrides that expand punctuation", () => {
    expect(toDisplayLabel("ci-cd")).toBe("CI/CD");
    expect(toDisplayLabel("cicd")).toBe("CI/CD");
  });

  it("applies multi-word overrides", () => {
    expect(toDisplayLabel("wordpress-plugins")).toBe("WordPress Plugins");
    expect(toDisplayLabel("ux-design")).toBe("UX Design");
    expect(toDisplayLabel("google-adsense")).toBe("Google AdSense");
  });

  it("preserves an intentionally lowercase override", () => {
    expect(toDisplayLabel("kubectl")).toBe("kubectl");
  });

  it("is case-sensitive on overrides, falling back to title casing", () => {
    // Overrides are keyed by the lowercase slug form.
    expect(toDisplayLabel("AWS")).toBe("AWS");
  });

  it("handles an empty string", () => {
    expect(toDisplayLabel("")).toBe("");
  });

  it("coerces non-string input rather than throwing", () => {
    // Manifest data is untyped JSON, so a number can reach this.
    expect(() => toDisplayLabel(42 as unknown as string)).not.toThrow();
    expect(toDisplayLabel(42 as unknown as string)).toBe("42");
  });
});
