/**
 * Build fingerprint: a stable summary of the built site, used to prove a refactor
 * did not change the default output.
 *
 *   node scripts/build-fingerprint.js --out <file>        record a baseline
 *   node scripts/build-fingerprint.js --check <baseline>  compare the current build
 *
 * What is recorded (all independent of Vite's content hashes):
 *  - sha256 of the generated meta files and the content manifests
 *  - one aggregate hash over the head of every prerendered index.html, with
 *    /assets/<name>-<hash>.<ext> normalized to /assets/<name>.<ext>
 *  - raw and gzip size of each asset, keyed by the hash-stripped name
 *  - the content commit, so two fingerprints are only compared when they were
 *    built from the same content
 */
import { createHash } from "crypto";
import { existsSync, readdirSync, readFileSync, realpathSync, statSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { gzipSync } from "zlib";
import { execFileSync } from "child_process";

const DIST = "dist";
const META_FILES = ["sitemap.xml", "rss.xml", "search-index.json", "robots.txt"];
const MANIFESTS = ["posts", "knowledge-base", "pages"].map((d) => `content/${d}/manifest.json`);
/** Vite emits `name-<8 chars of base64url>.ext`. */
const ASSET_HASH = /-[A-Za-z0-9_-]{8}(?=\.[a-z]+)/g;

export const sha256 = (data) => createHash("sha256").update(data).digest("hex");

/** Remove Vite's content hash from asset names, in a path or in HTML. */
export function stripAssetHashes(text) {
  return text.replace(/(\/assets\/[^"'\s)]+)/g, (m) => m.replace(ASSET_HASH, ""));
}

/** The part of a prerendered page that is not the app body. */
export function headOf(html) {
  const m = html.match(/<head[\s\S]*?<\/head>/i);
  return m ? m[0] : html;
}

/** Hash of all prerendered route heads, in sorted route order. */
export function aggregateHeads(entries) {
  const h = createHash("sha256");
  for (const [route, html] of [...entries].sort(([a], [b]) => a.localeCompare(b))) {
    h.update(`${route}\n${stripAssetHashes(headOf(html))}\n`);
  }
  return h.digest("hex");
}

function routeDirs(root) {
  const out = [];
  for (const name of readdirSync(root, { withFileTypes: true })) {
    if (!name.isDirectory() || name.name === "assets" || name.name === "content") continue;
    const file = join(root, name.name, "index.html");
    if (existsSync(file)) out.push([name.name, readFileSync(file, "utf8")]);
  }
  const index = join(root, "index.html");
  if (existsSync(index)) out.push(["", readFileSync(index, "utf8")]);
  return out;
}

function assetSizes(root) {
  const dir = join(root, "assets");
  const sizes = {};
  for (const f of readdirSync(dir).sort()) {
    const buf = readFileSync(join(dir, f));
    sizes[f.replace(ASSET_HASH, "")] = { raw: buf.length, gzip: gzipSync(buf).length };
  }
  return sizes;
}

function contentCommit() {
  const target = realpathSync(join("public", "content"));
  const repo = dirname(target);
  try {
    return execFileSync("git", ["-C", repo, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  } catch {
    return "unknown";
  }
}

export function fingerprint(root = DIST) {
  const files = {};
  for (const f of [...META_FILES, ...MANIFESTS]) {
    const p = join(root, f);
    files[f] = existsSync(p) ? sha256(readFileSync(p)) : null;
  }
  const routes = routeDirs(root);
  return {
    contentCommit: contentCommit(),
    files,
    routeCount: routes.length,
    headsHash: aggregateHeads(routes),
    assets: assetSizes(root),
  };
}

/** Differences between two fingerprints. Sizes are reported, not failed, unless asked. */
export function compare(base, cur) {
  const problems = [];
  const notes = [];
  for (const k of Object.keys({ ...base.files, ...cur.files })) {
    if (base.files[k] !== cur.files[k]) problems.push(`file changed: ${k}`);
  }
  if (base.routeCount !== cur.routeCount) {
    problems.push(`route count ${base.routeCount} -> ${cur.routeCount}`);
  }
  if (base.headsHash !== cur.headsHash) problems.push("prerendered heads changed");
  for (const k of Object.keys({ ...base.assets, ...cur.assets })) {
    const a = base.assets[k];
    const b = cur.assets[k];
    if (!a) notes.push(`asset added: ${k} (${b.gzip} B gzip)`);
    else if (!b) notes.push(`asset removed: ${k}`);
    else if (a.raw !== b.raw) {
      const pct = (((b.gzip - a.gzip) / a.gzip) * 100).toFixed(1);
      notes.push(`asset size: ${k} gzip ${a.gzip} -> ${b.gzip} (${pct}%)`);
    }
  }
  return { problems, notes };
}

function main(argv) {
  const mode = argv[0];
  const arg = argv[1];
  if (!arg || (mode !== "--out" && mode !== "--check")) {
    console.error("usage: build-fingerprint.js --out <file> | --check <baseline>");
    return 2;
  }
  if (!existsSync(DIST) || !statSync(DIST).isDirectory()) {
    console.error("dist/ not found. Run `make build` first.");
    return 2;
  }
  const cur = fingerprint();
  if (mode === "--out") {
    writeFileSync(arg, JSON.stringify(cur, null, 2) + "\n");
    console.log(
      `Wrote ${arg} (${cur.routeCount} routes, content ${cur.contentCommit.slice(0, 8)})`
    );
    return 0;
  }
  const base = JSON.parse(readFileSync(arg, "utf8"));
  if (base.contentCommit !== cur.contentCommit) {
    console.error(
      `Content commit differs (baseline ${base.contentCommit.slice(0, 8)}, current ${cur.contentCommit.slice(0, 8)}). ` +
        "Check out the baseline content commit or record a new baseline."
    );
    return 2;
  }
  const { problems, notes } = compare(base, cur);
  for (const n of notes) console.log(`note: ${n}`);
  if (problems.length) {
    for (const p of problems) console.error(`FAIL: ${p}`);
    return 1;
  }
  console.log("Fingerprint matches baseline.");
  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) process.exit(main(process.argv.slice(2)));
