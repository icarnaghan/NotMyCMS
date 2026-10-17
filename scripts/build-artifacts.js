/**
 * The derived site artifacts — manifests, search index, RSS, sitemap, robots —
 * computed from a content tree.
 *
 * Pure: it reads a content directory and returns strings. It writes nothing and knows
 * nothing about `public/` or S3. Two callers share it so the publish rule lives in one
 * place:
 *
 *   - `generate-manifest.js` — the build, reading `public/content` and writing `public/`.
 *   - `reconcile.js`         — the Content_Repo's CI, reading a clone and writing a
 *                              staging dir for `aws s3 sync`.
 *
 * The deploy Lambda is a third implementation of this same rule (it has to run inside
 * Lambda, from S3, with no git). That duplication is the standing divergence the roadmap
 * tracks; this module at least collapses the two Node callers onto one.
 */
import { readdirSync, readFileSync } from "fs";
import { join } from "path";
import matter from "gray-matter";

/**
 * Converts text to a URL-friendly slug.
 *
 * Apostrophes (straight and curly) are removed rather than treated as separators, so
 * "Don't" becomes "dont" and not "don-t". Must stay identical to the slugify functions
 * in scripts/rename-dirs.js, src/lib/slugify.ts, admin/src/components/slugify.ts,
 * infra/lambda/content/index.ts and infra/lambda/deploy/index.ts.
 */
export function slugify(text) {
  return text
    .toLowerCase()
    .replace(/['\u2018\u2019\u201B]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export function escapeXml(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function extractExcerpt(content) {
  const plain = content
    .replace(/```[\s\S]*?```/g, "")
    .replace(/^#{1,6}\s+.*$/gm, "")
    .replace(/!\[.*?\]\(.*?\)/g, "")
    .replace(/\[([^\]]*)\]\(.*?\)/g, "$1")
    .replace(/<[^>]+>/g, "") // strip raw HTML tags so they don't leak into excerpts
    .replace(/[`*_~>#\-|]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (plain.length <= 150) return plain;
  const cut = plain.slice(0, 150);
  const lastSpace = cut.lastIndexOf(" ");
  return (lastSpace > 0 ? cut.slice(0, lastSpace) : cut) + "…";
}

/**
 * Whether a piece of content should appear on the public site as of `now`. Excludes
 * explicit drafts (`draft: true`) and future-dated posts (a `date` later than `now`).
 * Missing or unparseable dates are treated as published so existing content is never
 * hidden by accident.
 */
export function isPublished(data, now) {
  if (data.draft === true) return false;
  if (data.date) {
    const t = new Date(data.date).getTime();
    if (!Number.isNaN(t) && t > now) return false;
  }
  return true;
}

/** Build the manifest entries for one collection directory of `<slug>/index.md`. */
export function buildManifest(contentDir, now) {
  let slugs;
  try {
    slugs = readdirSync(contentDir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);
  } catch {
    // A missing collection directory yields an empty manifest rather than throwing,
    // so a content tree without, say, knowledge-base still reconciles.
    return [];
  }

  const entries = [];
  for (const slug of slugs) {
    try {
      const raw = readFileSync(join(contentDir, slug, "index.md"), "utf-8");
      const { data, content } = matter(raw);
      if (!isPublished(data, now)) continue;

      const effectiveSlug = data.title ? slugify(data.title) : slug;
      if (effectiveSlug !== slug) {
        console.warn(
          `WARNING: Directory "${slug}" doesn't match title slug "${effectiveSlug}". Consider renaming.`
        );
      }
      entries.push({
        slug: effectiveSlug,
        title: data.title || slug,
        date: data.date || "",
        description: data.description || "",
        excerpt: extractExcerpt(content),
        categories: Array.isArray(data.categories)
          ? data.categories.join(", ")
          : data.categories || "",
        tags: Array.isArray(data.tags) ? data.tags : data.tags ? [data.tags] : [],
        author: data.author || "",
      });
    } catch {
      // skip folders without index.md
    }
  }
  return entries.sort((a, b) => new Date(b.date) - new Date(a.date));
}

/**
 * Build the pages manifest from a `content/pages/` tree of `<slug>/page.json`.
 *
 * The runtime equivalent of the compiled registry's `pageSlugs()` + `navPages()` plus the
 * per-page `seo` the generators read: the SPA fetches this at startup to learn which
 * landing pages exist, their navigation entries, and their SEO metadata, so routing and
 * navigation resolve at runtime rather than from a build-time import.
 *
 * A slug may contain a slash (`teaching/cmst388-tips`), which appears as a nested
 * directory. We walk one level deep for a `page.json`, then recurse into subdirectories,
 * so `content/pages/teaching/cmst388-tips/page.json` yields slug `teaching/cmst388-tips`.
 * Directories that hold only markdown child guides (no `page.json`) contribute nothing —
 * which is why the markdown `cmst388-tips` guides never appear here.
 *
 * Kept deliberately lenient on IO (a missing tree yields an empty manifest) but strict on
 * shape only to the extent the manifest needs: `slug`, optional `nav`, and `seo`. Full
 * block validation is the admin Lambda's and `validate-page.js`'s job, not the manifest
 * builder's.
 */
