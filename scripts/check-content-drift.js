/**
 * Compares the authoritative content tree against the content in S3.
 *
 * The Content_Repo is the source of truth; S3 is a derived projection. The two can
 * diverge in both directions:
 *
 *   in S3, not in git   an admin edit whose commit failed, or an orphan left behind by a
 *                       reconcile that did not prune it
 *   in git, not in S3   content committed to the Content_Repo but never reconciled
 *
 * The authoritative tree is read from `CONTENT_ROOT` (default: a Content_Repo clone,
 * `~/<prefix>-content-repo/content`), since `public/content` no longer exists in this
 * repository — content moved out in content-storage stage 7. Point it at a fresh clone,
 * or `make content-drift` passes the one the other content targets use.
 *
 * This was first written after three orphans sat in `content/knowledge-base/` for a day,
 * back when two deploy paths (a pipeline build from git, an admin regenerate from S3)
 * could disagree about the article count depending on which ran last. The Reconcile_Job
 * unified those paths, but a drift check is still worth having after a content move or
 * when a count looks wrong.
 *
 * Needs AWS credentials, so it is a `make` target rather than part of `make check` or a
 * CI lint job — the same constraint as `check-admin-env`.
 */
import { execFileSync } from "child_process";
import { existsSync, readdirSync, statSync } from "fs";
import { join } from "path";
import { siteConfig } from "./site-config.js";

/** Content collections, each a directory of `<slug>/index.md`. */
const COLLECTIONS = ["posts", "knowledge-base", "pages"];
const LOCAL_ROOT = process.env.CONTENT_ROOT || "public/content";
const S3_PREFIX = "content";

const bucket = siteConfig.apexDomain;

/** Slugs present in the working tree for one collection. */
function localSlugs(collection) {
  const dir = join(LOCAL_ROOT, collection);
  if (!existsSync(dir)) return new Set();
  return new Set(
    readdirSync(dir).filter((entry) => {
      const full = join(dir, entry);
      // Skip the generated manifest.json and any stray file — a slug is a directory
      // containing index.md, which is what both the build and the admin treat as an
      // article.
      return statSync(full).isDirectory() && existsSync(join(full, "index.md"));
    })
  );
}

/** Slugs present in S3 for one collection. */
function remoteSlugs(collection) {
  const prefix = `${S3_PREFIX}/${collection}/`;
  let output;
  try {
    output = execFileSync("aws", ["s3", "ls", `s3://${bucket}/${prefix}`, "--recursive"], {
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "pipe"],
      maxBuffer: 32 * 1024 * 1024,
    });
  } catch (error) {
    console.error(`FAIL: could not list s3://${bucket}/${prefix}`);
    console.error("This needs AWS credentials. Run `aws login` or check AWS_PROFILE.");
    const detail = error.stderr?.toString().trim();
    if (detail) console.error(`\n${detail}`);
    process.exit(1);
  }

  const slugs = new Set();
  for (const line of output.split("\n")) {
    // `aws s3 ls --recursive` columns: date, time, size, key
    const key = line.trim().split(/\s+/).slice(3).join(" ");
    if (!key.endsWith("/index.md")) continue;
    const slug = key.slice(prefix.length, -"/index.md".length);
    // Only direct children. A nested path would be a different shape than either
    // consumer expects and is worth seeing rather than silently flattening.
    if (slug && !slug.includes("/")) slugs.add(slug);
  }
  return slugs;
}

const findings = [];
let drifted = false;

for (const collection of COLLECTIONS) {
  const local = localSlugs(collection);
  const remote = remoteSlugs(collection);

  const onlyRemote = [...remote].filter((s) => !local.has(s)).sort();
  const onlyLocal = [...local].filter((s) => !remote.has(s)).sort();

  findings.push({
    collection,
    localCount: local.size,
    remoteCount: remote.size,
    onlyRemote,
    onlyLocal,
  });

  if (onlyRemote.length > 0 || onlyLocal.length > 0) drifted = true;
}

const width = Math.max(...COLLECTIONS.map((c) => c.length));
console.log("collection".padEnd(width) + "   git    s3");
for (const f of findings) {
  const flag = f.onlyRemote.length || f.onlyLocal.length ? "  <- drift" : "";
  console.log(
    `${f.collection.padEnd(width)}  ${String(f.localCount).padStart(4)}  ${String(
      f.remoteCount
    ).padStart(4)}${flag}`
  );
}

if (!drifted) {
  console.log("\nOK: git and S3 agree on every collection");
  process.exit(0);
}

console.error("\nFAIL: content has drifted between git and S3.");

for (const f of findings) {
  if (f.onlyRemote.length > 0) {
    console.error(`\n  ${f.collection}: ${f.onlyRemote.length} in S3 but not in git`);
    for (const slug of f.onlyRemote) console.error(`    ${slug}`);
    console.error(
      `\n    Either an admin edit whose git mirror failed, or an orphan from a move\n` +
        `    reverted in git but not in the bucket. If it is real content, pull it into\n` +
        `    git. If it is an orphan, delete it:\n` +
        `      aws s3 rm "s3://${bucket}/${S3_PREFIX}/${f.collection}/<slug>/" --recursive`
    );
  }
  if (f.onlyLocal.length > 0) {
    console.error(`\n  ${f.collection}: ${f.onlyLocal.length} in git but not in S3`);
    for (const slug of f.onlyLocal) console.error(`    ${slug}`);
    console.error("\n    Committed but never published. A deploy should publish it.");
  }
}

console.error("\nAfter fixing, deploy so the manifest, search index and sitemap are rebuilt.");
process.exit(1);
