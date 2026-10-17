import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
} from "@aws-sdk/client-s3";
import {
  CloudFrontClient,
  ListDistributionsCommand,
  CreateInvalidationCommand,
} from "@aws-sdk/client-cloudfront";
import { LambdaClient, InvokeCommand } from "@aws-sdk/client-lambda";
import * as yaml from "js-yaml";
import * as crypto from "crypto";
import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from "aws-lambda";
import { writeAudit, getActor } from "../shared/audit";
import { notifyFailure } from "../shared/alerts";
// Landing pages are runtime content now (landing-page-editor stage 4): the compiled
// registry is gone. The Lambda derives landing pages from the pages manifest in S3
// (content/pages/manifest.json, written by the Reconcile_Job and the pages Lambda), the
// same manifest the SPA fetches — see loadLandingManifest() below.

const s3 = new S3Client({});
const cloudfront = new CloudFrontClient({});
const lambda = new LambdaClient({});

const BUCKET = process.env.CONTENT_BUCKET!;
const FUNCTION_NAME = process.env.AWS_LAMBDA_FUNCTION_NAME!;
const STATUS_KEY = "admin/deploy-status.json";
const HISTORY_KEY = "admin/deploy-history.json";
const MAX_HISTORY = 50;
// Site identity, injected by the stack from site.config.json. This Lambda regenerates
// the manifest, RSS and sitemap in place (a duplicate of scripts/generate-manifest.js),
// so it needs the same values that script reads from the config file. Required rather
// than defaulted: a missing value here would silently publish a feed pointing at the
// wrong domain.
const SITE_URL = process.env.SITE_URL!;
const SITE_ALIAS = process.env.SITE_ALIAS!;
const SITE_NAME = process.env.SITE_NAME!;
const SITE_DESCRIPTION = process.env.SITE_DESCRIPTION!;
const SITE_LOCALE = process.env.SITE_LOCALE!;

// --- Types ---

export interface DeployStatus {
  status: "idle" | "building" | "deploying" | "success" | "failed";
  startedAt?: string;
  completedAt?: string;
  error?: string;
}

// A single completed deployment, recorded for the deploy-history view.
export interface DeployHistoryEntry {
  status: "success" | "failed";
  startedAt?: string;
  completedAt: string;
  durationMs?: number;
  postCount?: number;
  kbCount?: number;
  error?: string;
  triggeredBy?: string;
}

interface ContentMeta {
  title?: string;
  date?: string | Date;
  description?: string;
  author?: string;
  categories?: string[] | string;
  tags?: string[] | string;
  draft?: boolean;
  [key: string]: unknown;
}

interface ManifestEntry {
  slug: string;
  title: string;
  date: string;
  description: string;
  excerpt: string;
  categories: string;
  tags: string[];
  author: string;
}

interface ApiError {
  code: string;
  message: string;
  path?: string;
  correlationId: string;
}

// Event shape used for the async "worker" self-invocation.
interface RegenerateEvent {
  action: "regenerate";
  triggeredBy?: string;
}

// An in-progress deploy older than this is treated as stale (the worker
// invocation was lost/throttled or the Lambda died mid-run), so a new deploy
// is allowed rather than the status wedging in "building"/"deploying" forever.
const STALE_DEPLOY_MS = 15 * 60 * 1000;

/**
 * True if the status is an in-progress state that started long enough ago to be
 * stale. A missing/unparseable startedAt is treated as NOT stale so the
 * in-progress guard still holds for a genuinely-fresh deploy — staleness
 * recovery relies on the real trigger always recording a valid startedAt.
 */
function isStaleInProgress(status: DeployStatus, now: number): boolean {
  if (status.status !== "building" && status.status !== "deploying") return false;
  if (!status.startedAt) return false;
  const started = new Date(status.startedAt).getTime();
  if (Number.isNaN(started)) return false;
  return now - started > STALE_DEPLOY_MS;
}

// --- HTTP Response Helpers ---

function errorResponse(
  statusCode: number,
  code: string,
  message: string,
  path?: string
): APIGatewayProxyResultV2 {
  const error: ApiError = {
    code,
    message,
    path,
    correlationId: crypto.randomUUID(),
  };
  return {
    statusCode,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(error),
  };
}

function jsonResponse(statusCode: number, data: unknown): APIGatewayProxyResultV2 {
  return {
    statusCode,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  };
}

// --- Deploy Status Helpers ---

export async function getDeployStatus(): Promise<DeployStatus> {
  try {
    const command = new GetObjectCommand({ Bucket: BUCKET, Key: STATUS_KEY });
    const response = await s3.send(command);
    const content = await response.Body!.transformToString();
    return JSON.parse(content) as DeployStatus;
  } catch (err: unknown) {
    if (
      err &&
      typeof err === "object" &&
      "name" in err &&
      ((err as { name: string }).name === "NoSuchKey" ||
        (err as { name: string }).name === "AccessDenied")
    ) {
      return { status: "idle" };
    }
    throw err;
  }
}

