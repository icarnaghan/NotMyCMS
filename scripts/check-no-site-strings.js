/**
 * Guards the decoupling achieved in the configurable-site spec.
 *
 * Fails if the site's own identity strings appear in code outside
 * `site.config.json`. Without this, the next hardcoded domain or author name goes in
 * unnoticed and the framework extraction quietly regresses.
 *
 * The needles are read from the config, so this checks "no code hardcodes *this* site"
 * rather than a fixed list of strings — the check keeps working for a different
 * deployment.
 */
import { readFileSync, readdirSync, statSync } from "fs";
import { join, relative } from "path";

/**
 * Directories scanned for hardcoded site identity.
 *
 * `site/` is deliberately absent. It holds content — what this site says about itself —
 * and the `/about` page genuinely names its own domain in prose. Scanning it would force
 * that prose into configuration, which is worse than the duplication. `site/` is the
 * directory a framework consumer replaces wholesale.
 */
const ROOTS = ["src", "admin/src", "scripts", "infra/lib", "infra/lambda"];
const EXTENSIONS = [".ts", ".tsx", ".js", ".jsx"];

/**
 * Individually named files outside the roots above.
 *
 * The two HTML templates are fed by the site-html Vite plugin and the Makefile reads
 * the config via `node -p`, so all three are decoupled — but none of them has an
 * extension or location the walk would pick up, and a hardcoded value creeping back
 * into any of them is exactly the regression this guards.
 */
const FILES = ["index.html", "admin/index.html", "Makefile"];

/**
 * Paths allowed to contain site strings, each with a reason.
 *
 * Every remaining entry is either an accessor for the config itself or infrastructure
 * awaiting a later stage. The content exceptions are gone: stage 3 moved the `/about`
 * prose and the app repository URLs into `site/pages/`, which is content by design and
 * outside this check's scope.
 */
const ALLOWED = [
  {
    path: "src/lib/site-config.ts",
    reason: "the accessor itself",
  },
  {
    path: "admin/src/lib/site-config.ts",
    reason: "the accessor itself",
  },
  {
    path: "scripts/site-config.js",
    reason: "the accessor itself",
  },
  {
    path: "infra/lib/site-config.ts",
    reason: "the accessor itself",
  },

  {
    path: "infra/lambda/shared/gitlab.ts",
    reason: "pending the content-storage spec — provider abstraction and repoint",
  },
  {
    path: "src/pages/landing/test-pages-fixture.ts",
    reason:
      "test data: a verbatim capture of the five landing pages' content (which legitimately " +
      "mentions the site), used by the route/nav tests after the compiled registry was removed. " +
      "Content by design, like the former site/pages/*.json, which this check never scanned.",
  },
];

function isTest(path) {
  return path.includes(".test.") || path.includes("__tests__");
}

function walk(dir, out = []) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (entry === "node_modules" || entry === "dist" || entry === "cdk.out") continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      walk(full, out);
    } else if (EXTENSIONS.some((e) => entry.endsWith(e)) && !isTest(full)) {
      out.push(full);
    }
  }
  return out;
}

/** Identity strings worth guarding, derived from the config rather than hardcoded. */
function needles(config) {
  const set = new Set();
  const add = (v) => {
    if (typeof v === "string" && v.trim().length >= 4) set.add(v);
  };
  add(config.apexDomain);
  add(config.domain);
  add(config.siteUrl);
  add(config.siteName);
  add(config.author?.name);
  add(config.author?.email);
  add(config.resourcePrefix);
  add(config.analytics?.measurementId);
  return [...set];
}

const config = JSON.parse(readFileSync("site.config.json", "utf-8"));
const terms = needles(config);
const allowedPaths = new Set(ALLOWED.map((a) => a.path));

const violations = [];
const scanned = [...ROOTS.flatMap((root) => walk(root)), ...FILES];

for (const file of scanned) {
  const rel = relative(".", file);
  if (allowedPaths.has(rel)) continue;
  const text = readFileSync(file, "utf-8");
  for (const term of terms) {
    if (text.includes(term)) {
      const line = text.split("\n").findIndex((l) => l.includes(term)) + 1;
      violations.push({ file: rel, line, term });
    }
  }
}

if (violations.length > 0) {
  console.error(`FAIL: ${violations.length} hardcoded site string(s) outside site.config.json:`);
  for (const v of violations) {
    console.error(`  ${v.file}:${v.line}  contains "${v.term}"`);
  }
  console.error("\nRead the value from site config, or add a documented exception to");
  console.error("the ALLOWED list in scripts/check-no-site-strings.js.");
  process.exit(1);
}

console.log(`OK: no hardcoded site strings in ${[...ROOTS, ...FILES].join(", ")}`);
console.log(
  `    (${scanned.length} files, ${ALLOWED.length} documented exceptions, ` +
    `${terms.length} terms checked)`
);
