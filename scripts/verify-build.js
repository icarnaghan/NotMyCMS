/**
 * Post-build assertions.
 *
 * Two generators and one hand-maintained list have to agree about which routes exist:
 * `generate-manifest.js` (sitemap), `generate-meta-pages.js` (prerendered `<head>`), and
 * STATIC_ROUTES below. A route added to only one of them produces a build that looks
 * fine — the page renders client-side — but has no sitemap entry or serves the generic
 * head to crawlers. That failure has happened here more than once, which is why the
 * third list is deliberately independent rather than derived.
 *
 * Also checks the injected document head. `index.html` is fed from `site.config.json`
 * at build time (see `inject-site-html.ts`); if that injection silently no-ops, every
 * page still works and the head is wrong everywhere.
 *
 * Was a shell loop in the Makefile. Moved here so it can read the site config instead
 * of hardcoding the domain, and so the head assertions can be expressed readably.
 */
import { existsSync, readdirSync, readFileSync } from "fs";
import { siteConfig } from "./site-config.js";

const DIST = "dist";

/**
 * Routes with no manifest of their own, maintained by hand.
 *
 * Keep in sync with the `staticPages` arrays in both generators. The duplication is the
 * point: this list is the independent check on them.
 */
const STATIC_ROUTES = [
  "posts",
  "knowledge-base",
  "categories",
  "tags",
  "about",
  "apps",
  "teaching",
  "bitesize-javascript",
  "teaching/cmst388-tips",
  "teaching/cmst388-tips/project-1-javascript-selectors",
  "teaching/cmst388-tips/project-3-ticket-purchasing",
  "teaching/cmst388-tips/project-4-student-portfolio",
];

const failures = [];

function fail(message, hint) {
  failures.push(hint ? `${message}\n    ${hint}` : message);
}

// --- Routes ---

const sitemapPath = `${DIST}/sitemap.xml`;
if (!existsSync(sitemapPath)) {
  console.error(`FAIL: ${sitemapPath} missing — run 'make build'`);
  process.exit(1);
}
const sitemap = readFileSync(sitemapPath, "utf-8");

for (const route of STATIC_ROUTES) {
  if (!sitemap.includes(`${siteConfig.siteUrl}/${route}<`)) {
    fail(
      `${route} is missing from the sitemap`,
      "add it to the staticPages array in scripts/generate-manifest.js"
    );
  }
  if (!existsSync(`${DIST}/${route}/index.html`)) {
    fail(
      `${route} has no prerendered <head>`,
      "add it to scripts/generate-meta-pages.js, or it will serve the generic head"
    );
  }
}

// --- Landing pages ---
// Landing pages are runtime content now (landing-page-editor stage 4): the compiled
// registry is gone, and both generators read the built pages manifest
// (dist/content/pages/manifest.json), which the build derived from the content tree. This
// asserts every page in that manifest got a correct prerendered head and sitemap entry —
// the half STATIC_ROUTES cannot cover (a page missing from the manifest is missing from
// the hand-maintained list too, and two lists agreeing on an omission is not agreement).
const pagesManifest = JSON.parse(readFileSync(`${DIST}/content/pages/manifest.json`, "utf-8"));

for (const page of pagesManifest) {
  const metaPath = `${DIST}/${page.slug}/index.html`;

  if (!existsSync(metaPath)) {
    fail(
      `landing page ${page.slug} has no prerendered <head>`,
      "generate-meta-pages.js reads dist/content/pages/manifest.json; did the build run it?"
    );
    continue;
  }

  // The prerendered head must carry the page's own metadata, not the site-wide
  // fallback. Serving the generic head is the failure that went unnoticed for
  // /teaching/cmst388-tips before it was in either generator.
  const meta = readFileSync(metaPath, "utf-8");
  const expectedTitle = `<title>${page.seo.title} | ${siteConfig.siteName}</title>`;
  if (!meta.includes(expectedTitle)) {
    fail(`landing page ${page.slug} has the wrong prerendered title`, `expected: ${expectedTitle}`);
  }
  if (!meta.includes(page.seo.description)) {
    fail(
      `landing page ${page.slug} is missing its meta description`,
      `expected to find: ${page.seo.description}`
    );
  }
  if (!sitemap.includes(`${siteConfig.siteUrl}/${page.slug}<`)) {
    fail(
      `landing page ${page.slug} is missing from the sitemap`,
      "generate-manifest.js derives landing slugs from the content tree; did the build run it?"
    );
  }
}