export function buildPagesManifest(pagesDir) {
  const entries = [];

  const walk = (absDir, slugPrefix) => {
    let dirents;
    try {
      dirents = readdirSync(absDir, { withFileTypes: true });
    } catch {
      return; // missing tree → empty manifest
    }

    const hasPageJson = dirents.some((d) => d.isFile() && d.name === "page.json");
    if (hasPageJson) {
      try {
        const page = JSON.parse(readFileSync(join(absDir, "page.json"), "utf-8"));
        // The stored slug is authoritative; fall back to the directory-derived prefix so
        // a page is never silently dropped for omitting one.
        const slug = typeof page.slug === "string" && page.slug ? page.slug : slugPrefix;
        entries.push({
          slug,
          ...(page.nav ? { nav: page.nav } : {}),
          seo: {
            title: page.seo?.title ?? page.header?.title ?? slug,
            description: page.seo?.description ?? "",
          },
        });
      } catch {
        // A malformed page.json is skipped rather than failing the whole manifest; the
        // strict validator (validate-page.js / the admin Lambda) is where bad pages are
        // rejected before they ever reach a tree.
      }
    }

    for (const d of dirents) {
      if (d.isDirectory()) {
        const childSlug = slugPrefix ? `${slugPrefix}/${d.name}` : d.name;
        walk(join(absDir, d.name), childSlug);
      }
    }
  };

  walk(pagesDir, "");
  return entries.sort((a, b) => (a.nav?.order ?? Infinity) - (b.nav?.order ?? Infinity));
}

function searchIndexFor(postsManifest, kbManifest) {
  const entry = (basePath) => (p) => ({
    slug: p.slug,
    basePath,
    title: p.title,
    excerpt: p.excerpt,
    categories: p.categories,
    tags: p.tags,
  });
  return [...postsManifest.map(entry("posts")), ...kbManifest.map(entry("knowledge-base"))];
}

function rssFor(postsManifest, siteConfig) {
  const items = postsManifest
    .slice(0, 20)
    .map(
      (p) => `    <item>
      <title>${escapeXml(p.title)}</title>
      <link>${siteConfig.siteUrl}/${p.slug}</link>
      <guid>${siteConfig.siteUrl}/${p.slug}</guid>
      <pubDate>${p.date ? new Date(p.date).toUTCString() : ""}</pubDate>
      <description>${escapeXml(p.description || p.excerpt)}</description>
    </item>`
    )
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escapeXml(siteConfig.siteName)}</title>
    <link>${siteConfig.siteUrl}</link>
    <description>${escapeXml(siteConfig.siteDescription)}</description>
    <language>${siteConfig.locale}</language>
    <atom:link href="${siteConfig.siteUrl}/rss.xml" rel="self" type="application/rss+xml"/>
${items}
  </channel>
</rss>`;
}

// Framework routes and standalone pages with no manifest to derive them from. The
// landing pages between them come from the registry (`staticPages` argument), the same
// list the route table reads — see generate-meta-pages.js and the deploy Lambda, which
// must agree with this.
const FRAMEWORK_ROUTES = ["", "posts", "knowledge-base", "categories", "tags"];
const STANDALONE_PAGES = [
  "teaching/cmst388-tips/project-1-javascript-selectors",
  "teaching/cmst388-tips/project-3-ticket-purchasing",
  "teaching/cmst388-tips/project-4-student-portfolio",
];

function sitemapFor(postsManifest, kbManifest, registrySlugs, siteConfig) {
  const staticPages = [...FRAMEWORK_ROUTES, ...registrySlugs, ...STANDALONE_PAGES];
  const urls = [
    ...staticPages.map((p) => `  <url><loc>${siteConfig.siteUrl}/${p}</loc></url>`),
    ...postsManifest.map((p) => `  <url><loc>${siteConfig.siteUrl}/${p.slug}</loc></url>`),
    ...kbManifest.map(
      (p) => `  <url><loc>${siteConfig.siteUrl}/knowledge-base/${p.slug}</loc></url>`
    ),
  ].join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>`;
}

/**
 * Compute every derived artifact from a content tree.
 *
 * @param {object} opts
 * @param {string} opts.postsDir       directory of `<slug>/index.md` for posts
 * @param {string} opts.kbDir          directory of `<slug>/index.md` for knowledge base
 * @param {string[]} opts.registrySlugs landing-page slugs for the sitemap
 * @param {object} opts.siteConfig     site identity (siteUrl, siteName, …)
 * @param {number} [opts.now]          publish cutoff; one value for a consistent build
 * @returns artifact strings plus the two manifests (as objects, for the caller to serialise)
 */
export function buildArtifacts({ postsDir, kbDir, registrySlugs, siteConfig, now = Date.now() }) {
  const postsManifest = buildManifest(postsDir, now);
  const kbManifest = buildManifest(kbDir, now);

  return {
    postsManifest,
    kbManifest,
    searchIndex: searchIndexFor(postsManifest, kbManifest),
    rss: rssFor(postsManifest, siteConfig),
    sitemap: sitemapFor(postsManifest, kbManifest, registrySlugs, siteConfig),
    robots: ["User-agent: *", "Allow: /", `Sitemap: ${siteConfig.siteUrl}/sitemap.xml`, ""].join(
      "\n"
    ),
  };
}
