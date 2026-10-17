/**
 * Landing-pages admin API (landing-page-editor stage 5).
 *
 * Serves `/api/pages` — list/get/save/delete for landing pages, which are JSON documents
 * (the `LandingPage` schema in src/lib/page-schema.d.ts), not markdown. A distinct Lambda
 * and route namespace from `/api/content` on purpose: a landing page's shape and
 * validation differ from a post's, and sharing the `{type}` dispatch would risk a
 * post-shaped assumption (frontmatter, `date`, `draft`) leaking into pages.
 *
 * It mirrors the content Lambda's **commit-then-write** contract: a save validates, then
 * commits to the Content_Repo (git is the source of truth), and only on a successful (or
 * skipped) commit writes S3. A commit failure returns 502 and never touches S3, so there
 * is no half-written state. The page.json and the rebuilt pages manifest are committed as
 * one atomic commit (`commitFiles`) so the two never diverge in git.
 *
 * The manifest is derived from the full `content/pages/` tree in S3 after each change —
 * the same "derive from the tree" rule the build (`buildPagesManifest`) and the
 * Reconcile_Job use, so all three agree.
 */
import {
  S3Client,
  ListObjectsV2Command,
  GetObjectCommand,
  PutObjectCommand,
  DeleteObjectsCommand,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";
import * as crypto from "crypto";
import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from "aws-lambda";
import { createGitProvider, requireCommitted, CommitFailedError } from "../shared/git";
import { writeAudit, getActor } from "../shared/audit";
// The strict validator shared with the build (scripts/validate-page.js). esbuild bundles
// it; it is pure and has no node-only dependencies, so it runs unchanged in Lambda.
import { validatePage } from "../../../scripts/validate-page.js";

const s3 = new S3Client({});
const BUCKET = process.env.CONTENT_BUCKET!;

// Resolved once per container. Selected by configuration, so this Lambda depends on the
// GitProvider interface rather than on GitLab.
const git = createGitProvider();

const PAGES_PREFIX = "content/pages/";
const MANIFEST_KEY = "content/pages/manifest.json";

// Framework routes and post/KB prefixes a landing-page slug must not collide with. A
// collision would make the catch-all resolver ambiguous (requirement 4.1).
const RESERVED_SLUGS = new Set(["", "posts", "knowledge-base", "categories", "tags", "admin"]);

// --- Types ---

interface LandingPageDoc {
  schemaVersion: number;
  slug: string;
  nav?: { label: string; order: number };
  seo: { title: string; description: string };
  header: { title: string; description?: string; divider?: boolean };
  breadcrumbs?: Array<{ text: string; to?: string }>;
  blocks: unknown[];
  /** Server-managed; stamped on save, never accepted from the client. */
  modified?: string;
}

interface ManifestEntry {
  slug: string;
  nav?: { label: string; order: number };
  seo: { title: string; description: string };
}

// --- Response helpers (same flat shape the content Lambda and the admin client use) ---

function errorResponse(
  statusCode: number,
  code: string,
  message: string,
  path?: string
): APIGatewayProxyStructuredResultV2 {
  return {
    statusCode,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code, message, path, correlationId: crypto.randomUUID() }),
  };
}

function jsonResponse(statusCode: number, data: unknown): APIGatewayProxyStructuredResultV2 {
  return {
    statusCode,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  };
}

// --- S3 helpers ---

/** The S3 key for a page's JSON document. */
function pageKey(slug: string): string {
  return `${PAGES_PREFIX}${slug}/page.json`;
}

/** List every `page.json` under content/pages/ and return their parsed documents. */
async function listPageDocs(): Promise<LandingPageDoc[]> {
  const keys: string[] = [];
  let continuationToken: string | undefined;
  do {
    const response = await s3.send(
      new ListObjectsV2Command({
        Bucket: BUCKET,
        Prefix: PAGES_PREFIX,
        ContinuationToken: continuationToken,
      })
    );
    for (const obj of response.Contents ?? []) {
      if (obj.Key && obj.Key.endsWith("/page.json")) keys.push(obj.Key);
    }
    continuationToken = response.NextContinuationToken;
  } while (continuationToken);

  const docs: LandingPageDoc[] = [];
  for (const key of keys) {
    try {
      const response = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }));
      const body = await response.Body!.transformToString();
      docs.push(JSON.parse(body) as LandingPageDoc);
    } catch {
      // A single unreadable/corrupt page.json must not take down a list of all of them.
    }
  }
  return docs;
}

/** Read one page document by slug, or null if it does not exist. */
async function getPageDoc(slug: string): Promise<LandingPageDoc | null> {
  try {
    const response = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: pageKey(slug) }));
    const body = await response.Body!.transformToString();
    return JSON.parse(body) as LandingPageDoc;
  } catch {
    return null;
  }
}

/** The S3 LastModified (ISO) for a page, or null if it is missing. Concurrency token. */
async function getPageLastModified(slug: string): Promise<string | null> {
  try {
    const response = await s3.send(new HeadObjectCommand({ Bucket: BUCKET, Key: pageKey(slug) }));
    return response.LastModified ? response.LastModified.toISOString() : null;
  } catch {
    return null;
  }
}

