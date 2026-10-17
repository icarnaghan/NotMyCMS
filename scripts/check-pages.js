/**
 * Validates every landing page, and the page set as a whole.
 *
 * Wired into `make check` and CI. Strict by design: a page that fails here never reaches
 * the renderer, so the renderer can stay lenient about what it skips.
 *
 * Landing pages are runtime content now (landing-page-editor stage 4): the compiled
 * registry is gone, so this reads the `page.json` files from the content tree
 * (`CONTENT_ROOT/pages/<slug>/page.json`, default `public/content/pages`, overridable with
 * CONTENT_ROOT to point at a Content_Repo clone) rather than importing a registry. The
 * admin runs the same `validatePage` server-side before any save, so a page in the tree
 * has already passed this shape — but checking at build time keeps a hand-edited or
 * mis-synced page from shipping.
 *
 * Exits 0 on an empty set (a fresh install with no landing pages yet).
 */
import { existsSync, readdirSync, readFileSync } from "fs";
import { join } from "path";
import { validatePage } from "./validate-page.js";

const CONTENT_ROOT = process.env.CONTENT_ROOT || "public/content";
const PAGES_DIR = join(CONTENT_ROOT, "pages");

/**
 * Collect every `page.json` under the pages tree. A slug may contain a slash
 * (`teaching/cmst388-tips`), so walk recursively — a directory may hold both a
 * `page.json` and nested page directories.
 */
function collectPages(dir, slugPrefix = "") {
  const found = [];
  let dirents;
  try {
    dirents = readdirSync(dir, { withFileTypes: true });
  } catch {
    return found; // missing tree → no pages
  }
  if (dirents.some((d) => d.isFile() && d.name === "page.json")) {
    try {
      const page = JSON.parse(readFileSync(join(dir, "page.json"), "utf-8"));
      found.push({ slug: page.slug ?? slugPrefix, page });
    } catch (err) {
      found.push({ slug: slugPrefix, parseError: err.message });
    }
  }
  for (const d of dirents) {
    if (d.isDirectory()) {
      found.push(
        ...collectPages(join(dir, d.name), slugPrefix ? `${slugPrefix}/${d.name}` : d.name)
      );
    }
  }
  return found;
}

const problems = [];

if (!existsSync(PAGES_DIR)) {
  console.log(`OK: no pages tree at ${PAGES_DIR} (nothing to validate)`);
  process.exit(0);
}

const pages = collectPages(PAGES_DIR);

for (const entry of pages) {
  if (entry.parseError) {
    problems.push(`${entry.slug}/page.json is not valid JSON: ${entry.parseError}`);
    continue;
  }
  problems.push(...validatePage(entry.page));
}

// --- Set-level checks ---
// These cannot live in validatePage, which sees one page at a time.

const slugs = pages.filter((e) => e.page).map((e) => e.page.slug);
const duplicateSlugs = slugs.filter((s, i) => slugs.indexOf(s) !== i);
for (const slug of new Set(duplicateSlugs)) {
  problems.push(`two pages share the slug ${JSON.stringify(slug)}`);
}

const navOrders = pages.filter((e) => e.page?.nav).map((e) => e.page.nav.order);
const duplicateOrders = navOrders.filter((o, i) => navOrders.indexOf(o) !== i);
for (const order of new Set(duplicateOrders)) {
  // Not fatal to rendering, but it makes navigation order ambiguous.
  problems.push(`two pages share nav.order ${order}, so their navigation order is ambiguous`);
}

if (problems.length > 0) {
  console.error(`FAIL: ${problems.length} problem(s) in ${PAGES_DIR}:`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}

console.log(
  pages.length === 0
    ? `OK: no landing pages under ${PAGES_DIR} yet`
    : `OK: ${pages.length} landing page(s) under ${PAGES_DIR} are valid`
);
