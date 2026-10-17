import {
  S3Client,
  ListObjectsV2Command,
  GetObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import * as yaml from "js-yaml";
import * as crypto from "crypto";
import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from "aws-lambda";
import {
  createGitProvider,
  requireCommitted,
  CommitFailedError,
  type FileChange,
} from "../shared/git";
import { writeAudit, getActor } from "../shared/audit";

const s3 = new S3Client({});
const BUCKET = process.env.CONTENT_BUCKET!;

// Resolved once per container. Selected by configuration, so this Lambda depends on the
// GitProvider interface rather than on GitLab.
const git = createGitProvider();

// --- Types ---

interface ContentMeta {
  title: string;
  date?: string | Date;
  description?: string;
  author?: string;
  categories?: string[];
  tags?: string[];
  draft?: boolean;
  [key: string]: unknown;
}

interface TaxonomyItem {
  name: string;
  type: "category" | "tag";
  count: number;
}

interface ApiError {
  code: string;
  message: string;
  path?: string;
  correlationId: string;
}

interface ContentFile {
  key: string;
  meta: ContentMeta;
  body: string;
}

// --- Utility Functions ---

export function parseFrontmatter(content: string): { meta: ContentMeta; body: string } {
  const match = content.match(/^---\n([\s\S]*?)\n---\n\n?([\s\S]*)$/);
  if (!match) {
    throw new Error("Invalid frontmatter format");
  }
  const meta = yaml.load(match[1]) as ContentMeta;
  const body = match[2];
  return { meta, body };
}

export function serializeContent(meta: ContentMeta, body: string): string {
  const frontmatter = yaml.dump(meta, { lineWidth: -1 });
  return `---\n${frontmatter}---\n\n${body}`;
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

async function getAllContentFiles(): Promise<ContentFile[]> {
  const contentTypes = ["posts", "knowledge-base"];
  const files: ContentFile[] = [];

  for (const type of contentTypes) {
    const prefix = `content/${type}/`;
    const indexKeys: string[] = [];
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
            indexKeys.push(obj.Key);
          }
        }
      }

      continuationToken = response.NextContinuationToken;
    } while (continuationToken);

    // Step 2: Fetch files in parallel batches of 50
    const BATCH_SIZE = 50;
    for (let i = 0; i < indexKeys.length; i += BATCH_SIZE) {
      const batch = indexKeys.slice(i, i + BATCH_SIZE);
      const results = await Promise.allSettled(
        batch.map(async (key) => {
          const getCommand = new GetObjectCommand({ Bucket: BUCKET, Key: key });
          const getResponse = await s3.send(getCommand);
          const content = await getResponse.Body!.transformToString();
          const { meta, body } = parseFrontmatter(content);
          return { key, meta, body } as ContentFile;
        })
      );

      for (const result of results) {
        if (result.status === "fulfilled") {
          files.push(result.value);
        }
      }
    }
  }

  return files;
}

// One changed file: the git change to commit, and the S3 key/body to write after.
interface PendingWrite {
  key: string;
  content: string;
  change: FileChange;
}

// Outcome of applying a taxonomy transform across all content files.
interface ApplyResult {
  // Files to commit, in one atomic git commit.
  changes: FileChange[];
  // The same files, with their S3 keys, to write to the projection after the commit.
  writes: PendingWrite[];
  updatedCount: number;
}

/**
 * Computes the result of a per-file metadata transform across every content file.
 *
 * Pure with respect to S3 and git: it serialises each changed file but writes nothing.
 * The caller commits all the changes as one atomic commit — git is the source of truth,
 * so the taxonomy edit is not real until that single commit lands — and only then
 * writes the projection. Previously this wrote each file to S3 as it went and collected
 * a `changes` list to mirror afterwards, which under blocking commits would be exactly
 * backwards: the projection would move before the commit that authorises it.
 *
 * Because the commit is all-or-nothing there is no longer a partial-S3-failure case to
 * report. A projection write that fails after the commit is handled by the caller as
 * recoverable staleness, the same asymmetry as a single save.
 */