/**
 * Build the pages manifest from a set of page documents — the same shape
 * `buildPagesManifest` produces, sorted by nav.order then unlisted last.
 */
function buildManifest(docs: LandingPageDoc[]): ManifestEntry[] {
  return docs
    .map((p) => ({
      slug: p.slug,
      ...(p.nav ? { nav: p.nav } : {}),
      seo: {
        title: p.seo?.title ?? p.header?.title ?? p.slug,
        description: p.seo?.description ?? "",
      },
    }))
    .sort((a, b) => (a.nav?.order ?? Infinity) - (b.nav?.order ?? Infinity));
}

/**
 * Rebuild the manifest from the current tree with one document overlaid (upsert) or
 * removed (delete), so the manifest reflects the change being committed in the same
 * atomic commit — without a read-after-write race against S3's eventual consistency.
 */
function manifestWith(
  current: LandingPageDoc[],
  change: { upsert?: LandingPageDoc; removeSlug?: string }
): ManifestEntry[] {
  let docs = current;
  if (change.removeSlug !== undefined) {
    docs = docs.filter((d) => d.slug !== change.removeSlug);
  }
  if (change.upsert) {
    docs = [...docs.filter((d) => d.slug !== change.upsert!.slug), change.upsert];
  }
  return buildManifest(docs);
}

// --- Route parsing ---

interface RouteParams {
  method: string;
  slug?: string;
}

function parseRoute(event: APIGatewayProxyEventV2): RouteParams {
  const method = event.requestContext.http.method;
  // Path is /api/pages or /api/pages/{slug} where {slug} may contain slashes
  // (teaching/cmst388-tips), captured by a greedy proxy param.
  const raw = event.pathParameters?.slug ?? event.pathParameters?.proxy;
  const slug = typeof raw === "string" ? decodeURIComponent(raw).replace(/\/+$/, "") : undefined;
  return { method, slug };
}

// --- Handlers ---

async function handleList(): Promise<APIGatewayProxyStructuredResultV2> {
  const docs = await listPageDocs();
  // Return the manifest-shaped summary; the editor fetches the full doc on open.
  return jsonResponse(200, buildManifest(docs));
}

async function handleGet(slug: string): Promise<APIGatewayProxyStructuredResultV2> {
  const doc = await getPageDoc(slug);
  if (!doc) {
    return errorResponse(404, "PAGE_NOT_FOUND", `Landing page not found: ${slug}`, pageKey(slug));
  }
  const lastModified = await getPageLastModified(slug);
  return jsonResponse(200, { ...doc, lastModified });
}

async function handlePut(
  slug: string | undefined,
  event: APIGatewayProxyEventV2
): Promise<APIGatewayProxyStructuredResultV2> {
  if (!event.body) {
    return errorResponse(400, "MISSING_BODY", "Request body is required");
  }

  let payload: LandingPageDoc & { lastModified?: string };
  try {
    payload = JSON.parse(
      event.isBase64Encoded ? Buffer.from(event.body, "base64").toString() : event.body
    );
  } catch {
    return errorResponse(400, "INVALID_JSON", "Request body must be valid JSON");
  }

  // The URL slug (update) wins over any slug in the body; on create the body supplies it.
  const targetSlug = slug ?? payload.slug;
  if (typeof targetSlug !== "string" || targetSlug === "") {
    return errorResponse(400, "VALIDATION_ERROR", "A slug is required");
  }
  if (RESERVED_SLUGS.has(targetSlug) || targetSlug.split("/")[0] === "knowledge-base") {
    return errorResponse(
      400,
      "SLUG_RESERVED",
      `The slug "${targetSlug}" collides with a framework route and cannot be used`
    );
  }

  // Normalise: the stored slug is authoritative and must match the key we write.
  const page: LandingPageDoc = { ...payload, slug: targetSlug };
  delete (page as { lastModified?: string }).lastModified; // never persist the token
  delete page.modified; // server-managed; stamped below, never taken from the client

  // Strict validation BEFORE any write — the same validator the build runs. An invalid
  // page is a 400 that names the offending field, and nothing is committed or written.
  const problems = validatePage(page);
  if (problems.length > 0) {
    return errorResponse(
      400,
      "VALIDATION_ERROR",
      `Landing page is invalid:\n${problems.join("\n")}`,
      pageKey(targetSlug)
    );
  }

  const existing = await getPageDoc(targetSlug);
  const isCreate = !slug && !existing;

  if (isCreate && existing) {
    return errorResponse(
      409,
      "SLUG_CONFLICT",
      `A landing page with slug "${targetSlug}" already exists`,
      pageKey(targetSlug)
    );
  }

  // Optimistic concurrency on update: reject if the stored page changed since load.
  if (slug && payload.lastModified) {
    const current = await getPageLastModified(targetSlug);
    if (current && current !== payload.lastModified) {
      return errorResponse(
        409,
        "EDIT_CONFLICT",
        "This page was modified since you opened it. Reload before saving.",
        pageKey(targetSlug)
      );
    }
  }

  // Stamp the server-managed edit time.
  page.modified = new Date().toISOString();

  const json = JSON.stringify(page, null, 2) + "\n";
  const key = pageKey(targetSlug);

  // Rebuild the manifest from the current tree with this page overlaid, so page.json and
  // manifest.json move together.
  const currentDocs = await listPageDocs();
  const manifest = manifestWith(currentDocs, { upsert: page });
  const manifestJson = JSON.stringify(manifest, null, 2) + "\n";

  // Commit page + manifest atomically to the Content_Repo FIRST. A failed commit throws
  // (502) and S3 is never touched.
  requireCommitted(
    await git.commitFiles(
      [
        {
          action: isCreate ? "create" : "update",
          filePath: git.s3KeyToRepoPath(key),
          content: json,
          encoding: "text",
        },
        {
          action: "update",
          filePath: git.s3KeyToRepoPath(MANIFEST_KEY),
          content: manifestJson,
          encoding: "text",
        },
      ],
      `page: ${isCreate ? "add" : "update"} ${targetSlug} [skip ci]`
    )
  );

  // Then the projection: write both to S3. A failure here, after the commit, is visible
  // staleness until the next reconcile — never loss — matching the content Lambda.
  await s3.send(
    new PutObjectCommand({ Bucket: BUCKET, Key: key, Body: json, ContentType: "application/json" })
  );
  await s3.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: MANIFEST_KEY,
      Body: manifestJson,
      ContentType: "application/json",
    })
  );

  await writeAudit({
    action: `page.${isCreate ? "create" : "update"}`,
    resource: targetSlug,
    user: getActor(event),
  });

  const lastModified = await getPageLastModified(targetSlug);
  return jsonResponse(isCreate ? 201 : 200, { ...page, lastModified });
}

