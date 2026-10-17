/**
 * Builds the initial commit for the Content_Repo.
 *
 * Content is moving to a private repository of its own, where it becomes the source of
 * truth and S3 becomes a derived projection. This script produces that repository's first
 * commit from the content currently in this one, and proves the result is complete.
 *
 * Two decisions worth knowing about:
 *
 * **The file list comes from `git ls-files`, not from walking the directory.** The
 * working tree holds eight files git does not track: six `.DS_Store` and two generated
 * `manifest.json`. Walking the filesystem would carry all eight into the repository that
 * is about to become authoritative, and a skip-list would need maintaining forever. Git
 * already knows what is content, which is the premise of the whole migration.
 *
 * **Filenames are copied verbatim, including the mangled ones.** 88 tracked images have
 * base64 tails for names — `images/8s8AAAAAElFTkSuQmCC` and similar — almost certainly
 * from the original WordPress migration. All 88 are valid PNGs and every one is
 * referenced from a markdown file, so they are content, not debris. Renaming them here
 * would silently break 88 image references across the knowledge base. Normalising them
 * is a separate job with its own link rewriting.
 *
 * The `public/` prefix is dropped: the Content_Repo holds `content/{type}/{slug}/` at its
 * root. That is the one structural change, and it is why `s3KeyToRepoPath` loses a line
 * in stage 3.3.
 *
 * Usage:
 *   node scripts/seed-content-repo.js --out <dir> [--force] [--no-git]
 *   node scripts/seed-content-repo.js --out <dir> --verify-only
 *
 * `--verify-only` re-runs every check against an existing directory without writing, so
 * the same assertions can be run against a fresh clone after pushing.
 */
import { execFileSync } from "child_process";
import { createHash } from "crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync, statSync } from "fs";
import { homedir } from "os";
import { dirname, join, relative } from "path";
import { siteConfig } from "./site-config.js";

const SOURCE_PREFIX = "public/content";
const TARGET_PREFIX = "content";

/**
 * The stage 0 snapshot, used as an independent third opinion on completeness. The seed is
 * built from git and verified against the working tree; the snapshot was taken before any
 * of this work started, so it catches anything both of those have lost in step.
 *
 * Override with `--snapshot <dir>`, which is also how a framework installation with no
 * such snapshot skips the check.
 */
const DEFAULT_SNAPSHOT = join(
  homedir(),
  `${siteConfig.resourcePrefix}-content-snapshot-2026-10-05`,
  "content"
);

/**
 * Markdown files in the snapshot that should NOT be in the seed.
 *
 * These are the nine dead `pages` items deleted in task 6.4 — four superseded by React
 * components, five orphaned. Listing them explicitly turns the snapshot comparison into a
 * real assertion: the delta must be exactly this set. Anything else missing is a fault,
 * and an empty delta would mean the deletion never happened.
 */
const EXPECTED_ABSENT = [
  "pages/about/index.md",
  "pages/bitesize-javascript/index.md",
  "pages/contact/index.md",
  "pages/cookie-policy/index.md",
  "pages/curriculum-start/index.md",
  "pages/home/index.md",
  "pages/privacy-policy/index.md",
  "pages/publications/index.md",
  "pages/teaching/index.md",
];

function parseArgs(argv) {
  const args = { out: null, force: false, git: true, verifyOnly: false, snapshot: null };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--out") args.out = argv[++i];
    else if (arg === "--snapshot") args.snapshot = argv[++i];
    else if (arg === "--force") args.force = true;
    else if (arg === "--no-git") args.git = false;
    else if (arg === "--verify-only") args.verifyOnly = true;
    else {
      console.error(`Unknown argument: ${arg}`);
      process.exit(1);
    }
  }
  if (!args.out) {
    args.out = join(homedir(), `${siteConfig.resourcePrefix}-content-repo`);
  }
  if (!args.snapshot) args.snapshot = DEFAULT_SNAPSHOT;
  return args;
}

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

/** Content files this repository tracks, as paths relative to `public/content`. */
function trackedContentFiles() {
  const output = execFileSync("git", ["ls-files", "-z", SOURCE_PREFIX], {
    encoding: "utf-8",
    maxBuffer: 64 * 1024 * 1024,
  });
  return output
    .split("\0")
    .filter(Boolean)
    .map((p) => relative(SOURCE_PREFIX, p))
    .sort();
}

/** Every file under a directory, relative to it. Used to inspect the seed and snapshot. */
function walk(root, base = root) {
  if (!existsSync(root)) return [];
  const out = [];
  for (const entry of readdirSync(root)) {
    const full = join(root, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full, base));
    else out.push(relative(base, full));
  }
  return out.sort();
}

