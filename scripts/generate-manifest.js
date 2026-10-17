/**
 * Build-time artifact generation.
 *
 * Reads the content tree and writes the manifests, search index, RSS, sitemap and robots
 * into `public/`, which `vite build` then copies into `dist/`. The two `manifest.json`
 * files are written under `public/content/{type}/` so they land at `dist/content/{type}/`,
 * where `generate-meta-pages.js` reads them.
 *
 * **Where content is read from.** By default `public/content`, which is how this ran
 * before content moved to its own repository. Set `CONTENT_ROOT` to read from a clone of
 * the Content_Repo instead — the content-storage migration points the CI build at a
 * clone, and `public/content` no longer exists there. Either way the markdown is only
 * *read*; the deploy excludes `content/*` (the Reconcile_Job owns that prefix in S3), so
 * the only thing this writes into the content tree is the generated manifests, which vite
 * carries into `dist/` for the meta-page step.
 *
 * The logic lives in `build-artifacts.js`, shared with the Content_Repo's reconcile job
 * so the publish rule has one definition across the two Node callers. This file is only
 * the build's wiring: where to read from and where to write to.
 */
import { mkdirSync, writeFileSync } from "fs";
import { siteConfig } from "./site-config.js";
import { buildArtifacts, buildPagesManifest } from "./build-artifacts.js";

// Default to the in-repo content tree; override with CONTENT_ROOT to build from a clone.
const CONTENT_ROOT = process.env.CONTENT_ROOT || "public/content";

// Landing pages are runtime content now (landing-page-editor stage 4): the compiled
// registry is gone, and the manifest + sitemap slugs are derived from the content tree
// — `content/pages/<slug>/page.json` — exactly as reconcile does. This is the same tree
// the SPA fetches from at runtime, so the build and the live site agree by construction.
const pagesManifest = buildPagesManifest(`${CONTENT_ROOT}/pages`);

const artifacts = buildArtifacts({
  postsDir: `${CONTENT_ROOT}/posts`,
  kbDir: `${CONTENT_ROOT}/knowledge-base`,
  registrySlugs: pagesManifest.map((p) => p.slug),
  siteConfig,
});

// The manifests go under public/content/{type}/ so vite copies them to dist/content/{type}/.
// The directories may not exist when building from a clone (public/content is gone), so
// create them; writing the manifest is the only reason public/content exists at build time
// once the markdown lives elsewhere.
mkdirSync("public/content/posts", { recursive: true });
mkdirSync("public/content/knowledge-base", { recursive: true });

writeFileSync(
  "public/content/posts/manifest.json",
  JSON.stringify(artifacts.postsManifest, null, 2)
);
writeFileSync(
  "public/content/knowledge-base/manifest.json",
  JSON.stringify(artifacts.kbManifest, null, 2)
);
// The pages manifest lands at public/content/pages/manifest.json so vite copies it to
// dist/content/pages/manifest.json, where the SPA fetches it at startup.
mkdirSync("public/content/pages", { recursive: true });
writeFileSync("public/content/pages/manifest.json", JSON.stringify(pagesManifest, null, 2));
writeFileSync("public/search-index.json", JSON.stringify(artifacts.searchIndex, null, 2));
writeFileSync("public/rss.xml", artifacts.rss);
writeFileSync("public/sitemap.xml", artifacts.sitemap);
writeFileSync("public/robots.txt", artifacts.robots);

console.log(
  `Generated from ${CONTENT_ROOT}: ${artifacts.postsManifest.length} posts, ` +
    `${artifacts.kbManifest.length} KB articles, ${pagesManifest.length} landing pages, ` +
    `search index, RSS feed, sitemap, robots.txt`
);
