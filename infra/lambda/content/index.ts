import {
  S3Client,
  ListObjectsV2Command,
  GetObjectCommand,
  PutObjectCommand,
  DeleteObjectsCommand,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";
import * as yaml from "js-yaml";
import * as crypto from "crypto";
import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from "aws-lambda";
import { createGitProvider, requireCommitted, CommitFailedError } from "../shared/git";
import { writeAudit, getActor } from "../shared/audit";

const s3 = new S3Client({});
const BUCKET = process.env.CONTENT_BUCKET!;

// Resolved once per container. Selected by configuration, so this Lambda depends on the
// GitProvider interface rather than on GitLab.
const git = createGitProvider();

// --- Types ---

interface ContentMeta {
  title: string;
  date?: string;
  description?: string;
  author?: string;
  categories?: string[];
  tags?: string[];
  draft?: boolean;
  /**
   * When this item was last edited, as a full ISO timestamp. Server-managed:
   * stamped on every save (see `putContent` callers) and never accepted from the
   * client. Distinct from `date`, which is the publication date and does not move
   * when an old article is edited.
   *
   * This lives in frontmatter rather than being derived from S3 `LastModified`
   * because a site deploy rewrites every content object, resetting all of them to
   * the deploy time. Being in the file means it survives deploys and is carried
   * into git by the existing mirror, so the value is effectively the git
   * modification timestamp without needing any GitLab lookup to read it.
   */
  modified?: string;
  [key: string]: unknown;
}

interface ContentItem {
  slug: string;
  type: string;
  title: string;
  date: string;
  description?: string;
  author?: string;
  categories: string[];
  tags: string[];
  draft: boolean;
  body?: string;
  images: string[];
  /**
   * S3 `LastModified`. Load-bearing: this is the optimistic-concurrency token the
   * client echoes back on save so a stale overwrite can be rejected. It is **not**
   * a meaningful "when was this edited" value, because a deploy rewrites every
   * content object and resets it — use `modified` for display.
   */
  lastModified: string;
  /** Last edit time from frontmatter, ISO timestamp. Absent on never-edited content. */
  modified?: string;
}

interface ApiError {
  code: string;
  message: string;
  path?: string;
  correlationId: string;
}

// --- Cache ---

interface CacheEntry {
  data: ContentItem[];
  timestamp: number;
}

const listCache: Record<string, CacheEntry> = {};
const CACHE_TTL_MS = 60_000;

// --- Utility Functions ---

export function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/['\u2018\u2019\u201B]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

// A valid slug matches the shape slugify() produces: lowercase alphanumerics
// and single hyphens, no leading/trailing hyphen. Validating before the slug
// is used in any S3 key or git repo path rejects "..", path separators, and
// other surprises (defense-in-depth against traversal-like keys).
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function isValidSlug(slug: string): boolean {
  return SLUG_PATTERN.test(slug);
}

export function serializeContent(meta: ContentMeta, body: string): string {
  const frontmatter = yaml.dump(meta, { lineWidth: -1 });
  return `---\n${frontmatter}---\n\n${body}`;
}

export function parseFrontmatter(content: string): { meta: ContentMeta; body: string } {
  const match = content.match(/^---\n([\s\S]*?)\n---\n\n?([\s\S]*)$/);
  if (!match) {
    throw new Error("Invalid frontmatter format");
  }
  const meta = yaml.load(match[1]) as ContentMeta;
  const body = match[2];
  return { meta, body };
}

/**
 * Normalize a date value from frontmatter to an ISO 8601 string.
 * js-yaml parses unquoted dates like `2024-01-15` as Date objects.
 */
export function normalizeDate(value: unknown): string {
  if (value instanceof Date) {
    return value.toISOString().split("T")[0];
  }
  return String(value || "");
}

/**
 * Normalize a frontmatter timestamp to a full ISO 8601 string, or undefined.
 *
 * Unlike `normalizeDate` this keeps the time component, since `modified` is a
 * precise edit time rather than a calendar date. js-yaml parses an unquoted
 * timestamp as a Date, which happens when someone hand-writes the field in git,
 * so both Date and string inputs have to be handled. Anything unparseable is
 * dropped rather than passed through, so a malformed value degrades to the
 * publication-date fallback instead of rendering as "Invalid Date".
 */
export function normalizeTimestamp(value: unknown): string | undefined {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? undefined : value.toISOString();
  }
  if (typeof value !== "string" || value.trim() === "") return undefined;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
}

function errorResponse(
  statusCode: number,
  code: string,
  message: string,
  path?: string
): APIGatewayProxyStructuredResultV2 {
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

function jsonResponse(statusCode: number, data: unknown): APIGatewayProxyStructuredResultV2 {
  return {
    statusCode,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  };
}

// --- S3 Helpers ---

async function listContentItems(type: string): Promise<ContentItem[]> {
  const cacheKey = type;
  const cached = listCache[cacheKey];
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.data;
  }

  const prefix = `content/${type}/`;
  const indexKeys: { key: string; lastModified: string }[] = [];
  let continuationToken: string | undefined;

  // Step 1: List all index.md keys
  do {
    const command = new ListObjectsV2Command({
      Bucket: BUCKET,
      Prefix: prefix,
      ContinuationToken: continuationToken,
    });
    const response = await s3.send(command);

    if (response.Contents) {
      for (const obj of response.Contents) {
        if (obj.Key && obj.Key.endsWith("/index.md")) {
          indexKeys.push({
            key: obj.Key,
            lastModified: obj.LastModified?.toISOString() || "",
          });
        }
      }
    }

    continuationToken = response.NextContinuationToken;
  } while (continuationToken);

  // Step 2: Fetch files in parallel batches of 50
  const BATCH_SIZE = 50;
  const items: ContentItem[] = [];

  for (let i = 0; i < indexKeys.length; i += BATCH_SIZE) {
    const batch = indexKeys.slice(i, i + BATCH_SIZE);
    const results = await Promise.allSettled(
      batch.map(async ({ key, lastModified }) => {
        const getCommand = new GetObjectCommand({ Bucket: BUCKET, Key: key });
        const getResponse = await s3.send(getCommand);
        const content = await getResponse.Body!.transformToString();
        const { meta } = parseFrontmatter(content);

        const slugMatch = key.match(new RegExp(`^content/${type}/([^/]+)/index\\.md$`));
        if (slugMatch) {
          return {
            slug: slugMatch[1],
            type,
            title: meta.title || "",
            date: normalizeDate(meta.date),
            description: meta.description,
            author: meta.author,
            categories: meta.categories || [],
            tags: meta.tags || [],
            draft: meta.draft === true,
            images: [],
            lastModified,
            modified: normalizeTimestamp(meta.modified),
          } as ContentItem;
        }
        return null;
      })
    );

    for (const result of results) {
      if (result.status === "fulfilled" && result.value) {
        items.push(result.value);
      }
    }
  }

  listCache[cacheKey] = { data: items, timestamp: Date.now() };
  return items;
}

async function getContentItem(type: string, slug: string): Promise<ContentItem | null> {
  const key = `content/${type}/${slug}/index.md`;
  try {
    const command = new GetObjectCommand({ Bucket: BUCKET, Key: key });
    const response = await s3.send(command);
    const content = await response.Body!.transformToString();
    const { meta, body } = parseFrontmatter(content);

    // List images
    const imagesPrefix = `content/${type}/${slug}/images/`;
    let images: string[] = [];
    try {
      const imagesCommand = new ListObjectsV2Command({
        Bucket: BUCKET,
        Prefix: imagesPrefix,
      });
      const imagesResponse = await s3.send(imagesCommand);
      if (imagesResponse.Contents) {
        images = imagesResponse.Contents.filter((obj) => obj.Key && obj.Key !== imagesPrefix)
          .map((obj) => obj.Key!.split("/").pop()!)
          .filter(Boolean);
      }
    } catch {
      // Ignore errors listing images
    }

    return {
      slug,
      type,
      title: meta.title || "",
      date: normalizeDate(meta.date),
      description: meta.description,
      author: meta.author,
      categories: meta.categories || [],
      tags: meta.tags || [],
      draft: meta.draft === true,
      body,
      images,
      lastModified: response.LastModified?.toISOString() || "",
      modified: normalizeTimestamp(meta.modified),
    };
  } catch (err: unknown) {
    if (
      err &&
      typeof err === "object" &&
      "name" in err &&
      (err as { name: string }).name === "NoSuchKey"
    ) {
      return null;
    }
    throw err;
  }
}

async function slugExists(type: string, slug: string): Promise<boolean> {
  const key = `content/${type}/${slug}/index.md`;
  try {
    await s3.send(new HeadObjectCommand({ Bucket: BUCKET, Key: key }));
    return true;
  } catch {
    return false;
  }
}

/** Return the S3 LastModified (ISO) for a content item, or null if missing. */
async function getObjectLastModified(type: string, slug: string): Promise<string | null> {
  const key = `content/${type}/${slug}/index.md`;
  try {
    const response = await s3.send(new HeadObjectCommand({ Bucket: BUCKET, Key: key }));
    return response.LastModified?.toISOString() ?? null;
  } catch {
    return null;
  }
}

async function putContent(type: string, slug: string, content: string): Promise<void> {
  const key = `content/${type}/${slug}/index.md`;
  await s3.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: content,
      ContentType: "text/markdown",
    })
  );
  // Invalidate cache for this type
  delete listCache[type];
}