// --- Injected document head ---

const indexPath = `${DIST}/index.html`;
if (!existsSync(indexPath)) {
  console.error(`FAIL: ${indexPath} missing — run 'make build'`);
  process.exit(1);
}
const index = readFileSync(indexPath, "utf-8");

const expected = [
  ["title", `<title>${siteConfig.siteTitle}</title>`],
  ["canonical link", `<link rel="canonical" href="${siteConfig.siteUrl}" />`],
  ["html lang", `lang="${siteConfig.locale}"`],
  ["feed title", `title="${siteConfig.siteName}"`],
];

if (siteConfig.analytics?.measurementId) {
  const id = siteConfig.analytics.measurementId;
  expected.push(
    ["analytics tag", `gtag/js?id=${id}`],
    ["analytics config", `gtag("config", "${id}")`],
    // The inline bootstrap reads this key before gtag loads. src/lib/settings-preferences.ts
    // derives the same key independently, so this is where the two are confirmed equal.
    [
      "opt-out bootstrap key",
      `localStorage.getItem("${siteConfig.storagePrefix}-analytics-opt-out")`,
    ]
  );
}

for (const [label, needle] of expected) {
  if (!index.includes(needle)) {
    fail(`dist/index.html is missing the injected ${label}`, `expected to find: ${needle}`);
  }
}

if (/\{\{[A-Z0-9_]+\}\}/.test(index)) {
  fail(
    "dist/index.html still contains an unsubstituted placeholder",
    "the site-html Vite plugin did not run"
  );
}

// --- Prose spacing rules ---
// Markdown emits unclassed <p> elements that keep the browser's default margin-block,
// which stacks on top of the gap SpaceBetween already provides. `src/styles.css`
// collapses the outer edges so landing pages match the components they replaced.
//
// Checked here rather than in a unit test because Vitest stubs CSS imports to an empty
// string by default, so a test cannot see the stylesheet. Asserting against the built
// output is also the stronger claim: it checks what actually ships.

const cssFiles = readdirSync(`${DIST}/assets`).filter((f) => f.endsWith(".css"));
const allCss = cssFiles.map((f) => readFileSync(`${DIST}/assets/${f}`, "utf-8")).join("\n");
// Minification removes whitespace around selector combinators, so compare without it.
const cssNoSpace = allCss.replace(/\s+/g, "");

for (const [label, needle] of [
  // Reproduces the padding and margin Cloudscape's Box variant="p" and SpaceBetween
  // gave the markup these blocks replaced. Measured against the original components:
  // without the padding every page sits 8px high, and without the margin stacked
  // paragraphs drift 2px apart each.
  ["paragraph box", ".landing-prose p{margin-block:0;padding-block:4px}"],
  ["stacked paragraph gap", ".landing-prose p+p{margin-block-start:"],
]) {
  if (!cssNoSpace.includes(needle.replace(/\s+/g, ""))) {
    fail(
      `the prose spacing rule for ${label} is missing from the built CSS`,
      "without it every landing-page prose block regains the default paragraph margin"
    );
  }
}

// --- robots.txt ---
// Generated rather than checked in, so it can go missing without anyone noticing until
// a crawler stops finding the sitemap.

const robotsPath = `${DIST}/robots.txt`;
if (!existsSync(robotsPath)) {
  fail("dist/robots.txt is missing", "generate-manifest.js writes it; did the build skip it?");
} else {
  const robots = readFileSync(robotsPath, "utf-8");
  if (!robots.includes(`Sitemap: ${siteConfig.siteUrl}/sitemap.xml`)) {
    fail(
      "dist/robots.txt does not point at this site's sitemap",
      `expected: Sitemap: ${siteConfig.siteUrl}/sitemap.xml`
    );
  }
}

// --- Result ---

if (failures.length > 0) {
  console.error(`FAIL: ${failures.length} problem(s) with the build:`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}

console.log(
  `OK: ${STATIC_ROUTES.length} static routes and ${pagesManifest.length} landing pages present ` +
    `in sitemap and prerendered, document head injected`
);
