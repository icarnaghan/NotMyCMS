import {
  S3Client,
  PutObjectCommand,
  ListObjectsV2Command,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import Busboy from "busboy";
import * as crypto from "crypto";
import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from "aws-lambda";
import { createGitProvider, requireCommitted, CommitFailedError } from "../shared/git";
import { writeAudit, getActor } from "../shared/audit";

const s3 = new S3Client({});
const BUCKET = process.env.CONTENT_BUCKET!;

// Resolved once per container. Selected by configuration, so this Lambda depends on the
// GitProvider interface rather than on GitLab.
const git = createGitProvider();

// --- Constants ---

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

// Maps each accepted extension to its canonical, server-controlled MIME type.
// SVG is intentionally excluded: it is an active-content format that would
// execute embedded <script> when served same-origin (stored XSS). The stored
// Content-Type is always derived from this map, never from the client-supplied
// MIME, so a mismatched upload (e.g. x.png sent as image/svg+xml) cannot cause
// the object to be served as an executable type.
const EXTENSION_MIME_TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
};

const ALLOWED_EXTENSIONS = new Set(Object.keys(EXTENSION_MIME_TYPES));

const ALLOWED_MIME_TYPES = new Set(Object.values(EXTENSION_MIME_TYPES));

// --- Types ---

interface ApiError {
  code: string;
  message: string;
  path?: string;
  correlationId: string;
}

interface ParsedFile {
  filename: string;
  contentType: string;
  data: Buffer;
}

// --- Utility Functions ---

export function getFileExtension(filename: string): string {
  const parts = filename.toLowerCase().split(".");
  return parts.length > 1 ? parts[parts.length - 1] : "";
}

export function isAllowedExtension(extension: string): boolean {
  return ALLOWED_EXTENSIONS.has(extension.toLowerCase());
}

export function isAllowedMimeType(mimeType: string): boolean {
  return ALLOWED_MIME_TYPES.has(mimeType.toLowerCase());
}

/** The canonical MIME type for an accepted extension, or undefined if unsupported. */
export function canonicalMimeType(extension: string): string | undefined {
  return EXTENSION_MIME_TYPES[extension.toLowerCase()];
}

/** True if the client-supplied MIME type is consistent with the file's extension. */
export function isMimeConsistentWithExtension(extension: string, mimeType: string): boolean {
  return canonicalMimeType(extension) === mimeType.toLowerCase();
}

export function isWithinSizeLimit(size: number): boolean {
  return size > 0 && size <= MAX_FILE_SIZE;
}

// A slug must match the shape slugify() produces: lowercase alphanumerics and
// single hyphens, no leading/trailing hyphen. This rejects "..", path
// separators, and other surprises before the value is used in any S3 key or
// git repo path (defense-in-depth against traversal-like keys).
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function isValidSlug(slug: string): boolean {
  return SLUG_PATTERN.test(slug);
}