function applyTaxonomyChange(
  files: ContentFile[],
  transform: (meta: ContentMeta) => { updated: boolean; meta: ContentMeta }
): ApplyResult {
  const changes: FileChange[] = [];
  const writes: PendingWrite[] = [];

  for (const file of files) {
    const result = transform(file.meta);
    if (!result.updated) continue;

    const content = serializeContent(result.meta, file.body);
    changes.push({ action: "update", filePath: git.s3KeyToRepoPath(file.key), content });
    writes.push({ key: file.key, content, change: changes[changes.length - 1] });
  }

  return { changes, writes, updatedCount: changes.length };
}

/**
 * Writes the projection for a committed taxonomy change.
 *
 * Runs after the commit has succeeded. A write that fails here leaves that file's
 * projection stale until the next reconcile — git already has the authoritative
 * version — so failures are collected and reported rather than thrown, and the caller
 * surfaces the count.
 */
async function writeProjection(writes: PendingWrite[]): Promise<{ failedKeys: string[] }> {
  const failedKeys: string[] = [];
  for (const write of writes) {
    try {
      await s3.send(
        new PutObjectCommand({
          Bucket: BUCKET,
          Key: write.key,
          Body: write.content,
          ContentType: "text/markdown",
        })
      );
    } catch (err: unknown) {
      console.error(`Failed to write projection for ${write.key}:`, err);
      failedKeys.push(write.key);
    }
  }
  return { failedKeys };
}

// --- Taxonomy Derivation ---

export function deriveTaxonomy(files: ContentFile[]): TaxonomyItem[] {
  const categoryCounts = new Map<string, number>();
  const tagCounts = new Map<string, number>();

  for (const file of files) {
    const categories = file.meta.categories || [];
    const tags = file.meta.tags || [];

    for (const cat of categories) {
      categoryCounts.set(cat, (categoryCounts.get(cat) || 0) + 1);
    }
    for (const tag of tags) {
      tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
    }
  }

  const items: TaxonomyItem[] = [];

  for (const [name, count] of categoryCounts.entries()) {
    items.push({ name, type: "category", count });
  }
  for (const [name, count] of tagCounts.entries()) {
    items.push({ name, type: "tag", count });
  }

  return items.sort((a, b) => a.name.localeCompare(b.name));
}

// --- Taxonomy Operations ---

export function renameInMeta(
  meta: ContentMeta,
  type: "category" | "tag",
  oldName: string,
  newName: string
): { updated: boolean; meta: ContentMeta } {
  const field = type === "category" ? "categories" : "tags";
  const values = meta[field] || [];
  const index = values.indexOf(oldName);

  if (index === -1) {
    return { updated: false, meta };
  }

  const newValues = [...values];
  newValues[index] = newName;

  return {
    updated: true,
    meta: { ...meta, [field]: newValues },
  };
}

export function mergeInMeta(
  meta: ContentMeta,
  type: "category" | "tag",
  source: string,
  target: string
): { updated: boolean; meta: ContentMeta } {
  const field = type === "category" ? "categories" : "tags";
  const values = meta[field] || [];
  const sourceIndex = values.indexOf(source);

  if (sourceIndex === -1) {
    return { updated: false, meta };
  }

  const newValues = [...values];
  // Remove the source
  newValues.splice(sourceIndex, 1);

  // Add target if not already present (deduplication)
  if (!newValues.includes(target)) {
    newValues.push(target);
  }

  return {
    updated: true,
    meta: { ...meta, [field]: newValues },
  };
}

export function deleteFromMeta(
  meta: ContentMeta,
  type: "category" | "tag",
  name: string
): { updated: boolean; meta: ContentMeta } {
  const field = type === "category" ? "categories" : "tags";
  const values = meta[field] || [];
  const index = values.indexOf(name);

  if (index === -1) {
    return { updated: false, meta };
  }

  const newValues = values.filter((v) => v !== name);

  return {
    updated: true,
    meta: { ...meta, [field]: newValues },
  };
}

// --- Route Parsing ---

interface RouteInfo {
  method: string;
  action: "list" | "rename" | "merge" | "delete" | "unknown";
  name?: string;
}