function readme() {
  return `# ${siteConfig.siteTitle} — content

Content for [${siteConfig.siteTitle}](${siteConfig.siteUrl}). **This repository is the
source of truth.** The copies in S3 are a derived projection, rebuilt from here.

## Layout

    content/posts/<slug>/index.md
    content/posts/<slug>/images/...
    content/knowledge-base/<slug>/index.md
    content/pages/<slug>/index.md

One directory per item, \`index.md\` plus any images it references.

## Authoring

Clone, edit, commit, push. No bespoke tooling. A push triggers the Reconcile_Job, which
syncs changed content into the projection, regenerates the manifests, search index, RSS
and sitemap, and invalidates the CDN.

Editing through the admin panel commits here first and only then updates the projection,
so a failed commit fails the save rather than leaving the two out of step.

## A note on image filenames

88 images in \`knowledge-base\` have base64 tails for filenames, left over from the
original WordPress migration. They are valid PNGs and are referenced from markdown. Do
not rename them without rewriting the references.
`;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const contentRoot = join(args.out, TARGET_PREFIX);

  const tracked = trackedContentFiles();
  console.log(`Source: ${tracked.length} tracked files under ${SOURCE_PREFIX}/`);

  if (!args.verifyOnly) {
    if (existsSync(args.out) && readdirSync(args.out).length > 0 && !args.force) {
      console.error(`FAIL: ${args.out} exists and is not empty. Pass --force to overwrite.`);
      process.exit(1);
    }

    let written = 0;
    for (const rel of tracked) {
      const from = join(SOURCE_PREFIX, rel);
      const to = join(contentRoot, rel);
      mkdirSync(dirname(to), { recursive: true });
      writeFileSync(to, readFileSync(from));
      written++;
    }
    writeFileSync(join(args.out, "README.md"), readme());
    console.log(`Wrote:  ${written} files to ${contentRoot}/`);
  }

  // --- Verification ---------------------------------------------------------------
  const problems = [];

  // 1. The seed holds exactly the tracked set, byte for byte.
  const seeded = walk(contentRoot);
  const trackedSet = new Set(tracked);
  const seededSet = new Set(seeded);

  for (const rel of tracked) {
    if (!seededSet.has(rel)) problems.push(`missing from seed: ${rel}`);
  }
  for (const rel of seeded) {
    if (!trackedSet.has(rel)) problems.push(`unexpected in seed: ${rel}`);
  }

  let hashed = 0;
  for (const rel of tracked) {
    const from = join(SOURCE_PREFIX, rel);
    const to = join(contentRoot, rel);
    if (!existsSync(to)) continue;
    if (sha256(from) !== sha256(to)) problems.push(`content differs: ${rel}`);
    hashed++;
  }
  console.log(`Hashed: ${hashed} files against the working tree`);

  // 2. Nothing the working tree holds is absent, and nothing extra crept in. The eight
  //    untracked files are expected to be absent and are named so the output is explicit
  //    rather than a silent count mismatch.
  const onDisk = walk(SOURCE_PREFIX);
  const untracked = onDisk.filter((rel) => !trackedSet.has(rel));
  if (untracked.length > 0) {
    console.log(`Excluded ${untracked.length} untracked file(s), as intended:`);
    for (const rel of untracked) console.log(`  - ${rel}`);
  }

  // 3. The snapshot, as an independent check on completeness.
  if (!existsSync(args.snapshot)) {
    console.log(`\nWARNING: snapshot not found at ${args.snapshot} — skipped that check.`);
  } else {
    const snapMd = walk(args.snapshot).filter((rel) => rel.endsWith(".md"));
    const absent = snapMd.filter((rel) => !seededSet.has(rel));
    const expected = new Set(EXPECTED_ABSENT);

    for (const rel of absent) {
      if (!expected.has(rel)) problems.push(`in the stage 0 snapshot but not the seed: ${rel}`);
    }
    for (const rel of EXPECTED_ABSENT) {
      if (seededSet.has(rel)) problems.push(`deleted in task 6.4 but present in the seed: ${rel}`);
    }

    let identical = 0;
    let changed = 0;
    for (const rel of snapMd) {
      if (!seededSet.has(rel)) continue;
      if (sha256(join(args.snapshot, rel)) === sha256(join(contentRoot, rel))) identical++;
      else changed++;
    }
    console.log(
      `Snapshot: ${snapMd.length} markdown files, ${absent.length} absent ` +
        `(${EXPECTED_ABSENT.length} expected), ${identical} identical, ${changed} edited since`
    );
  }

  if (problems.length > 0) {
    console.error(`\nFAIL: ${problems.length} problem(s):`);
    for (const p of problems.slice(0, 40)) console.error(`  - ${p}`);
    if (problems.length > 40) console.error(`  ... and ${problems.length - 40} more`);
    process.exit(1);
  }

  // --- First commit --------------------------------------------------------------
  if (!args.verifyOnly && args.git) {
    const run = (cmd, cmdArgs) =>
      execFileSync(cmd, cmdArgs, { cwd: args.out, encoding: "utf-8", stdio: "pipe" });
    if (!existsSync(join(args.out, ".git"))) {
      run("git", ["init", "--initial-branch", siteConfig.git.branch]);
    }
    run("git", ["add", "."]);
    const staged = run("git", ["diff", "--cached", "--numstat"]).trim();
    if (staged) {
      run("git", [
        "commit",
        "-m",
        `Seed from the source repository\n\n` +
          `${tracked.length} files, the complete tracked content tree, with the public/ ` +
          `prefix dropped.\nVerified by hash against the working tree and against the ` +
          `pre-migration snapshot.\n`,
      ]);
      console.log(`\nCommitted ${tracked.length} files in ${args.out}`);
    } else {
      console.log(`\nNothing to commit — ${args.out} already matches.`);
    }
  }

  console.log("\nOK: seed is complete and matches the working tree.");
  if (!args.verifyOnly) {
    console.log(`\nNext, in ${args.out}:`);
    console.log("  git remote add origin <url-of-the-new-private-repo>");
    console.log(`  git push -u origin ${siteConfig.git.branch}`);
  }
}

main();
