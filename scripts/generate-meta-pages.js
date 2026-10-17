import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { siteConfig } from "./site-config.js";

// Post-build step: for each post / KB article / static page, write a
// prerendered `dist/<path>/index.html` whose <head> carries page-specific
// <title>, description, canonical, Open Graph / Twitter tags, and (for articles)
// schema.org JSON-LD.
//
// The body is the unchanged SPA shell (same JS bundle), so the client-side app
// still boots and renders normally — only the static <head> differs. This gives
// crawlers and social scrapers accurate per-page metadata without server-side
// rendering. A CloudFront viewer-request function rewrites extensionless URLs
// to `/<path>/index.html` so these files are actually served (see site-stack.ts);
// URLs without a generated page fall back to the root index.html.

const SITE_URL = siteConfig.siteUrl;
const DIST = "dist";
const AUTHOR = siteConfig.siteName;

// These two must match what index.html actually contains, because the head is
// injected by replacing them. If index.html changes its placeholder title or
// canonical, generation silently produces pages with the generic head instead of
// the page-specific one — so both come from the same config values index.html does.
const TEMPLATE_TITLE = `<title>${siteConfig.siteTitle}</title>`;
const TEMPLATE_CANONICAL = `<link rel="canonical" href="${siteConfig.siteUrl}" />`;

const template = readFileSync(join(DIST, "index.html"), "utf-8");

// Fail loudly rather than silently emitting ~1,180 pages with the generic head.
// The head is injected by string replacement, so a placeholder that no longer
// appears in index.html produces output that looks fine and is wrong — every page
// carrying the site-wide title instead of its own.
for (const [label, needle] of [
  ["title", TEMPLATE_TITLE],
  ["canonical", TEMPLATE_CANONICAL],
]) {
  if (!template.includes(needle)) {
    console.error(
      `FAIL: dist/index.html does not contain the expected ${label} placeholder:\n` +
        `  ${needle}\n` +
        `index.html and site.config.json have drifted. Meta pages would be generated ` +
        `with the generic head.`
    );
    process.exit(1);
  }
}

function escapeAttr(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Serialise JSON-LD for embedding in a <script> tag. `<` is escaped so a stray
 * "</script>" in content can't break out of the block.
 */
function jsonLdScript(data) {
  const json = JSON.stringify(data).replace(/</g, "\\u003c");
  return `<script type="application/ld+json">${json}</script>`;
}

/**
 * schema.org BlogPosting for a content page. Only fields we actually have are
 * emitted — a partial-but-accurate graph beats padding it with guesses.
 */
function articleJsonLd({ title, description, url, date, author }) {
  const data = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: title,
    url,
    mainEntityOfPage: { "@type": "WebPage", "@id": url },
    author: { "@type": "Person", name: author || AUTHOR },
    publisher: { "@type": "Person", name: AUTHOR },
  };
  if (description) data.description = description;
  if (date) data.datePublished = date;
  return jsonLdScript(data);
}

function buildMetaHtml(title, description, url, type, structuredData) {
  const safeTitle = escapeAttr(title);
  const safeDesc = escapeAttr(description);
  const safeUrl = escapeAttr(url);

  const head = [
    `<title>${escapeAttr(`${title} | ${AUTHOR}`)}</title>`,
    `<meta name="description" content="${safeDesc}" />`,
    `<meta property="og:title" content="${safeTitle}" />`,
    `<meta property="og:description" content="${safeDesc}" />`,
    `<meta property="og:url" content="${safeUrl}" />`,
    `<meta property="og:type" content="${type}" />`,
    `<meta property="og:site_name" content="${AUTHOR}" />`,
    `<meta name="twitter:card" content="summary" />`,
    `<meta name="twitter:title" content="${safeTitle}" />`,
    `<meta name="twitter:description" content="${safeDesc}" />`,
    ...(structuredData ? [structuredData] : []),
  ].join("\n    ");

  return template
    .replace(TEMPLATE_TITLE, head)
    .replace(TEMPLATE_CANONICAL, `<link rel="canonical" href="${safeUrl}" />`);
}