async function handleDelete(
  slug: string | undefined,
  event: APIGatewayProxyEventV2
): Promise<APIGatewayProxyStructuredResultV2> {
  if (!slug) {
    return errorResponse(400, "MISSING_SLUG", "Slug is required for deletion");
  }
  const existing = await getPageDoc(slug);
  if (!existing) {
    return errorResponse(404, "PAGE_NOT_FOUND", `Landing page not found: ${slug}`, pageKey(slug));
  }

  // List every object under the page's prefix (page.json plus any images) so the delete
  // removes the whole page, mirroring the content Lambda.
  const prefix = `${PAGES_PREFIX}${slug}/`;
  const keys: string[] = [];
  let continuationToken: string | undefined;
  do {
    const response = await s3.send(
      new ListObjectsV2Command({
        Bucket: BUCKET,
        Prefix: prefix,
        ContinuationToken: continuationToken,
      })
    );
    for (const obj of response.Contents ?? []) {
      if (obj.Key) keys.push(obj.Key);
    }
    continuationToken = response.NextContinuationToken;
  } while (continuationToken);

  // Rebuild the manifest without this page.
  const currentDocs = await listPageDocs();
  const manifest = manifestWith(currentDocs, { removeSlug: slug });
  const manifestJson = JSON.stringify(manifest, null, 2) + "\n";

  // Commit the deletions + the updated manifest first.
  requireCommitted(
    await git.commitFiles(
      [
        ...keys.map((k) => ({ action: "delete" as const, filePath: git.s3KeyToRepoPath(k) })),
        {
          action: "update" as const,
          filePath: git.s3KeyToRepoPath(MANIFEST_KEY),
          content: manifestJson,
          encoding: "text" as const,
        },
      ],
      `page: delete ${slug} [skip ci]`
    )
  );

  // Then remove from S3 and update the manifest object.
  if (keys.length > 0) {
    await s3.send(
      new DeleteObjectsCommand({
        Bucket: BUCKET,
        Delete: { Objects: keys.map((Key) => ({ Key })) },
      })
    );
  }
  await s3.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: MANIFEST_KEY,
      Body: manifestJson,
      ContentType: "application/json",
    })
  );

  await writeAudit({ action: "page.delete", resource: slug, user: getActor(event) });

  return { statusCode: 204, headers: { "Content-Type": "application/json" }, body: "" };
}

export async function handler(
  event: APIGatewayProxyEventV2
): Promise<APIGatewayProxyStructuredResultV2> {
  const { method, slug } = parseRoute(event);

  try {
    switch (method) {
      case "GET":
        return slug ? await handleGet(slug) : await handleList();
      case "PUT":
        return await handlePut(slug, event);
      case "DELETE":
        return await handleDelete(slug, event);
      default:
        return errorResponse(405, "METHOD_NOT_ALLOWED", `Method ${method} not allowed`);
    }
  } catch (err) {
    if (err instanceof CommitFailedError) {
      return errorResponse(err.statusCode, err.code, err.message);
    }
    console.error("Unhandled error in pages handler:", err);
    return errorResponse(500, "INTERNAL_ERROR", "An unexpected error occurred");
  }
}
