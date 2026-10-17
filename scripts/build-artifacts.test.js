import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { slugify, isPublished, buildManifest, buildArtifacts } from "./build-artifacts.js";

const siteConfig = {
  siteUrl: "https://www.example.test",
  siteName: "Example",
  siteDescription: "An example",
  locale: "en-us",
};

let root;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "artifacts-"));
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

/** Write `<dir>/<slug>/index.md` with frontmatter + body. */
function writePost(dir, slug, frontmatter, body = "Body text here.") {
  const fm = Object.entries(frontmatter)
    .map(([k, v]) =>
      Array.isArray(v) ? `${k}:\n${v.map((x) => `  - ${x}`).join("\n")}` : `${k}: ${v}`
    )
    .join("\n");
  mkdirSync(join(dir, slug), { recursive: true });
  writeFileSync(join(dir, slug, "index.md"), `---\n${fm}\n---\n\n${body}`);
}

describe("slugify", () => {
  it("drops apostrophes rather than splitting on them", () => {
    expect(slugify("Don't Do This")).toBe("dont-do-this");
    expect(slugify("It\u2019s Fine")).toBe("its-fine");
  });
  it("collapses other non-alphanumerics to single hyphens and trims", () => {
    expect(slugify("  A, B & C!  ")).toBe("a-b-c");
  });
});

describe("isPublished", () => {
  const NOW = new Date("2026-01-01").getTime();
  it("excludes explicit drafts", () => {
    expect(isPublished({ draft: true, date: "2020-01-01" }, NOW)).toBe(false);
  });
  it("excludes future-dated posts", () => {
    expect(isPublished({ date: "2099-01-01" }, NOW)).toBe(false);
  });
  it("includes past-dated posts", () => {
    expect(isPublished({ date: "2020-01-01" }, NOW)).toBe(true);
  });
  it("treats missing or unparseable dates as published", () => {
    expect(isPublished({}, NOW)).toBe(true);
    expect(isPublished({ date: "not-a-date" }, NOW)).toBe(true);
  });
});

describe("buildManifest", () => {
  const NOW = new Date("2026-01-01").getTime();

  it("returns an empty manifest for a missing directory, rather than throwing", () => {
    expect(buildManifest(join(root, "does-not-exist"), NOW)).toEqual([]);
  });

  it("indexes published posts and sorts by date descending", () => {
    const dir = join(root, "posts");
    writePost(dir, "older", { title: "Older", date: "2020-01-01" });
    writePost(dir, "newer", { title: "Newer", date: "2024-01-01" });
    const manifest = buildManifest(dir, NOW);
    expect(manifest.map((e) => e.slug)).toEqual(["newer", "older"]);
  });

  it("omits drafts and future-dated posts", () => {
    const dir = join(root, "posts");
    writePost(dir, "live", { title: "Live", date: "2020-01-01" });
    writePost(dir, "draft", { title: "Draft", date: "2020-01-01", draft: true });
    writePost(dir, "future", { title: "Future", date: "2099-01-01" });
    expect(buildManifest(dir, NOW).map((e) => e.slug)).toEqual(["live"]);
  });

  it("advertises the title-derived slug", () => {
    const dir = join(root, "posts");
    writePost(dir, "whatever-dir", { title: "The Real Title", date: "2020-01-01" });
    expect(buildManifest(dir, NOW)[0].slug).toBe("the-real-title");
  });
});