export function sanitizeFilename(filename: string): string {
  // Remove path separators and sanitize
  return filename
    .replace(/[/\\]/g, "")
    .replace(/\.\./g, "")
    .replace(/[^a-zA-Z0-9._-]/g, "_");
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

// --- Multipart Parser ---

function parseMultipartBody(event: APIGatewayProxyEventV2): Promise<ParsedFile> {
  return new Promise((resolve, reject) => {
    const contentType = event.headers["content-type"] || event.headers["Content-Type"] || "";

    if (!contentType.includes("multipart/form-data")) {
      reject(new Error("Content-Type must be multipart/form-data"));
      return;
    }

    // Decode body if base64 encoded (API Gateway passes binary as base64)
    const bodyBuffer = event.isBase64Encoded
      ? Buffer.from(event.body || "", "base64")
      : Buffer.from(event.body || "", "utf-8");

    const busboy = Busboy({
      headers: { "content-type": contentType },
      limits: { fileSize: MAX_FILE_SIZE + 1, files: 1 },
    });

    let fileFound = false;
    let fileTruncated = false;

    busboy.on(
      "file",
      (
        _fieldname: string,
        file: NodeJS.ReadableStream & { truncated?: boolean },
        info: { filename: string; encoding: string; mimeType: string }
      ) => {
        fileFound = true;
        const chunks: Buffer[] = [];

        file.on("data", (chunk: Buffer) => {
          chunks.push(chunk);
        });

        file.on("limit", () => {
          fileTruncated = true;
        });

        file.on("end", () => {
          if (fileTruncated) {
            reject(new Error("FILE_TOO_LARGE"));
            return;
          }

          const data = Buffer.concat(chunks);
          resolve({
            filename: info.filename || "upload",
            contentType: info.mimeType,
            data,
          });
        });

        file.on("error", (err: Error) => {
          reject(err);
        });
      }
    );

    busboy.on("finish", () => {
      if (!fileFound) {
        reject(new Error("NO_FILE"));
      }
    });

    busboy.on("error", (err: Error) => {
      reject(err);
    });

    busboy.end(bodyBuffer);
  });
}

// --- Route Parsing ---

interface RouteParams {
  type: string;
  slug: string;
  filename?: string;
}

function parseRoute(event: APIGatewayProxyEventV2): RouteParams | null {
  const path = event.rawPath;

  // Match /api/media/{type}/{slug}/{filename}
  const fileMatch = path.match(/^\/api\/media\/([^/]+)\/([^/]+)\/([^/]+)$/);
  if (fileMatch) {
    return { type: fileMatch[1], slug: fileMatch[2], filename: decodeURIComponent(fileMatch[3]) };
  }

  // Match /api/media/{type}/{slug}
  const match = path.match(/^\/api\/media\/([^/]+)\/([^/]+)$/);
  if (match) {
    return { type: match[1], slug: match[2] };
  }

  return null;
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
    const method = event.requestContext.http.method;

    const route = parseRoute(event);
    if (!route) {
      return errorResponse(
        400,
        "INVALID_PATH",
        "Expected /api/media/{type}/{slug} or /api/media/{type}/{slug}/{filename}"
      );
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

    // Validate slug before it is used in any S3 key or git repo path.
    if (!isValidSlug(route.slug)) {
      return errorResponse(
        400,
        "INVALID_SLUG",
        `Invalid slug: ${route.slug}`,
        `/api/media/${route.type}/${route.slug}`
      );
    }

    // List existing images
    if (method === "GET" && !route.filename) {
      return await handleList(route.type, route.slug);
    }
    // Delete an image
    if (method === "DELETE" && route.filename) {
      return await handleDelete(event, route.type, route.slug, route.filename);
    }
    // Only POST (upload) remains valid beyond this point
    if (method !== "POST" || route.filename) {
      return errorResponse(405, "METHOD_NOT_ALLOWED", `Method ${method} not allowed`);
    }

    // POST — upload a new image. Parse multipart body
    let file: ParsedFile;
    try {
      file = await parseMultipartBody(event);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown parse error";

      if (message === "FILE_TOO_LARGE") {
        return errorResponse(
          413,
          "FILE_TOO_LARGE",
          `File exceeds maximum size of 10MB`,
          `/api/media/${route.type}/${route.slug}`
        );
      }

      if (message === "NO_FILE") {
        return errorResponse(
          400,
          "NO_FILE",
          "No file found in request body",
          `/api/media/${route.type}/${route.slug}`
        );
      }

      return errorResponse(
        400,
        "PARSE_ERROR",
        `Failed to parse multipart body: ${message}`,
        `/api/media/${route.type}/${route.slug}`
      );
    }

    // Validate file extension
    const extension = getFileExtension(file.filename);
    if (!extension || !isAllowedExtension(extension)) {
      return errorResponse(
        400,
        "INVALID_FILE_TYPE",
        `File type "${extension || "unknown"}" is not supported. Accepted formats: PNG, JPG, JPEG, GIF, WebP`,
        `/api/media/${route.type}/${route.slug}`
      );
    }

    // Validate MIME type and require it to match the extension. Cross-checking
    // both (rather than validating them independently) prevents an upload from
    // being stored/served under a type inconsistent with its extension.
    if (!isAllowedMimeType(file.contentType)) {
      return errorResponse(
        400,
        "INVALID_MIME_TYPE",
        `MIME type "${file.contentType}" is not a supported image type. Accepted types: image/png, image/jpeg, image/gif, image/webp`,
        `/api/media/${route.type}/${route.slug}`
      );
    }
    if (!isMimeConsistentWithExtension(extension, file.contentType)) {
      return errorResponse(
        400,
        "MIME_EXTENSION_MISMATCH",
        `MIME type "${file.contentType}" does not match file extension ".${extension}".`,
        `/api/media/${route.type}/${route.slug}`
      );
    }

    // Validate file size
    if (!isWithinSizeLimit(file.data.length)) {
      return errorResponse(
        413,
        "FILE_TOO_LARGE",
        `File exceeds maximum size of 10MB`,
        `/api/media/${route.type}/${route.slug}`
      );
    }

    // Sanitize filename
    const safeFilename = sanitizeFilename(file.filename);

    const s3Key = `content/${route.type}/${route.slug}/images/${safeFilename}`;

    // Commit the image to the Content_Repo first, then write the projection. Git is
    // the source of truth, so an image that cannot be committed is not stored —
    // requireCommitted throws, the handler returns 502, and S3 is never touched. A
    // skip (git unconfigured) passes through.
    requireCommitted(
      await git.commitUpsert(
        git.s3KeyToRepoPath(s3Key),
        file.data.toString("base64"),
        "base64",
        `content(${route.type}): add image ${safeFilename} to ${route.slug} [skip ci]`,
        true
      )
    );

    await s3.send(
      new PutObjectCommand({
        Bucket: BUCKET,
        Key: s3Key,
        Body: file.data,
        // Serve under the server-controlled type for the validated extension,
        // never the client-supplied MIME.
        ContentType: canonicalMimeType(extension),
      })
    );

    await writeAudit({
      action: "media.upload",
      resource: `${route.type}/${route.slug}/images/${safeFilename}`,
      user: getActor(event),
    });

    // Return relative path for markdown insertion
    return jsonResponse(200, {
      path: `images/${safeFilename}`,
    });
  } catch (err: unknown) {
    if (err instanceof CommitFailedError) {
      console.error("Commit failed, upload aborted:", err.message);
      return errorResponse(err.statusCode, err.code, err.message, event.rawPath);
    }
    console.error("Unhandled error:", err);
    return errorResponse(500, "INTERNAL_ERROR", "An unexpected error occurred", event.rawPath);
  }
}

// --- GET /api/media/{type}/{slug} — list images ---

interface MediaItem {
  filename: string;
  path: string;
  size: number;
  lastModified: string;
}

async function handleList(type: string, slug: string): Promise<APIGatewayProxyStructuredResultV2> {
  const prefix = `content/${type}/${slug}/images/`;
  const images: MediaItem[] = [];
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
      if (obj.Key && obj.Key !== prefix) {
        const filename = obj.Key.split("/").pop();
        if (filename) {
          images.push({
            filename,
            path: `images/${filename}`,
            size: obj.Size ?? 0,
            lastModified: obj.LastModified?.toISOString() ?? "",
          });
        }
      }
    }
    continuationToken = response.NextContinuationToken;
  } while (continuationToken);

  images.sort((a, b) => a.filename.localeCompare(b.filename));
  return jsonResponse(200, images);
}

// --- DELETE /api/media/{type}/{slug}/{filename} — delete an image ---

async function handleDelete(
  event: APIGatewayProxyEventV2,
  type: string,
  slug: string,
  filename: string
): Promise<APIGatewayProxyStructuredResultV2> {
  const safeFilename = sanitizeFilename(filename);
  const s3Key = `content/${type}/${slug}/images/${safeFilename}`;

  // Commit the removal first, then delete from S3. A failed commit leaves the image
  // live and returns 502, rather than removing it from the site while git keeps it.
  requireCommitted(
    await git.commitDelete(
      [git.s3KeyToRepoPath(s3Key)],
      `content(${type}): delete image ${safeFilename} from ${slug} [skip ci]`
    )
  );

  await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: s3Key }));

  await writeAudit({
    action: "media.delete",
    resource: `${type}/${slug}/images/${safeFilename}`,
    user: getActor(event),
  });

  return {
    statusCode: 204,
    headers: { "Content-Type": "application/json" },
    body: "",
  };
}
