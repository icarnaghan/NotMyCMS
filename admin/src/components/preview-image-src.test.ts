import { describe, it, expect } from "vitest";
import { resolveImageSrc } from "./preview-image-src";

describe("resolveImageSrc", () => {
  it("rewrites a relative image path to the published content path", () => {
    expect(resolveImageSrc("images/diagram.png", "posts", "my-post")).toBe(
      "/content/posts/my-post/images/diagram.png"
    );
  });

  it("uses the knowledge-base content type", () => {
    expect(resolveImageSrc("images/fix.jpg", "knowledge-base", "some-fix")).toBe(
      "/content/knowledge-base/some-fix/images/fix.jpg"
    );
  });

  it("handles a bare filename with no directory", () => {
    expect(resolveImageSrc("hero.png", "posts", "my-post")).toBe("/content/posts/my-post/hero.png");
  });

  it("strips a leading ./", () => {
    expect(resolveImageSrc("./images/a.png", "posts", "my-post")).toBe(
      "/content/posts/my-post/images/a.png"
    );
  });

  it("strips trailing slashes from the slug", () => {
    expect(resolveImageSrc("images/a.png", "posts", "my-post/")).toBe(
      "/content/posts/my-post/images/a.png"
    );
  });

  describe("passes through sources that already resolve", () => {
    it("https URLs", () => {
      const url = "https://example.com/a.png";
      expect(resolveImageSrc(url, "posts", "my-post")).toBe(url);
    });

    it("http URLs", () => {
      const url = "http://example.com/a.png";
      expect(resolveImageSrc(url, "posts", "my-post")).toBe(url);
    });

    it("protocol-relative URLs", () => {
      expect(resolveImageSrc("//cdn.example.com/a.png", "posts", "my-post")).toBe(
        "//cdn.example.com/a.png"
      );
    });

    it("data URIs", () => {
      const uri = "data:image/png;base64,iVBORw0KGgo=";
      expect(resolveImageSrc(uri, "posts", "my-post")).toBe(uri);
    });

    it("root-relative paths", () => {
      expect(resolveImageSrc("/images/site/logo.png", "posts", "my-post")).toBe(
        "/images/site/logo.png"
      );
    });
  });

  describe("when there is no slug (unsaved post)", () => {
    it("returns the relative path unchanged rather than building a broken path", () => {
      expect(resolveImageSrc("images/a.png", "posts", undefined)).toBe("images/a.png");
    });

    it("still passes absolute URLs through", () => {
      expect(resolveImageSrc("https://example.com/a.png", "posts", undefined)).toBe(
        "https://example.com/a.png"
      );
    });

    it("treats a slug of only slashes as absent", () => {
      expect(resolveImageSrc("images/a.png", "posts", "///")).toBe("images/a.png");
    });
  });

  describe("empty input", () => {
    it("returns an empty string for undefined", () => {
      expect(resolveImageSrc(undefined, "posts", "my-post")).toBe("");
    });

    it("returns an empty string for blank/whitespace", () => {
      expect(resolveImageSrc("", "posts", "my-post")).toBe("");
      expect(resolveImageSrc("   ", "posts", "my-post")).toBe("");
    });
  });

  it("trims surrounding whitespace", () => {
    expect(resolveImageSrc("  images/a.png  ", "posts", "my-post")).toBe(
      "/content/posts/my-post/images/a.png"
    );
  });

  it("produces the same path the media API hands back for insertion", () => {
    // listMedia returns MediaItem.path as a relative "images/<file>" value, which
    // the editor inserts verbatim into the markdown.
    expect(resolveImageSrc("images/uploaded.png", "posts", "my-post")).toBe(
      "/content/posts/my-post/images/uploaded.png"
    );
  });
});