/** The S3 keys under a content item's prefix, which are what a delete removes. */
async function listContentKeys(type: string, slug: string): Promise<string[]> {
  const prefix = `content/${type}/${slug}/`;
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

  return keys;
}

/** Remove a set of S3 keys. Separate from listing so the git commit can go between. */
async function deleteContentKeys(type: string, keys: string[]): Promise<void> {
  if (keys.length > 0) {
    // S3 DeleteObjects supports max 1000 keys per request
    for (let i = 0; i < keys.length; i += 1000) {
      await s3.send(
        new DeleteObjectsCommand({
          Bucket: BUCKET,
          Delete: { Objects: keys.slice(i, i + 1000).map((Key) => ({ Key })) },
        })
      );
    }
  }
  // Invalidate cache for this type
  delete listCache[type];
}

// --- Route Parsing ---

interface RouteParams {
  method: string;
  type?: string;
  slug?: string;
  action?: "revisions" | "restore";
}

function parseRoute(event: APIGatewayProxyEventV2): RouteParams {
  const method = event.requestContext.http.method;
  const path = event.rawPath;

  // Match /api/content/{type}/{slug}/revisions
  const revisionsMatch = path.match(/^\/api\/content\/([^/]+)\/([^/]+)\/revisions$/);
  if (revisionsMatch) {
    return { method, type: revisionsMatch[1], slug: revisionsMatch[2], action: "revisions" };
  }

  // Match /api/content/{type}/{slug}/restore
  const restoreMatch = path.match(/^\/api\/content\/([^/]+)\/([^/]+)\/restore$/);
  if (restoreMatch) {
    return { method, type: restoreMatch[1], slug: restoreMatch[2], action: "restore" };
  }

  // Match /api/content/{type}/{slug}
  const slugMatch = path.match(/^\/api\/content\/([^/]+)\/([^/]+)$/);
  if (slugMatch) {
    return { method, type: slugMatch[1], slug: slugMatch[2] };
  }

  // Match /api/content/{type}
  const typeMatch = path.match(/^\/api\/content\/([^/]+)$/);
  if (typeMatch) {
    return { method, type: typeMatch[1] };
  }

  return { method };
}

