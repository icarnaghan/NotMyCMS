import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { execFileSync } from "child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

/**
 * Reconcile_Job staging.
 *
 * Runs the real script against a fixture content tree and inspects the staging output.
 * The case that matters most, and the one a dry-run against the real bucket caught before
 * the first push: a collection with no manifest (`pages`) must still be copied into the
 * projection, because the CI sync prunes `content/` with `--delete` — anything the
 * reconcile leaves out would be deleted from the live site. The three CMST 388 guides
 * live in exactly such a collection.
 */
describe("reconcile.js", () => {
  const SCRIPT = join(process.cwd(), "scripts", "reconcile.js");
  let root, contentDir, outDir, configPath;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "reconcile-"));
    contentDir = join(root, "content");
    outDir = join(root, "out");
    configPath = join(root, "site.config.json");
    writeFileSync(
      configPath,
      JSON.stringify({
        siteUrl: "https://www.example.test",
        siteName: "Example",
        siteDescription: "An example",
        locale: "en-us",
      })
    );
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  function writeItem(collection, slug, frontmatter, extraFiles = {}) {
    const dir = join(contentDir, collection, slug);
    mkdirSync(dir, { recursive: true });
    const fm = Object.entries(frontmatter)
      .map(([k, v]) => `${k}: ${v}`)
      .join("\n");
    writeFileSync(join(dir, "index.md"), `---\n${fm}\n---\n\nBody.`);
    for (const [name, body] of Object.entries(extraFiles)) {
      writeFileSync(join(dir, name), body);
    }
  }

  function run() {
    execFileSync(
      "node",
      [SCRIPT, "--content", contentDir, "--config", configPath, "--out", outDir],
      { encoding: "utf-8" }
    );
  }

  it("stages manifests and derived files at the bucket-root layout", () => {
    writeItem("posts", "hello", { title: "Hello", date: "2024-01-01" });
    writeItem("knowledge-base", "a-fix", { title: "A Fix", date: "2023-01-01" });
    run();

    expect(existsSync(join(outDir, "content/posts/manifest.json"))).toBe(true);
    expect(existsSync(join(outDir, "content/knowledge-base/manifest.json"))).toBe(true);
    expect(existsSync(join(outDir, "search-index.json"))).toBe(true);
    expect(existsSync(join(outDir, "rss.xml"))).toBe(true);
    expect(existsSync(join(outDir, "sitemap.xml"))).toBe(true);
    expect(existsSync(join(outDir, "robots.txt"))).toBe(true);
  });

  it("copies index.md and images verbatim", () => {
    writeItem(
      "posts",
      "with-image",
      { title: "With Image", date: "2024-01-01" },
      {
        "cover.png": "fake-png-bytes",
      }
    );
    run();

    expect(existsSync(join(outDir, "content/posts/with-image/index.md"))).toBe(true);
    expect(readFileSync(join(outDir, "content/posts/with-image/cover.png"), "utf-8")).toBe(
      "fake-png-bytes"
    );
  });

  it("copies an unmanifested collection so the sync's --delete cannot prune it", () => {
    writeItem("posts", "hello", { title: "Hello", date: "2024-01-01" });
    // `pages` has no manifest. It must still land in the projection.
    writeItem("pages", "a-guide", { title: "A Guide", date: "2024-01-01" });
    run();

    expect(existsSync(join(outDir, "content/pages/a-guide/index.md"))).toBe(true);
    // But it is not in any manifest or the search index.
    const search = JSON.parse(readFileSync(join(outDir, "search-index.json"), "utf-8"));
    expect(search.find((e) => e.slug === "a-guide")).toBeUndefined();
  });

  /** Write a landing page (page.json) at content/pages/<slug>/page.json. */
  function writeLandingPage(slug, page) {
    const dir = join(contentDir, "pages", slug);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "page.json"), JSON.stringify(page, null, 2));
  }

  it("derives content/pages/manifest.json and the sitemap from landing page.json files", () => {
    writeItem("posts", "hello", { title: "Hello", date: "2024-01-01" });
    writeLandingPage("about", {
      schemaVersion: 1,
      slug: "about",
      nav: { label: "About Me", order: 1 },
      seo: { title: "About Me", description: "Who I am." },
      header: { title: "About Me" },
      blocks: [{ id: "intro", type: "prose", version: 1, markdown: "Hi." }],
    });
    run();

    // The pages manifest exists and carries the landing page's slug/nav/seo.
    const pagesManifestPath = join(outDir, "content/pages/manifest.json");
    expect(existsSync(pagesManifestPath)).toBe(true);
    const pagesManifest = JSON.parse(readFileSync(pagesManifestPath, "utf-8"));
    expect(pagesManifest).toEqual([
      {
        slug: "about",
        nav: { label: "About Me", order: 1 },
        seo: { title: "About Me", description: "Who I am." },
      },
    ]);

    // The page.json is copied verbatim into the projection.
    expect(existsSync(join(outDir, "content/pages/about/page.json"))).toBe(true);

    // And the sitemap now includes the landing URL — the gap this closes.
    const sitemap = readFileSync(join(outDir, "sitemap.xml"), "utf-8");
    expect(sitemap).toContain("https://www.example.test/about<");
  });

  it("a markdown-only pages item (a child guide) is copied but is not a landing page", () => {
    // content/pages/<slug>/index.md is a ContentPage markdown guide, not a landing page.
    // It must be copied (so --delete can't prune it) but must NOT appear in the pages
    // manifest, which lists only page.json documents.
    writeItem("pages", "cmst388-tips/project-1", { title: "Project 1", date: "2024-01-01" });
    writeItem("posts", "hello", { title: "Hello", date: "2024-01-01" });
    run();

    expect(existsSync(join(outDir, "content/pages/cmst388-tips/project-1/index.md"))).toBe(true);
    const pagesManifest = JSON.parse(
      readFileSync(join(outDir, "content/pages/manifest.json"), "utf-8")
    );
    expect(pagesManifest).toEqual([]);
  });

  it("copies filenames containing spaces unchanged", () => {
    writeItem(
      "knowledge-base",
      "spaced",
      { title: "Spaced", date: "2024-01-01" },
      {
        "screenshot applying changes.png": "img",
      }
    );
    run();
    expect(
      existsSync(join(outDir, "content/knowledge-base/spaced/screenshot applying changes.png"))
    ).toBe(true);
  });

  it("starts each run from a clean staging dir, so a removed item does not linger", () => {
    writeItem("posts", "stays", { title: "Stays", date: "2024-01-01" });
    writeItem("posts", "goes", { title: "Goes", date: "2024-01-01" });
    run();
    expect(existsSync(join(outDir, "content/posts/goes/index.md"))).toBe(true);

    // Remove one item from the source and reconcile again.
    rmSync(join(contentDir, "posts", "goes"), { recursive: true });
    run();
    expect(existsSync(join(outDir, "content/posts/stays/index.md"))).toBe(true);
    expect(existsSync(join(outDir, "content/posts/goes/index.md"))).toBe(false);
  });
});