export async function writeDeployStatus(status: DeployStatus): Promise<void> {
  await s3.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: STATUS_KEY,
      Body: JSON.stringify(status),
      ContentType: "application/json",
    })
  );
}

// --- Deploy History Helpers ---

/**
 * Return the recorded deploy history (newest first). Returns an empty list
 * when no history file exists yet.
 */
export async function getDeployHistory(): Promise<DeployHistoryEntry[]> {
  try {
    const command = new GetObjectCommand({ Bucket: BUCKET, Key: HISTORY_KEY });
    const response = await s3.send(command);
    const content = await response.Body!.transformToString();
    const parsed = JSON.parse(content);
    return Array.isArray(parsed) ? (parsed as DeployHistoryEntry[]) : [];
  } catch (err: unknown) {
    if (
      err &&
      typeof err === "object" &&
      "name" in err &&
      ((err as { name: string }).name === "NoSuchKey" ||
        (err as { name: string }).name === "AccessDenied")
    ) {
      return [];
    }
    throw err;
  }
}

/**
 * Prepend a completed deploy to the history, capped at MAX_HISTORY entries.
 * Never throws — recording history must not fail a deployment.
 */
export async function appendDeployHistory(entry: DeployHistoryEntry): Promise<void> {
  try {
    const history = await getDeployHistory();
    history.unshift(entry);
    const trimmed = history.slice(0, MAX_HISTORY);
    await s3.send(
      new PutObjectCommand({
        Bucket: BUCKET,
        Key: HISTORY_KEY,
        Body: JSON.stringify(trimmed),
        ContentType: "application/json",
      })
    );
  } catch (err: unknown) {
    console.error("Failed to record deploy history:", err);
  }
}

// --- Content Parsing (ported from scripts/generate-manifest.js) ---

export function parseFrontmatter(content: string): { meta: ContentMeta; body: string } {
  const match = content.match(/^---\n([\s\S]*?)\n---\n\n?([\s\S]*)$/);
  if (!match) {
    throw new Error("Invalid frontmatter format");
  }
  const meta = (yaml.load(match[1]) as ContentMeta) || {};
  return { meta, body: match[2] };
}