// --- Handler ---

// APIGatewayProxyStructuredResultV2, not APIGatewayProxyResultV2: the latter is
// `APIGatewayProxyStructuredResultV2 | string`, where the string form is for handlers
// that return a bare body. Every response below goes through jsonResponse or
// errorResponse, so the string half was never reachable. It did make every
// `result.statusCode` in the tests a type error, which went unnoticed while the infra
// tsconfig excluded test files.
export async function handler(
  event: APIGatewayProxyEventV2
): Promise<APIGatewayProxyStructuredResultV2> {
  try {
    const route = parseRoute(event);

    if (!route.type) {
      return errorResponse(400, "INVALID_PATH", "Missing content type in path");
    }

    // Validate content type
    const validTypes = ["posts", "knowledge-base"];
    if (!validTypes.includes(route.type)) {
      return errorResponse(
        400,
        "INVALID_TYPE",
        `Invalid content type: ${route.type}. Must be one of: ${validTypes.join(", ")}`
      );
    }

    // Validate slug (when the route carries one) before it is used in any S3
    // key or git repo path.
    if (route.slug !== undefined && !isValidSlug(route.slug)) {
      return errorResponse(400, "INVALID_SLUG", `Invalid slug: ${route.slug}`);
    }

    // Revision history / rollback sub-routes
    if (route.action === "revisions") {
      if (route.method !== "GET") {
        return errorResponse(405, "METHOD_NOT_ALLOWED", `Method ${route.method} not allowed`);
      }
      return await handleRevisions(route.type, route.slug!);
    }
    if (route.action === "restore") {
      if (route.method !== "POST") {
        return errorResponse(405, "METHOD_NOT_ALLOWED", `Method ${route.method} not allowed`);
      }
      return await handleRestore(route.type, route.slug!, event);
    }

    switch (route.method) {
      case "GET":
        return await handleGet(route.type, route.slug);
      case "PUT":
        return await handlePut(route.type, route.slug, event);
      case "DELETE":
        return await handleDelete(route.type, route.slug, event);
      default:
        return errorResponse(405, "METHOD_NOT_ALLOWED", `Method ${route.method} not allowed`);
    }
  } catch (err: unknown) {
    if (err instanceof CommitFailedError) {
      // A blocking commit failed, so the save was abandoned before touching S3. Report
      // it as the upstream failure it is rather than a generic 500.
      console.error("Commit failed, save aborted:", err.message);
      return errorResponse(err.statusCode, err.code, err.message, event.rawPath);
    }
    console.error("Unhandled error:", err);
    return errorResponse(500, "INTERNAL_ERROR", "An unexpected error occurred", event.rawPath);
  }
}

