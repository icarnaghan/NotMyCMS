/**
 * The Reconcile_Job's core, run by the Content_Repo's CI on push.
 *
 * The Content_Repo holds only content, at `content/{type}/{slug}/`. On every push its
 * pipeline runs this to turn that tree into the Published_Projection: it writes the
 * manifests, search index, RSS, sitemap and robots into a staging directory alongside a
 * copy of the content, and the CI then `aws s3 sync`s the staging directory to the
 * bucket and invalidates CloudFront.
 *
 * This script does the computing and the staging; it does not touch S3 or CloudFront.
 * That split keeps it runnable and testable locally with no credentials — point it at a
 * checkout and inspect the output — and leaves the AWS verbs to the CI, which already
 * has the OIDC role.
 *
 * It is deliberately standalone, importing only `build-artifacts.js`, so the Content_Repo
 * does not need the whole source tree — just this file, that module, gray-matter, and a
 * copy of `site.config.json`. The regeneration rule is therefore shared with the build
 * rather than being a third transcription of it.
 *
 * Usage:
 *   node reconcile.js --content <dir> --config <site.config.json> --out <staging-dir>
 *
 * The staging layout mirrors the bucket root:
 *   <out>/content/posts/<slug>/index.md          (+ images)
 *   <out>/content/knowledge-base/<slug>/index.md
 *   <out>/content/{posts,knowledge-base,pages}/manifest.json
 *   <out>/search-index.json  rss.xml  sitemap.xml  robots.txt
 */
import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
  rmSync,
} from "fs";
import { dirname, join } from "path";
import { buildArtifacts, buildPagesManifest } from "./build-artifacts.js";

function parseArgs(argv) {
  const args = { content: "content", config: "site.config.json", out: "dist-projection" };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--content") args.content = argv[++i];
    else if (a === "--config") args.config = argv[++i];
    else if (a === "--out") args.out = argv[++i];
    else {
      console.error(`Unknown argument: ${a}`);
      process.exit(1);
    }
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const postsDir = join(args.content, "posts");
  const kbDir = join(args.content, "knowledge-base");
  if (!existsSync(postsDir) && !existsSync(kbDir)) {
    console.error(`No content found under ${args.content}. Expected ${postsDir} or ${kbDir}.`);
    process.exit(1);
  }

  const siteConfig = JSON.parse(readFileSync(args.config, "utf-8"));

  // Landing pages now live in the Content_Repo at content/pages/<slug>/page.json
  // (landing-page-editor stage 3), so the sitemap's landing entries and the pages
  // manifest both come from that tree here — not from the compiled registry, which the
  // Content_Repo does not carry. This closes the previous gap where a reconcile omitted
  // landing pages from the sitemap because `site/pages/index.js` was absent.
  const pagesManifest = buildPagesManifest(join(args.content, "pages"));
  const registrySlugs = pagesManifest.map((p) => p.slug);

  const artifacts = buildArtifacts({
    postsDir,
    kbDir,
    registrySlugs,
    siteConfig,
  });

  // Fresh staging dir each run so a removed article does not linger in the output and
  // get re-synced.
  rmSync(args.out, { recursive: true, force: true });
  mkdirSync(args.out, { recursive: true });

  // Copy the content tree verbatim (markdown + images) under content/.
  //
  // Every collection directory is copied, not just the two that have manifests. `pages`
  // has no manifest — its items are standalone markdown served through ContentPage, e.g.
  // the /teaching/cmst388-tips guides — but it still lives in the bucket under content/,
  // and the CI sync prunes content/ with --delete. A collection left uncopied here would
  // therefore be deleted from the projection. So the rule is: the manifested collections
  // drive the derived artifacts, but the whole content/ tree is mirrored.
  const outContent = join(args.out, "content");
  const collections = readdirSync(args.content, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);
  for (const name of collections) {
    cpSync(join(args.content, name), join(outContent, name), { recursive: true });
  }

  // Write the derived artifacts in their bucket-root positions.
  const write = (rel, body) => {
    const dest = join(args.out, rel);
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, body);
  };
  write("content/posts/manifest.json", JSON.stringify(artifacts.postsManifest, null, 2));
  write("content/knowledge-base/manifest.json", JSON.stringify(artifacts.kbManifest, null, 2));
  // The pages manifest is derived from content/pages/ and written under content/, so the
  // CI's `aws s3 sync dist-projection/content/ --delete` carries it to S3. This is the
  // only publish path for the pages manifest — the site deploy excludes content/*.
  write("content/pages/manifest.json", JSON.stringify(pagesManifest, null, 2));
  write("search-index.json", JSON.stringify(artifacts.searchIndex, null, 2));
  write("rss.xml", artifacts.rss);
  write("sitemap.xml", artifacts.sitemap);
  write("robots.txt", artifacts.robots);

  console.log(
    `Reconciled ${artifacts.postsManifest.length} posts, ${artifacts.kbManifest.length} ` +
      `KB articles and ${pagesManifest.length} landing pages into ${args.out}/`
  );
}

main();