function parseRoute(event: APIGatewayProxyEventV2): RouteInfo {
  const method = event.requestContext.http.method;
  const path = event.rawPath;

  // GET /api/taxonomy — list all taxonomy items
  if (method === "GET" && path === "/api/taxonomy") {
    return { method, action: "list" };
  }

  // PUT /api/taxonomy/rename
  if (method === "PUT" && path === "/api/taxonomy/rename") {
    return { method, action: "rename" };
  }

  // PUT /api/taxonomy/merge
  if (method === "PUT" && path === "/api/taxonomy/merge") {
    return { method, action: "merge" };
  }

  // DELETE /api/taxonomy/{name}
  const deleteMatch = path.match(/^\/api\/taxonomy\/([^/]+)$/);
  if (method === "DELETE" && deleteMatch) {
    return { method, action: "delete", name: decodeURIComponent(deleteMatch[1]) };
  }

  return { method, action: "unknown" };
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

    switch (route.action) {
      case "list":
        return await handleList();
      case "rename":
        return await handleRename(event);
      case "merge":
        return await handleMerge(event);
      case "delete":
        return await handleDelete(route.name!, event);
      default:
        return errorResponse(400, "INVALID_PATH", "Unknown taxonomy endpoint");
    }
  } catch (err: unknown) {
    if (err instanceof CommitFailedError) {
      console.error("Commit failed, taxonomy change aborted:", err.message);
      return errorResponse(err.statusCode, err.code, err.message, event.rawPath);
    }
    console.error("Unhandled error:", err);
    return errorResponse(500, "INTERNAL_ERROR", "An unexpected error occurred", event.rawPath);
  }
}

// --- GET /api/taxonomy ---

async function handleList(): Promise<APIGatewayProxyStructuredResultV2> {
  const files = await getAllContentFiles();
  const taxonomy = deriveTaxonomy(files);
  return jsonResponse(200, taxonomy);
}

// --- PUT /api/taxonomy/rename ---

async function handleRename(
  event: APIGatewayProxyEventV2
): Promise<APIGatewayProxyStructuredResultV2> {
  if (!event.body) {
    return errorResponse(400, "MISSING_BODY", "Request body is required");
  }

  let payload: { type?: string; oldName?: string; newName?: string };
  try {
    payload = JSON.parse(
      event.isBase64Encoded ? Buffer.from(event.body, "base64").toString() : event.body
    );
  } catch {
    return errorResponse(400, "INVALID_JSON", "Request body must be valid JSON");
  }

  if (!payload.type || !["category", "tag"].includes(payload.type)) {
    return errorResponse(
      400,
      "VALIDATION_ERROR",
      'Field "type" is required and must be "category" or "tag"'
    );
  }
  if (!payload.oldName || !payload.oldName.trim()) {
    return errorResponse(400, "VALIDATION_ERROR", 'Field "oldName" is required');
  }
  if (!payload.newName || !payload.newName.trim()) {
    return errorResponse(400, "VALIDATION_ERROR", 'Field "newName" is required');
  }

  const type = payload.type as "category" | "tag";
  const oldName = payload.oldName.trim();
  const newName = payload.newName.trim();

  if (oldName === newName) {
    return errorResponse(400, "VALIDATION_ERROR", "Old name and new name must be different");
  }

  const files = await getAllContentFiles();
  const { changes, writes, updatedCount } = applyTaxonomyChange(files, (meta) =>
    renameInMeta(meta, type, oldName, newName)
  );

  // One atomic commit for the whole rename. Blocking: if it fails nothing is written to
  // the projection, so a rename that did not reach git does not half-apply to the site.
  requireCommitted(
    await git.commitFiles(
      changes,
      `content(taxonomy): rename ${type} "${oldName}" to "${newName}" [skip ci]`
    )
  );

  const { failedKeys } = await writeProjection(writes);

  await writeAudit({
    action: "taxonomy.rename",
    resource: `${type}:${oldName}`,
    user: getActor(event),
    detail: `renamed to "${newName}" (${updatedCount} items${
      failedKeys.length ? `, ${failedKeys.length} projection writes behind` : ""
    })`,
  });

  // Return updated taxonomy
  const updatedFiles = await getAllContentFiles();
  const taxonomy = deriveTaxonomy(updatedFiles);
  return jsonResponse(failedKeys.length ? 207 : 200, {
    updated: updatedCount,
    failed: failedKeys.length,
    taxonomy,
  });
}