// --- GET Handler ---

async function handleGet(type: string, slug?: string): Promise<APIGatewayProxyStructuredResultV2> {
  if (slug) {
    // Get single item
    const item = await getContentItem(type, slug);
    if (!item) {
      return errorResponse(
        404,
        "CONTENT_NOT_FOUND",
        `Content item not found: ${type}/${slug}`,
        `content/${type}/${slug}`
      );
    }
    return jsonResponse(200, item);
  }

  // List all items
  const items = await listContentItems(type);
  return jsonResponse(200, items);
}

// --- PUT Handler ---

async function handlePut(
  type: string,
  slug: string | undefined,
  event: APIGatewayProxyEventV2
): Promise<APIGatewayProxyStructuredResultV2> {
  if (!event.body) {
    return errorResponse(400, "MISSING_BODY", "Request body is required");
  }

  let payload: {
    title?: string;
    date?: string;
    description?: string;
    author?: string;
    categories?: string[];
    tags?: string[];
    draft?: boolean;
    body?: string;
    /** Client's last-known S3 LastModified, for optimistic concurrency. */
    lastModified?: string;
    [key: string]: unknown;
  };
  try {
    payload = JSON.parse(
      event.isBase64Encoded ? Buffer.from(event.body, "base64").toString() : event.body
    );
  } catch {
    return errorResponse(400, "INVALID_JSON", "Request body must be valid JSON");
  }

  if (!payload.title) {
    return errorResponse(400, "VALIDATION_ERROR", "Title is required");
  }

  const isCreate = !slug;
  let targetSlug: string;

  if (isCreate) {
    // Generate slug from title
    targetSlug = slugify(payload.title);
    if (!targetSlug) {
      return errorResponse(
        400,
        "VALIDATION_ERROR",
        "Title must contain at least one alphanumeric character"
      );
    }

    // Check for slug conflict
    const exists = await slugExists(type, targetSlug);
    if (exists) {
      return errorResponse(
        409,
        "SLUG_CONFLICT",
        `A content item with slug "${targetSlug}" already exists`,
        `content/${type}/${targetSlug}`
      );
    }
  } else {
    targetSlug = slug;

    // Optimistic concurrency: if the client sent the lastModified it loaded,
    // reject the save when the stored item changed in the meantime, so two
    // open tabs/editors can't silently clobber each other.
    if (payload.lastModified) {
      const current = await getObjectLastModified(type, targetSlug);
      if (current && current !== payload.lastModified) {
        return errorResponse(
          409,
          "EDIT_CONFLICT",
          "This item was modified since you opened it. Reload to get the latest version before saving.",
          `content/${type}/${targetSlug}`
        );
      }
    }
  }

  // Build frontmatter metadata
  const meta: ContentMeta = {
    title: payload.title,
  };

  if (payload.date !== undefined) meta.date = payload.date;
  if (payload.description !== undefined) meta.description = payload.description;
  if (payload.author !== undefined) meta.author = payload.author;
  if (payload.categories !== undefined) meta.categories = payload.categories;
  if (payload.tags !== undefined) meta.tags = payload.tags;
  if (payload.draft === true) meta.draft = true;

  // Preserve any additional fields from the payload
  //
  // Note `modified` is listed here specifically so it is NOT copied through from
  // the request. It is server-managed and stamped below; accepting a client value
  // would let a caller backdate an edit.
  const knownFields = [
    "title",
    "date",
    "description",
    "author",
    "categories",
    "tags",
    "draft",
    "body",
    "lastModified",
    "modified",
  ];
  // Keys that must never be copied through, to avoid prototype pollution when
  // assigning onto the meta object.
  const dangerousKeys = ["__proto__", "constructor", "prototype"];
  for (const [key, value] of Object.entries(payload)) {
    if (!knownFields.includes(key) && !dangerousKeys.includes(key)) {
      meta[key] = value;
    }
  }

  const bodyContent = typeof payload.body === "string" ? payload.body : "";

  // Stamp the edit time. Server clock, not the client's, and applied to creates as
  // well as updates since creating an item is the first modification.
  //
  // Deliberately only here, in the editor save path. Two other things write content
  // and neither should move this date:
  //   - Taxonomy rename/merge (taxonomy Lambda, its own writer) rewrites hundreds of
  //     files mechanically. Bumping `modified` there would flood "Recently Modified"
  //     with every affected article and bury actual edits.
  //   - Revision restore writes the historical bytes back verbatim, on purpose, so
  //     the git diff is an exact revert. Re-serialising it to inject a timestamp
  //     would defeat that, so a restored item keeps the `modified` it had at that
  //     revision. The audit log records who restored what and when.
  meta.modified = new Date().toISOString();

  const key = `content/${type}/${targetSlug}/index.md`;
  const content = serializeContent(meta, bodyContent);

  // Commit to the Content_Repo first. Git is the source of truth now, so a save that
  // cannot be committed is not a save — requireCommitted throws, the handler returns
  // 502, and S3 is never touched, so no half-written state results. A skip (git
  // unconfigured) passes through, which keeps a not-yet-wired install and the tests
  // working.
  requireCommitted(
    await git.commitUpsert(
      git.s3KeyToRepoPath(key),
      content,
      "text",
      `content(${type}): ${isCreate ? "add" : "update"} ${targetSlug} [skip ci]`,
      isCreate
    )
  );

  // Then write the projection. A failure here, after the commit succeeded, means the
  // site serves the previous body until the next reconcile — visible staleness, never
  // loss, which is the deliberate asymmetry of criterion 4.5. It still surfaces as an
  // error so the user knows the published copy is behind.
  await putContent(type, targetSlug, content);

  await writeAudit({
    action: `content.${isCreate ? "create" : "update"}`,
    resource: `${type}/${targetSlug}`,
    user: getActor(event),
  });

  // Return the saved item
  const item = await getContentItem(type, targetSlug);
  return jsonResponse(isCreate ? 201 : 200, item);
}