function writeMetaPage(urlPath, title, description, type, article) {
  const url = `${SITE_URL}${urlPath}`;
  const structuredData = article
    ? articleJsonLd({ title, description, url, date: article.date, author: article.author })
    : undefined;
  const html = buildMetaHtml(title, description, url, type, structuredData);
  const dir = join(DIST, ...urlPath.split("/").filter(Boolean));
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "index.html"), html);
}

const posts = JSON.parse(readFileSync(join(DIST, "content/posts/manifest.json"), "utf-8"));
const kb = JSON.parse(readFileSync(join(DIST, "content/knowledge-base/manifest.json"), "utf-8"));

let count = 0;

for (const post of posts) {
  writeMetaPage(`/${post.slug}`, post.title, post.description || post.excerpt, "article", {
    date: post.date,
    author: post.author,
  });
  count++;
}

for (const article of kb) {
  writeMetaPage(
    `/knowledge-base/${article.slug}`,
    article.title,
    article.description || article.excerpt,
    "article",
    { date: article.date, author: article.author }
  );
  count++;
}

// Framework routes. These have no page in site/pages/, so their titles and descriptions
// are maintained here. Titles match what each page sets via useDocumentTitle, so the
// prerendered <head> and the client-side title agree.
const FRAMEWORK_PAGES = [
  {
    path: "/posts",
    title: "Blog Posts",
    desc: "Articles on web development, DevOps, cloud, and more.",
  },
  { path: "/knowledge-base", title: "Knowledge Base", desc: "Quick tips, fixes, and how-tos." },
  { path: "/categories", title: "Categories", desc: "Browse posts and articles by category." },
  { path: "/tags", title: "Tags", desc: "Browse posts and articles by tag." },
];

/**
 * Landing pages, from the built pages manifest (dist/content/pages/manifest.json),
 * which the build wrote from the content tree. The compiled registry is gone
 * (landing-page-editor stage 4); this is the same manifest the SPA fetches at runtime, so
 * the prerendered <head> and the live page agree by construction.
 *
 * `seo.title` rather than `header.title`: the two differ on purpose — `/teaching` shows
 * "Classes I Teach" but titles its document "Teaching" — and this is the document head.
 * (The manifest carries only `seo`, so there is no `header.title` to confuse it with.)
 */
const pagesManifest = JSON.parse(
  readFileSync(join(DIST, "content", "pages", "manifest.json"), "utf-8")
);
const REGISTRY_PAGES = pagesManifest.map((page) => ({
  path: `/${page.slug}`,
  title: page.seo.title,
  desc: page.seo.description,
}));

// Children of /teaching/cmst388-tips, which have no manifest to derive them from. The
// parent is a registry page; these are standalone markdown under public/content/pages/.
const STANDALONE_PAGES = [
  {
    path: "/teaching/cmst388-tips/project-1-javascript-selectors",
    title: "Project 1: JavaScript Selectors",
    desc: "Tips and guidance for CMST 388 Project 1 — DOM selectors, modifying elements, and applying styles.",
  },
  {
    path: "/teaching/cmst388-tips/project-3-ticket-purchasing",
    title: "Project 3: Ticket Purchasing",
    desc: "Tips and guidance for CMST 388 Project 3 — event handling, form validation, calculations, and dynamic UI updates.",
  },
  {
    path: "/teaching/cmst388-tips/project-4-student-portfolio",
    title: "Project 4: Student Portfolio",
    desc: "Tips and guidance for CMST 388 Project 4 — page structure, navigation, responsive design, and JavaScript interactivity.",
  },
];

const staticPages = [...FRAMEWORK_PAGES, ...REGISTRY_PAGES, ...STANDALONE_PAGES];

for (const page of staticPages) {
  writeMetaPage(page.path, page.title, page.desc, "website");
  count++;
}

console.log(`Generated ${count} meta pages in ${DIST}/`);
