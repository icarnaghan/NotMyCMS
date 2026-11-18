import { describe, expect, it } from "vitest";
import { aggregateHeads, compare, headOf, stripAssetHashes } from "./build-fingerprint.js";

describe("stripAssetHashes", () => {
  it("removes the Vite hash from asset URLs", () => {
    expect(stripAssetHashes('<script src="/assets/index-_p8ONon4.js">')).toBe(
      '<script src="/assets/index.js">'
    );
    expect(stripAssetHashes('href="/assets/cloudscape-DpKTbjZK.css"')).toBe(
      'href="/assets/cloudscape.css"'
    );
  });

  it("keeps hyphens inside the logical name", () => {
    expect(stripAssetHashes("/assets/use-document-title-BJzrqRE3.js")).toBe(
      "/assets/use-document-title.js"
    );
  });

  it("leaves non-asset text alone", () => {
    expect(stripAssetHashes("/posts/some-long-slug-name.js")).toBe("/posts/some-long-slug-name.js");
  });
});

describe("aggregateHeads", () => {
  const a = "<html><head><title>A</title></head><body>x</body></html>";
  it("ignores the body", () => {
    const b = a.replace("x", "y");
    expect(aggregateHeads([["a", a]])).toBe(aggregateHeads([["a", b]]));
  });
  it("detects head changes", () => {
    const b = a.replace("<title>A", "<title>B");
    expect(aggregateHeads([["a", a]])).not.toBe(aggregateHeads([["a", b]]));
  });
  it("is order independent", () => {
    expect(
      aggregateHeads([
        ["a", a],
        ["b", a],
      ])
    ).toBe(
      aggregateHeads([
        ["b", a],
        ["a", a],
      ])
    );
  });
  it("extracts head", () => {
    expect(headOf(a)).toBe("<head><title>A</title></head>");
  });
});

describe("compare", () => {
  const base = {
    files: { "sitemap.xml": "h1" },
    routeCount: 2,
    headsHash: "x",
    assets: { "a.js": { raw: 10, gzip: 5 } },
  };
  it("passes when identical", () => {
    expect(compare(base, base).problems).toEqual([]);
  });
  it("fails on a changed file, and only notes size changes", () => {
    const cur = {
      ...base,
      files: { "sitemap.xml": "h2" },
      assets: { "a.js": { raw: 12, gzip: 6 } },
    };
    const r = compare(base, cur);
    expect(r.problems).toEqual(["file changed: sitemap.xml"]);
    expect(r.notes).toHaveLength(1);
  });
});