// --- PUT /api/taxonomy/merge ---

async function handleMerge(
  event: APIGatewayProxyEventV2
): Promise<APIGatewayProxyStructuredResultV2> {
  if (!event.body) {
    return errorResponse(400, "MISSING_BODY", "Request body is required");
  }

  let payload: { type?: string; source?: string; target?: string };
  try {
    payload = JSON.parse(
      event.isBase64Encoded ? Buffer.from(event.body, "base64").toString() : event.body
    );
  } catch {
    return errorResponse(400, "INVALID_JSON", "Request body must be valid JSON");
  }

  if (!payload.type || !["category", "tag"].includes(payload.type)) {
    return errorResponse(
      400,
      "VALIDATION_ERROR",
      'Field "type" is required and must be "category" or "tag"'
    );
  }
  if (!payload.source || !payload.source.trim()) {
    return errorResponse(400, "VALIDATION_ERROR", 'Field "source" is required');
  }
  if (!payload.target || !payload.target.trim()) {
    return errorResponse(400, "VALIDATION_ERROR", 'Field "target" is required');
  }

  const type = payload.type as "category" | "tag";
  const source = payload.source.trim();
  const target = payload.target.trim();

  if (source === target) {
    return errorResponse(400, "VALIDATION_ERROR", "Source and target must be different");
  }

  const files = await getAllContentFiles();
  const { changes, writes, updatedCount } = applyTaxonomyChange(files, (meta) =>
    mergeInMeta(meta, type, source, target)
  );

  requireCommitted(
    await git.commitFiles(
      changes,
      `content(taxonomy): merge ${type} "${source}" into "${target}" [skip ci]`
    )
  );

  const { failedKeys } = await writeProjection(writes);

  await writeAudit({
    action: "taxonomy.merge",
    resource: `${type}:${source}`,
    user: getActor(event),
    detail: `merged into "${target}" (${updatedCount} items${
      failedKeys.length ? `, ${failedKeys.length} projection writes behind` : ""
    })`,
  });

  // Return updated taxonomy
  const updatedFiles = await getAllContentFiles();
  const taxonomy = deriveTaxonomy(updatedFiles);
  return jsonResponse(failedKeys.length ? 207 : 200, {
    updated: updatedCount,
    failed: failedKeys.length,
    taxonomy,
  });
}

// --- DELETE /api/taxonomy/{name} ---

async function handleDelete(
  name: string,
  event: APIGatewayProxyEventV2
): Promise<APIGatewayProxyStructuredResultV2> {
  const typeParam = event.queryStringParameters?.type;

  if (!typeParam || !["category", "tag"].includes(typeParam)) {
    return errorResponse(
      400,
      "VALIDATION_ERROR",
      'Query parameter "type" is required and must be "category" or "tag"'
    );
  }

  const type = typeParam as "category" | "tag";
  const files = await getAllContentFiles();
  const { changes, writes, updatedCount } = applyTaxonomyChange(files, (meta) =>
    deleteFromMeta(meta, type, name)
  );

  requireCommitted(
    await git.commitFiles(changes, `content(taxonomy): delete ${type} "${name}" [skip ci]`)
  );

  const { failedKeys } = await writeProjection(writes);

  await writeAudit({
    action: "taxonomy.delete",
    resource: `${type}:${name}`,
    user: getActor(event),
    detail: `${updatedCount} items updated${
      failedKeys.length ? `, ${failedKeys.length} projection writes behind` : ""
    }`,
  });

  // Return updated taxonomy
  const updatedFiles = await getAllContentFiles();
  const taxonomy = deriveTaxonomy(updatedFiles);
  return jsonResponse(failedKeys.length ? 207 : 200, {
    updated: updatedCount,
    failed: failedKeys.length,
    taxonomy,
  });
}