/**
 * Converts a title to a URL-friendly slug.
 *
 * Apostrophes (straight and curly) are removed rather than treated as
 * separators, so "Don't" becomes "dont" and not "don-t". Must stay identical to
 * slugify in scripts/generate-manifest.js and infra/lambda/content/index.ts:
 * this function decides the slug the manifest advertises, while the content
 * Lambda decides the directory name. If they disagree, the published link 404s.
 */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/['\u2018\u2019\u201B]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export function escapeXml(s: unknown): string {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function extractExcerpt(content: string): string {
  const plain = content
    .replace(/```[\s\S]*?```/g, "")
    .replace(/^#{1,6}\s+.*$/gm, "")
    .replace(/!\[.*?\]\(.*?\)/g, "")
    .replace(/\[([^\]]*)\]\(.*?\)/g, "$1")
    .replace(/[`*_~>#\-|]/g, "")
    .replace(/\n+/g, " ")
    .trim();
  return plain.length > 150 ? plain.slice(0, 150) + "…" : plain;
}

/**
 * Normalize a frontmatter date to the same string representation
 * scripts/generate-manifest.js produces (via JSON.stringify of the
 * gray-matter/js-yaml parsed value): Date -> ISO string, otherwise the
 * value as-is, empty string when missing.
 */
export function dateToString(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  return value ? String(value) : "";
}

/**
 * Whether a piece of content should appear on the public site as of `now`
 * (epoch ms). Excludes explicit drafts (`draft: true`) and future-dated posts
 * (a `date` that parses to a time later than `now`). Missing or unparseable
 * dates are treated as published so existing content is never hidden by
 * accident. Mirrors isPublished() in scripts/generate-manifest.js.
 */
export function isPublished(meta: ContentMeta, now: number): boolean {
  if (meta.draft === true) return false;
  if (meta.date) {
    const t = new Date(meta.date).getTime();
    if (!Number.isNaN(t) && t > now) return false;
  }
  return true;
}

// --- S3 Content Loading ---

/**
 * Read all `content/{type}/{slug}/index.md` files for a content type and
 * build the manifest entries, mirroring buildManifest() in generate-manifest.js.
 */
async function buildManifest(
  type: "posts" | "knowledge-base",
  now: number
): Promise<ManifestEntry[]> {
  const prefix = `content/${type}/`;
  const indexKeys: string[] = [];
  let continuationToken: string | undefined;

  do {
    const response = await s3.send(
      new ListObjectsV2Command({
        Bucket: BUCKET,
        Prefix: prefix,
        ContinuationToken: continuationToken,
      })
    );
    for (const obj of response.Contents || []) {
      if (obj.Key && obj.Key.endsWith("/index.md")) {
        indexKeys.push(obj.Key);
      }
    }
    continuationToken = response.NextContinuationToken;
  } while (continuationToken);

  const entries: ManifestEntry[] = [];
  const BATCH_SIZE = 50;
  const slugRegex = new RegExp(`^content/${type}/([^/]+)/index\\.md$`);

  for (let i = 0; i < indexKeys.length; i += BATCH_SIZE) {
    const batch = indexKeys.slice(i, i + BATCH_SIZE);
    const results = await Promise.allSettled(
      batch.map(async (key): Promise<ManifestEntry | null> => {
        const response = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }));
        const raw = await response.Body!.transformToString();
        const { meta, body } = parseFrontmatter(raw);

        // Skip drafts and scheduled (future-dated) content.
        if (!isPublished(meta, now)) {
          return null;
        }

        const dirSlug = key.match(slugRegex)?.[1] ?? "";
        const effectiveSlug = meta.title ? slugify(meta.title) : dirSlug;

        const entry: ManifestEntry = {
          slug: effectiveSlug,
          title: meta.title || dirSlug,
          date: dateToString(meta.date),
          description: meta.description || "",
          excerpt: extractExcerpt(body),
          categories: Array.isArray(meta.categories)
            ? meta.categories.join(", ")
            : meta.categories || "",
          tags: Array.isArray(meta.tags) ? meta.tags : meta.tags ? [meta.tags] : [],
          author: meta.author || "",
        };
        return entry;
      })
    );

    for (const result of results) {
      if (result.status === "fulfilled" && result.value !== null) {
        entries.push(result.value);
      }
    }
  }

  return entries.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

// --- Artifact Builders (ported from generate-manifest.js) ---

function buildSearchIndex(posts: ManifestEntry[], kb: ManifestEntry[]): unknown[] {
  const map = (basePath: "posts" | "knowledge-base") => (p: ManifestEntry) => ({
    slug: p.slug,
    basePath,
    title: p.title,
    excerpt: p.excerpt,
    categories: p.categories,
    tags: p.tags,
  });
  return [...posts.map(map("posts")), ...kb.map(map("knowledge-base"))];
}

function buildRss(posts: ManifestEntry[]): string {
  const rssItems = posts
    .slice(0, 20)
    .map(
      (p) => `    <item>
      <title>${escapeXml(p.title)}</title>
      <link>${SITE_URL}/${p.slug}</link>
      <guid>${SITE_URL}/${p.slug}</guid>
      <pubDate>${p.date ? new Date(p.date).toUTCString() : ""}</pubDate>
      <description>${escapeXml(p.description || p.excerpt)}</description>
    </item>`
    )
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escapeXml(SITE_NAME)}</title>
    <link>${SITE_URL}</link>
    <description>${escapeXml(SITE_DESCRIPTION)}</description>
    <language>${SITE_LOCALE}</language>
    <atom:link href="${SITE_URL}/rss.xml" rel="self" type="application/rss+xml"/>
${rssItems}
  </channel>
</rss>`;
}

/**
 * Routes with no page in the registry and no manifest to derive them from.
 *
 * Mirrors `FRAMEWORK_ROUTES` in scripts/generate-manifest.js. Kept in step by a test
 * rather than shared at runtime, because this Lambda and that script run in different
 * places; `sitemapStaticPages` below is what the test compares.
 */
export const FRAMEWORK_ROUTES = ["", "posts", "knowledge-base", "categories", "tags"];

/**
 * Children of `/teaching/cmst388-tips`. Markdown under the `pages` content type that
 * renders through ContentPage but is not a browsable collection, so no manifest covers
 * it. Mirrors `STANDALONE_PAGES` in scripts/generate-manifest.js.
 */
export const STANDALONE_PAGES = [
  "teaching/cmst388-tips/project-1-javascript-selectors",
  "teaching/cmst388-tips/project-3-ticket-purchasing",
  "teaching/cmst388-tips/project-4-student-portfolio",
];

/**
 * Non-manifest sitemap entries.
 *
 * This was a hardcoded list of eight that had drifted from the build: it named `about`,
 * `teaching` and `bitesize-javascript` by hand and omitted `apps`,
 * `teaching/cmst388-tips` and the three standalone children. So an admin deploy
 * rewrote sitemap.xml with five URLs missing, and the next pipeline build put them
 * back — the sitemap's contents depended on which deploy path ran last, the same
 * failure mode as the manifest oscillation that hid three orphaned articles.
 *
 * Landing pages now come from the S3 pages manifest (landing slugs passed in), the same
 * manifest the SPA and the build read, rather than a compiled registry.
 */
export function sitemapStaticPages(landingSlugs: string[]): string[] {
  return [...FRAMEWORK_ROUTES, ...landingSlugs, ...STANDALONE_PAGES];
}

function buildSitemap(posts: ManifestEntry[], kb: ManifestEntry[], landingSlugs: string[]): string {
  const staticPages = sitemapStaticPages(landingSlugs);
  const sitemapUrls = [
    ...staticPages.map((p) => `  <url><loc>${SITE_URL}/${p}</loc></url>`),
    ...posts.map((p) => `  <url><loc>${SITE_URL}/${p.slug}</loc></url>`),
    ...kb.map((p) => `  <url><loc>${SITE_URL}/knowledge-base/${p.slug}</loc></url>`),
  ].join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${sitemapUrls}
</urlset>`;
}

// --- Prerendered meta pages (ported from scripts/generate-meta-pages.js) ---

/**
 * Why this Lambda writes meta pages at all.
 *
 * Each post and article has a prerendered `<slug>/index.html`: the unchanged SPA shell
 * with a page-specific `<head>` — title, description, canonical, Open Graph, Twitter
 * card, and BlogPosting JSON-LD. A CloudFront viewer-request function rewrites
 * extensionless URLs to `<slug>/index.html`, so that file is what a crawler or a social
 * scraper actually receives.
 *
 * The build generates them and this Lambda did not, which meant publishing through the
 * admin produced a post that was listed, searchable and in the sitemap but still served
 * the site-wide generic head until CI next ran. Un-publishing was worse: the entry left
 * the manifest while its meta page stayed in the bucket, so the URL kept advertising a
 * post the site no longer acknowledged.
 *
 * Only changed pages are written. A typical edit touches one post, and rewriting all
 * ~1,170 on every deploy would cost a few hundred S3 writes and a CloudFront
 * invalidation large enough to bill, to no purpose.
 */

/**
 * The two placeholders the page-specific head replaces.
 *
 * Matched by pattern rather than by an exact string built from config, which is where
 * this deliberately differs from the build script. That script *owns* `index.html` and
 * asserts the exact title and canonical it expects, so a config drift fails the build.
 * This Lambda only consumes whatever shell is already deployed — and on a deployment
 * with no custom domain the shell's canonical is the site config's URL while SITE_URL
 * here is the CloudFront hostname, so an exact comparison would fail for a correct
 * shell. "Find the title tag" is the right semantic on this side.
 */
const SHELL_TITLE = /<title>[\s\S]*?<\/title>/;
const SHELL_CANONICAL = /<link rel="canonical"[^>]*>/;

/** Collapse an invalidation into a single wildcard past this many paths. */
const INVALIDATION_PATH_LIMIT = 20;

function escapeAttr(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Serialise JSON-LD. `<` is escaped so a stray `</script>` in content cannot break out. */
function jsonLdScript(data: unknown): string {
  return `<script type="application/ld+json">${JSON.stringify(data).replace(/</g, "\\u003c")}</script>`;
}

function articleJsonLd(args: {
  title: string;
  description: string;
  url: string;
  date?: string;
  author?: string;
}): string {
  const data: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: args.title,
    url: args.url,
    mainEntityOfPage: { "@type": "WebPage", "@id": args.url },
    author: { "@type": "Person", name: args.author || SITE_NAME },
    publisher: { "@type": "Person", name: SITE_NAME },
  };
  if (args.description) data.description = args.description;
  if (args.date) data.datePublished = args.date;
  return jsonLdScript(data);
}

/**
 * The SPA shell with a page-specific head swapped in.
 *
 * `ogType` defaults to "article" (posts/KB). Landing pages pass "website" and omit the
 * BlogPosting JSON-LD, which only makes sense for articles — a landing page is not a
 * blog posting and should not advertise itself as one to crawlers.
 */
export function buildMetaHtml(
  shell: string,
  args: {
    title: string;
    description: string;
    url: string;
    date?: string;
    author?: string;
    ogType?: "article" | "website";
  }
): string {
  const safeTitle = escapeAttr(args.title);
  const safeDesc = escapeAttr(args.description);
  const safeUrl = escapeAttr(args.url);
  const ogType = args.ogType ?? "article";

  const head = [
    `<title>${escapeAttr(`${args.title} | ${SITE_NAME}`)}</title>`,
    `<meta name="description" content="${safeDesc}" />`,
    `<meta property="og:title" content="${safeTitle}" />`,
    `<meta property="og:description" content="${safeDesc}" />`,
    `<meta property="og:url" content="${safeUrl}" />`,
    `<meta property="og:type" content="${ogType}" />`,
    `<meta property="og:site_name" content="${SITE_NAME}" />`,
    `<meta name="twitter:card" content="summary" />`,
    `<meta name="twitter:title" content="${safeTitle}" />`,
    `<meta name="twitter:description" content="${safeDesc}" />`,
    // Only articles carry BlogPosting JSON-LD; a website (landing page) does not.
    ...(ogType === "article" ? [articleJsonLd(args)] : []),
  ].join("\n    ");

  // Function replacers, not strings: `String.replace` treats `$&`, `$1` and friends in a
  // string replacement as references to the match. A post titled "Save $5 on $&" would
  // otherwise emit the matched `<title>` tag back into its own head. A function
  // replacement is taken literally.
  return shell
    .replace(SHELL_TITLE, () => head)
    .replace(SHELL_CANONICAL, () => `<link rel="canonical" href="${safeUrl}" />`);
}

/**
 * Read the deployed SPA shell, which every meta page is built from.
 *
 * Throws when the shell is missing or lacks a placeholder. Silently writing pages with
 * the generic head is the exact bug this function exists to fix, so it fails the deploy
 * instead — by which point the manifests have already published, so content is live and
 * only the per-page head is behind.
 */
export async function loadShell(): Promise<string> {
  const response = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: "index.html" }));
  const shell = await response.Body!.transformToString();

  for (const [label, pattern] of [
    ["title", SHELL_TITLE],
    ["canonical link", SHELL_CANONICAL],
  ] as const) {
    if (!pattern.test(shell)) {
      throw new Error(
        `index.html has no ${label}, so meta pages would be written with the generic ` +
          `head. Refusing to write them. Pattern: ${pattern}`
      );
    }
  }
  return shell;
}

/** The S3 key of a content item's prerendered page. */
export function metaPageKey(type: "posts" | "knowledge-base", slug: string): string {
  return type === "posts" ? `${slug}/index.html` : `knowledge-base/${slug}/index.html`;
}

/** The site-relative path a content item is served at. */
export function metaPagePath(type: "posts" | "knowledge-base", slug: string): string {
  return type === "posts" ? `/${slug}` : `/knowledge-base/${slug}`;
}

/** Everything about an entry that changes its rendered head. */
function metaFingerprint(entry: ManifestEntry): string {
  return JSON.stringify([entry.title, entry.description, entry.excerpt, entry.date, entry.author]);
}

/**
 * Which meta pages a manifest change implies.
 *
 * Added or edited entries are rewritten; entries that have left the manifest — deleted,
 * or flipped back to draft — have their page removed, so an un-published URL stops
 * advertising a post that is no longer listed.
 */
export function diffMetaPages(
  previous: ManifestEntry[],
  next: ManifestEntry[]
): { write: ManifestEntry[]; remove: string[] } {
  const before = new Map(previous.map((e) => [e.slug, metaFingerprint(e)]));
  const after = new Set(next.map((e) => e.slug));

  return {
    write: next.filter((entry) => before.get(entry.slug) !== metaFingerprint(entry)),
    remove: previous.map((e) => e.slug).filter((slug) => !after.has(slug)),
  };
}

/**
 * Bring the prerendered pages for one content type in line with its new manifest.
 * Returns the site-relative paths that changed, for invalidation.
 */
async function syncMetaPages(
  type: "posts" | "knowledge-base",
  previous: ManifestEntry[],
  next: ManifestEntry[],
  shell: string
): Promise<string[]> {
  const { write, remove } = diffMetaPages(previous, next);
  if (write.length === 0 && remove.length === 0) return [];

  const BATCH_SIZE = 25;
  for (let i = 0; i < write.length; i += BATCH_SIZE) {
    await Promise.all(
      write.slice(i, i + BATCH_SIZE).map((entry) =>
        putObject(
          metaPageKey(type, entry.slug),
          buildMetaHtml(shell, {
            title: entry.title,
            description: entry.description || entry.excerpt,
            url: `${SITE_URL}${metaPagePath(type, entry.slug)}`,
            date: entry.date,
            author: entry.author,
          }),
          "text/html"
        )
      )
    );
  }

  for (let i = 0; i < remove.length; i += BATCH_SIZE) {
    await Promise.all(
      remove
        .slice(i, i + BATCH_SIZE)
        .map((slug) =>
          s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: metaPageKey(type, slug) }))
        )
    );
  }

  console.log(`Meta pages (${type}): ${write.length} written, ${remove.length} removed`);
  return [
    ...write.map((e) => `${metaPagePath(type, e.slug)}/index.html`),
    ...remove.map((slug) => `${metaPagePath(type, slug)}/index.html`),
  ];
}

/** A landing page's manifest entry, for prerendering its head. */
interface LandingMetaEntry {
  slug: string;
  seo: { title: string; description: string };
}

/** The S3 key of a landing page's prerendered head. `<slug>/index.html`, slug may nest. */
function landingMetaKey(slug: string): string {
  return `${slug}/index.html`;
}

/**
 * Prerender the landing-page heads from the pages manifest, so an admin SEO edit
 * propagates without a full CI build (landing-page-editor stage 6). Landing heads use
 * og:type "website" and carry no BlogPosting JSON-LD.
 *
 * Unlike posts/KB this writes every page every deploy rather than diffing: there are only
 * a handful of landing pages, so a diff saves nothing, and this Lambda has no stored
 * "previous" landing manifest to diff against (the pages manifest is owned by the pages
 * Lambda and reconcile, not here). Returns the paths written, for invalidation.
 *
 * Stale heads from a *deleted* landing page are not removed here (no reliable prior-slug
 * set); the SPA already 404s a deleted page via the manifest, and the orphan shell is
 * pruned on the next full site deploy. This is the same bounded staleness the sitemap's
 * landing entries carry, documented in content-repo-ci/README and the design.
 */
async function syncLandingMetaPages(pages: LandingMetaEntry[], shell: string): Promise<string[]> {
  if (pages.length === 0) return [];

  const BATCH_SIZE = 25;
  for (let i = 0; i < pages.length; i += BATCH_SIZE) {
    await Promise.all(
      pages.slice(i, i + BATCH_SIZE).map((entry) =>
        putObject(
          landingMetaKey(entry.slug),
          buildMetaHtml(shell, {
            title: entry.seo.title,
            description: entry.seo.description,
            url: `${SITE_URL}/${entry.slug}`,
            ogType: "website",
          }),
          "text/html"
        )
      )
    );
  }

  console.log(`Meta pages (landing): ${pages.length} written`);
  return pages.map((e) => `/${e.slug}/index.html`);
}

/** Load the current pages manifest from S3, for the landing-head diff. [] if missing. */
async function loadLandingManifest(): Promise<LandingMetaEntry[]> {
  try {
    const response = await s3.send(
      new GetObjectCommand({ Bucket: BUCKET, Key: "content/pages/manifest.json" })
    );
    const body = await response.Body!.transformToString();
    const manifest = JSON.parse(body) as LandingMetaEntry[];
    return Array.isArray(manifest) ? manifest : [];
  } catch {
    return [];
  }
}

// --- S3 Writers & CloudFront ---

async function putObject(key: string, body: string, contentType: string): Promise<void> {
  await s3.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: body,
      ContentType: contentType,
    })
  );
}

async function getDistributionId(): Promise<string | null> {
  const response = await cloudfront.send(new ListDistributionsCommand({}));
  const items = response.DistributionList?.Items || [];
  for (const dist of items) {
    const aliases = dist.Aliases?.Items || [];
    if (aliases.includes(SITE_ALIAS) && dist.Id) {
      return dist.Id;
    }
  }
  return null;
}

async function invalidatePaths(paths: string[]): Promise<void> {
  const distributionId = await getDistributionId();
  if (!distributionId) {
    console.warn("Could not find CloudFront distribution; skipping invalidation");
    return;
  }
  await cloudfront.send(
    new CreateInvalidationCommand({
      DistributionId: distributionId,
      InvalidationBatch: {
        CallerReference: `deploy-${Date.now()}`,
        Paths: { Quantity: paths.length, Items: paths },
      },
    })
  );
}

/**
 * Write the site artifacts (manifests, search index, RSS, sitemap) from the
 * given manifests and invalidate CloudFront. Shared by the manual deploy and
 * the scheduled publisher.
 */
async function publishArtifacts(posts: ManifestEntry[], kb: ManifestEntry[]): Promise<void> {
  const searchIndex = buildSearchIndex(posts, kb);
  const rss = buildRss(posts);
  const landingPages = await loadLandingManifest();
  const sitemap = buildSitemap(
    posts,
    kb,
    landingPages.map((p) => p.slug)
  );

  // Read before overwriting: the prerendered pages are brought into line by comparing
  // the new manifests against the ones currently published, so only genuinely changed
  // pages are rewritten.
  const [previousPosts, previousKb] = await Promise.all([
    loadLiveManifest("posts"),
    loadLiveManifest("knowledge-base"),
  ]);

  await Promise.all([
    putObject("content/posts/manifest.json", JSON.stringify(posts, null, 2), "application/json"),
    putObject(
      "content/knowledge-base/manifest.json",
      JSON.stringify(kb, null, 2),
      "application/json"
    ),
    putObject("search-index.json", JSON.stringify(searchIndex, null, 2), "application/json"),
    putObject("rss.xml", rss, "application/xml"),
    putObject("sitemap.xml", sitemap, "application/xml"),
  ]);

  // Prerendered heads, after the manifests. If the shell turns out to be unusable this
  // throws and the deploy is reported failed, but the content above is already live —
  // the same ordering the rest of this Lambda assumes.
  const shell = await loadShell();
  const metaPaths = [
    ...(await syncMetaPages("posts", previousPosts, posts, shell)),
    ...(await syncMetaPages("knowledge-base", previousKb, kb, shell)),
    ...(await syncLandingMetaPages(landingPages, shell)),
  ];

  // Invalidate all content (manifests + individual post/article markdown and
  // images) plus the site-level index files. The "/content/*" wildcard counts
  // as a single invalidation path, so this stays cheap while ensuring edits to
  // any post actually become visible.
  const paths = ["/content/*", "/search-index.json", "/rss.xml", "/sitemap.xml", ...metaPaths];

  // A normal edit adds one or two meta-page paths. A bulk change — a taxonomy rename,
  // or the first run after this was introduced — could add hundreds, and CloudFront
  // bills per path beyond a free monthly allowance. One wildcard is cheaper than a
  // long list and purges a superset, so past a threshold it collapses.
  await invalidatePaths(paths.length > INVALIDATION_PATH_LIMIT ? ["/*"] : paths);
}

/**
 * Load the currently-published manifest for a content type from S3. Returns an
 * empty array when it does not exist yet.
 */
async function loadLiveManifest(type: "posts" | "knowledge-base"): Promise<ManifestEntry[]> {
  try {
    const response = await s3.send(
      new GetObjectCommand({ Bucket: BUCKET, Key: `content/${type}/manifest.json` })
    );
    const content = await response.Body!.transformToString();
    const parsed = JSON.parse(content);
    return Array.isArray(parsed) ? (parsed as ManifestEntry[]) : [];
  } catch (err: unknown) {
    if (
      err &&
      typeof err === "object" &&
      "name" in err &&
      ((err as { name: string }).name === "NoSuchKey" ||
        (err as { name: string }).name === "AccessDenied")
    ) {
      return [];
    }
    throw err;
  }
}

/** Structural equality of two manifests (same order, same fields). */
function manifestsEqual(a: ManifestEntry[], b: ManifestEntry[]): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

// --- Regeneration Worker ---

/**
 * Reads all content from S3, regenerates the manifests / search index /
 * RSS / sitemap, writes them back to the bucket root, and invalidates
 * CloudFront. Updates the deploy status as it progresses.
 */
async function regenerate(triggeredBy?: string): Promise<void> {
  let startedAt: string | undefined;
  try {
    // Inside the try so a failure reading the current status is still reported.
    startedAt = (await getDeployStatus()).startedAt;
    // A single "now" so posts and KB filter drafts/future-dated content
    // consistently within one regeneration.
    const now = Date.now();
    const [posts, kb] = await Promise.all([
      buildManifest("posts", now),
      buildManifest("knowledge-base", now),
    ]);

    await writeDeployStatus({ status: "deploying", startedAt });

    await publishArtifacts(posts, kb);

    const completedAt = new Date().toISOString();
    await writeDeployStatus({ status: "success", startedAt, completedAt });
    await appendDeployHistory({
      status: "success",
      startedAt,
      completedAt,
      durationMs: startedAt
        ? new Date(completedAt).getTime() - new Date(startedAt).getTime()
        : undefined,
      postCount: posts.length,
      kbCount: kb.length,
      triggeredBy,
    });
    console.log(`Regenerated: ${posts.length} posts, ${kb.length} KB articles`);
  } catch (err: unknown) {
    console.error("Regeneration failed:", err);
    const message = err instanceof Error ? err.message : "Regeneration failed";
    const completedAt = new Date().toISOString();
    await writeDeployStatus({
      status: "failed",
      startedAt,
      completedAt,
      error: message,
    });
    await appendDeployHistory({
      status: "failed",
      startedAt,
      completedAt,
      durationMs: startedAt
        ? new Date(completedAt).getTime() - new Date(startedAt).getTime()
        : undefined,
      error: message,
      triggeredBy,
    });
    await notifyFailure({
      subject: `${SITE_ALIAS} deploy failed`,
      message: `Site regeneration failed and the site was not republished.\n\n${message}`,
      context: {
        "Triggered by": triggeredBy || "unknown",
        "Started at": startedAt,
        "Failed at": completedAt,
      },
    });
  }
}

// --- Scheduled Publisher ---

/**
 * Invoked on a schedule (EventBridge). Rebuilds the manifests as of "now" and,
 * if that differs from what is currently published (i.e. a scheduled post's
 * date has arrived, or a draft was flipped), publishes the updated artifacts.
 * When nothing is due, it does nothing — no deploy, no invalidation, no history
 * entry — so the schedule is cheap and doesn't pollute deploy history.
 */
export async function scheduledPublish(): Promise<void> {
  // Everything runs inside the try: this path is unattended, so any failure —
  // including reading the current status or building the manifests — must be
  // recorded and alerted rather than thrown away.
  const startedAt = new Date().toISOString();
  try {
    // Don't fight an in-progress manual deploy; the next run will pick things up.
    // A stale in-progress status (a lost worker invocation) is ignored so the
    // scheduler isn't blocked indefinitely.
    const current = await getDeployStatus();
    if (
      (current.status === "building" || current.status === "deploying") &&
      !isStaleInProgress(current, Date.now())
    ) {
      console.log("Scheduled publish skipped: a deploy is already in progress.");
      return;
    }

    const now = Date.now();
    const [posts, kb, livePosts, liveKb] = await Promise.all([
      buildManifest("posts", now),
      buildManifest("knowledge-base", now),
      loadLiveManifest("posts"),
      loadLiveManifest("knowledge-base"),
    ]);

    if (manifestsEqual(posts, livePosts) && manifestsEqual(kb, liveKb)) {
      console.log("Scheduled publish: no content is due; nothing to do.");
      return;
    }

    await writeDeployStatus({ status: "deploying", startedAt });
    await publishArtifacts(posts, kb);
    const completedAt = new Date().toISOString();
    await writeDeployStatus({ status: "success", startedAt, completedAt });
    await appendDeployHistory({
      status: "success",
      startedAt,
      completedAt,
      durationMs: new Date(completedAt).getTime() - new Date(startedAt).getTime(),
      postCount: posts.length,
      kbCount: kb.length,
      triggeredBy: "scheduler",
    });
    console.log(`Scheduled publish: ${posts.length} posts, ${kb.length} KB articles`);
  } catch (err: unknown) {
    console.error("Scheduled publish failed:", err);
    const message = err instanceof Error ? err.message : "Scheduled publish failed";
    const completedAt = new Date().toISOString();
    await writeDeployStatus({ status: "failed", startedAt, completedAt, error: message });
    await appendDeployHistory({
      status: "failed",
      startedAt,
      completedAt,
      durationMs: new Date(completedAt).getTime() - new Date(startedAt).getTime(),
      error: message,
      triggeredBy: "scheduler",
    });
    // This path runs unattended on an hourly schedule, so an alert is the only
    // signal that scheduled content failed to publish.
    await notifyFailure({
      subject: `${SITE_ALIAS} scheduled publish failed`,
      message:
        `The hourly scheduled publish failed. Content whose publish date has ` +
        `arrived may not be live.\n\n${message}`,
      context: { "Started at": startedAt, "Failed at": completedAt },
    });
  }
}

// --- Request Routing ---

function isRegenerateEvent(event: unknown): event is RegenerateEvent {
  return (
    typeof event === "object" &&
    event !== null &&
    (event as RegenerateEvent).action === "regenerate"
  );
}

function isScheduledPublishEvent(event: unknown): boolean {
  return (
    typeof event === "object" &&
    event !== null &&
    (event as { action?: string }).action === "scheduled-publish"
  );
}

export async function handler(
  event: APIGatewayProxyEventV2 | RegenerateEvent | { action: "scheduled-publish" }
): Promise<APIGatewayProxyResultV2 | void> {
  // Async self-invocation: run the regeneration work.
  if (isRegenerateEvent(event)) {
    await regenerate(event.triggeredBy);
    return;
  }

  // Scheduled (EventBridge) invocation: publish any content that has come due.
  if (isScheduledPublishEvent(event)) {
    await scheduledPublish();
    return;
  }

  const apiEvent = event as APIGatewayProxyEventV2;
  try {
    const method = apiEvent.requestContext.http.method;
    const path = apiEvent.rawPath;

    if (method === "GET" && path === "/api/deploy/status") {
      return jsonResponse(200, await getDeployStatus());
    }

    if (method === "GET" && path === "/api/deploy/history") {
      return jsonResponse(200, await getDeployHistory());
    }

    if (method === "POST" && path === "/api/deploy") {
      return await handleTriggerDeploy(apiEvent);
    }

    return errorResponse(405, "METHOD_NOT_ALLOWED", `Method ${method} not allowed`);
  } catch (err: unknown) {
    console.error("Unhandled error:", err);
    return errorResponse(500, "INTERNAL_ERROR", "An unexpected error occurred", apiEvent.rawPath);
  }
}

// --- POST /api/deploy ---

async function handleTriggerDeploy(
  event: APIGatewayProxyEventV2
): Promise<APIGatewayProxyResultV2> {
  const currentStatus = await getDeployStatus();

  // Block only if a genuinely-active deploy is in progress. An in-progress
  // status left behind by a lost worker invocation goes stale and is allowed
  // to be superseded, so the deploy never wedges permanently.
  if (
    (currentStatus.status === "building" || currentStatus.status === "deploying") &&
    !isStaleInProgress(currentStatus, Date.now())
  ) {
    return errorResponse(
      409,
      "DEPLOY_IN_PROGRESS",
      "A deployment is already in progress. Please wait for it to complete."
    );
  }

  const newStatus: DeployStatus = {
    status: "building",
    startedAt: new Date().toISOString(),
  };
  await writeDeployStatus(newStatus);

  const actor = getActor(event);
  await writeAudit({
    action: "deploy.trigger",
    resource: "site",
    user: actor,
  });

  // Kick off the heavy regeneration work asynchronously so the request
  // returns immediately and the frontend can poll for completion. If the
  // invocation itself fails, reset the status so the deploy doesn't wedge in
  // "building" forever (every later trigger would otherwise 409).
  try {
    await lambda.send(
      new InvokeCommand({
        FunctionName: FUNCTION_NAME,
        InvocationType: "Event",
        Payload: Buffer.from(JSON.stringify({ action: "regenerate", triggeredBy: actor })),
      })
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to start deployment";
    await writeDeployStatus({
      status: "failed",
      startedAt: newStatus.startedAt,
      completedAt: new Date().toISOString(),
      error: message,
    });
    return errorResponse(502, "DEPLOY_START_FAILED", `Failed to start deployment: ${message}`);
  }

  return jsonResponse(200, newStatus);
}