// --- DELETE Handler ---

async function handleDelete(
  type: string,
  slug: string | undefined,
  event: APIGatewayProxyEventV2
): Promise<APIGatewayProxyStructuredResultV2> {
  if (!slug) {
    return errorResponse(400, "MISSING_SLUG", "Slug is required for deletion");
  }

  // Verify the item exists before deleting
  const exists = await slugExists(type, slug);
  if (!exists) {
    return errorResponse(
      404,
      "CONTENT_NOT_FOUND",
      `Content item not found: ${type}/${slug}`,
      `content/${type}/${slug}`
    );
  }

  // List the keys from S3, commit the deletion to git first, then remove from S3. If
  // the commit fails the objects are left in place and the handler returns 502, so the
  // item stays live and consistent rather than vanishing from the site while surviving
  // in git.
  const keys = await listContentKeys(type, slug);

  requireCommitted(
    await git.commitDelete(
      // Wrapped rather than passed by reference: an implementation is free to use
      // `this`, and an unbound method would break silently if one ever did.
      keys.map((key) => git.s3KeyToRepoPath(key)),
      `content(${type}): delete ${slug} [skip ci]`
    )
  );

  await deleteContentKeys(type, keys);

  await writeAudit({
    action: "content.delete",
    resource: `${type}/${slug}`,
    user: getActor(event),
  });

  return {
    statusCode: 204,
    headers: { "Content-Type": "application/json" },
    body: "",
  };
}