describe("buildArtifacts", () => {
  const NOW = new Date("2026-01-01").getTime();

  function fixture() {
    const content = join(root, "content");
    writePost(join(content, "posts"), "hello-world", {
      title: "Hello World",
      date: "2024-01-01",
      description: "A greeting",
      tags: ["intro"],
    });
    writePost(join(content, "knowledge-base"), "a-fix", {
      title: "A Fix",
      date: "2023-01-01",
    });
    return {
      postsDir: join(content, "posts"),
      kbDir: join(content, "knowledge-base"),
    };
  }

  it("produces all five artifacts plus both manifests", () => {
    const { postsDir, kbDir } = fixture();
    const a = buildArtifacts({ postsDir, kbDir, registrySlugs: [], siteConfig, now: NOW });

    expect(a.postsManifest).toHaveLength(1);
    expect(a.kbManifest).toHaveLength(1);
    expect(a.searchIndex).toHaveLength(2);
    expect(a.rss).toContain("Hello World");
    expect(a.sitemap).toContain("https://www.example.test/hello-world");
    expect(a.sitemap).toContain("https://www.example.test/knowledge-base/a-fix");
    expect(a.robots).toContain("Sitemap: https://www.example.test/sitemap.xml");
  });

  it("puts the search index entries under the right basePath", () => {
    const { postsDir, kbDir } = fixture();
    const a = buildArtifacts({ postsDir, kbDir, registrySlugs: [], siteConfig, now: NOW });
    const post = a.searchIndex.find((e) => e.slug === "hello-world");
    const kb = a.searchIndex.find((e) => e.slug === "a-fix");
    expect(post.basePath).toBe("posts");
    expect(kb.basePath).toBe("knowledge-base");
  });

  it("includes the framework routes and the registry slugs in the sitemap", () => {
    const { postsDir, kbDir } = fixture();
    const a = buildArtifacts({
      postsDir,
      kbDir,
      registrySlugs: ["about", "apps"],
      siteConfig,
      now: NOW,
    });
    // Home as the bare origin.
    expect(a.sitemap).toContain("<loc>https://www.example.test/</loc>");
    expect(a.sitemap).toContain("<loc>https://www.example.test/posts</loc>");
    expect(a.sitemap).toContain("<loc>https://www.example.test/about</loc>");
    expect(a.sitemap).toContain("<loc>https://www.example.test/apps</loc>");
  });

  it("caps the RSS feed at 20 items", () => {
    const content = join(root, "content");
    for (let i = 0; i < 25; i++) {
      writePost(join(content, "posts"), `post-${i}`, {
        title: `Post ${i}`,
        date: `20${String(10 + i).padStart(2, "0")}-01-01`,
      });
    }
    const a = buildArtifacts({
      postsDir: join(content, "posts"),
      kbDir: join(content, "knowledge-base"),
      registrySlugs: [],
      siteConfig,
      now: new Date("2099-01-01").getTime(),
    });
    expect(a.rss.match(/<item>/g)).toHaveLength(20);
  });

  it("does not derive artifacts from unmanifested collections like pages", () => {
    // `pages` content exists in the tree but has no manifest — it is standalone markdown
    // served through ContentPage. buildArtifacts only knows posts and knowledge-base; the
    // reconcile copies the rest of the tree verbatim (covered in reconcile, not here).
    const content = join(root, "content");
    writePost(join(content, "posts"), "a-post", { title: "A Post", date: "2024-01-01" });
    writePost(join(content, "pages"), "a-guide", { title: "A Guide", date: "2024-01-01" });
    const a = buildArtifacts({
      postsDir: join(content, "posts"),
      kbDir: join(content, "knowledge-base"),
      registrySlugs: [],
      siteConfig,
      now: NOW,
    });
    // The guide is not in any manifest or the search index.
    expect(a.postsManifest.map((e) => e.slug)).toEqual(["a-post"]);
    expect(a.searchIndex.find((e) => e.slug === "a-guide")).toBeUndefined();
  });

  it("escapes XML metacharacters in titles", () => {
    const content = join(root, "content");
    writePost(join(content, "posts"), "amp", { title: "Tom & Jerry <x>", date: "2024-01-01" });
    const a = buildArtifacts({
      postsDir: join(content, "posts"),
      kbDir: join(content, "knowledge-base"),
      registrySlugs: [],
      siteConfig,
      now: NOW,
    });
    expect(a.rss).toContain("Tom &amp; Jerry &lt;x&gt;");
    expect(a.rss).not.toContain("Tom & Jerry <x>");
  });
});