// --- GET /api/content/{type}/{slug}/revisions ---

async function handleRevisions(
  type: string,
  slug: string
): Promise<APIGatewayProxyStructuredResultV2> {
  const repoPath = git.s3KeyToRepoPath(`content/${type}/${slug}/index.md`);
  const commits = await git.listFileCommits(repoPath);
  return jsonResponse(200, commits);
}

// --- POST /api/content/{type}/{slug}/restore ---

async function handleRestore(
  type: string,
  slug: string,
  event: APIGatewayProxyEventV2
): Promise<APIGatewayProxyStructuredResultV2> {
  if (!event.body) {
    return errorResponse(400, "MISSING_BODY", "Request body is required");
  }

  let payload: { sha?: string };
  try {
    payload = JSON.parse(
      event.isBase64Encoded ? Buffer.from(event.body, "base64").toString() : event.body
    );
  } catch {
    return errorResponse(400, "INVALID_JSON", "Request body must be valid JSON");
  }

  const sha = payload.sha?.trim();
  if (!sha) {
    return errorResponse(400, "VALIDATION_ERROR", 'Field "sha" is required');
  }

  const repoPath = git.s3KeyToRepoPath(`content/${type}/${slug}/index.md`);
  const historical = await git.getFileAtRef(repoPath, sha);
  if (historical === null) {
    return errorResponse(
      404,
      "REVISION_NOT_FOUND",
      `Revision ${sha} not found for ${type}/${slug}`
    );
  }

  // Commit the restored bytes as a new commit (preserving history), then write them to
  // the projection — same order as a save, for the same reason. A failed commit leaves
  // the current body live and returns 502.
  const key = `content/${type}/${slug}/index.md`;

  requireCommitted(
    await git.commitUpsert(
      repoPath,
      historical,
      "text",
      `content(${type}): restore ${slug} to ${sha.slice(0, 8)} [skip ci]`,
      false
    )
  );

  await s3.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: historical,
      ContentType: "text/markdown",
    })
  );
  delete listCache[type];

  await writeAudit({
    action: "content.restore",
    resource: `${type}/${slug}`,
    user: getActor(event),
    detail: `restored to ${sha.slice(0, 8)}`,
  });

  const item = await getContentItem(type, slug);
  return jsonResponse(200, item);
}
