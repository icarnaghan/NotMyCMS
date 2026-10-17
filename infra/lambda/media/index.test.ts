import { describe, it, expect, vi, beforeEach } from "vitest";
import type { APIGatewayProxyEventV2 } from "aws-lambda";
import {
  getFileExtension,
  isAllowedExtension,
  isAllowedMimeType,
  isMimeConsistentWithExtension,
  canonicalMimeType,
  isWithinSizeLimit,
  sanitizeFilename,
  handler,
} from "./index";

// Mock AWS SDK
const { mockSend } = vi.hoisted(() => {
  const mockSend = vi.fn().mockResolvedValue({});
  return { mockSend };
});

vi.mock("@aws-sdk/client-s3", () => {
  return {
    S3Client: class MockS3Client {
      send = mockSend;
    },
    PutObjectCommand: class MockPutObjectCommand {
      constructor(public params: unknown) {}
    },
    ListObjectsV2Command: class MockListObjectsV2Command {
      constructor(public params: unknown) {}
    },
    DeleteObjectCommand: class MockDeleteObjectCommand {
      constructor(public params: unknown) {}
    },
  };
});

// Set environment
process.env.CONTENT_BUCKET = "test-bucket";

// --- Unit Tests for Utility Functions ---

describe("getFileExtension", () => {
  it("returns extension for normal filename", () => {
    expect(getFileExtension("photo.png")).toBe("png");
  });

  it("returns extension for filename with multiple dots", () => {
    expect(getFileExtension("my.photo.jpeg")).toBe("jpeg");
  });

  it("returns lowercase extension", () => {
    expect(getFileExtension("Image.PNG")).toBe("png");
  });

  it("returns empty string for no extension", () => {
    expect(getFileExtension("noextension")).toBe("");
  });

  it("handles dot file", () => {
    expect(getFileExtension(".gitignore")).toBe("gitignore");
  });
});

describe("isAllowedExtension", () => {
  it("allows png", () => {
    expect(isAllowedExtension("png")).toBe(true);
  });

  it("allows jpg", () => {
    expect(isAllowedExtension("jpg")).toBe(true);
  });

  it("allows jpeg", () => {
    expect(isAllowedExtension("jpeg")).toBe(true);
  });

  it("allows gif", () => {
    expect(isAllowedExtension("gif")).toBe(true);
  });

  it("allows webp", () => {
    expect(isAllowedExtension("webp")).toBe(true);
  });

  it("rejects svg (active-content XSS risk)", () => {
    expect(isAllowedExtension("svg")).toBe(false);
  });

  it("rejects pdf", () => {
    expect(isAllowedExtension("pdf")).toBe(false);
  });

  it("rejects exe", () => {
    expect(isAllowedExtension("exe")).toBe(false);
  });

  it("rejects empty string", () => {
    expect(isAllowedExtension("")).toBe(false);
  });

  it("is case-insensitive", () => {
    expect(isAllowedExtension("PNG")).toBe(true);
    expect(isAllowedExtension("Jpg")).toBe(true);
  });
});

describe("isAllowedMimeType", () => {
  it("allows image/png", () => {
    expect(isAllowedMimeType("image/png")).toBe(true);
  });

  it("allows image/jpeg", () => {
    expect(isAllowedMimeType("image/jpeg")).toBe(true);
  });

  it("allows image/gif", () => {
    expect(isAllowedMimeType("image/gif")).toBe(true);
  });

  it("allows image/webp", () => {
    expect(isAllowedMimeType("image/webp")).toBe(true);
  });

  it("rejects image/svg+xml (active-content XSS risk)", () => {
    expect(isAllowedMimeType("image/svg+xml")).toBe(false);
  });

  it("rejects application/pdf", () => {
    expect(isAllowedMimeType("application/pdf")).toBe(false);
  });

  it("rejects text/plain", () => {
    expect(isAllowedMimeType("text/plain")).toBe(false);
  });

  it("is case-insensitive", () => {
    expect(isAllowedMimeType("Image/PNG")).toBe(true);
  });
});

describe("isMimeConsistentWithExtension", () => {
  it("accepts a matching extension and MIME", () => {
    expect(isMimeConsistentWithExtension("png", "image/png")).toBe(true);
    expect(isMimeConsistentWithExtension("jpg", "image/jpeg")).toBe(true);
    expect(isMimeConsistentWithExtension("jpeg", "image/jpeg")).toBe(true);
  });

  it("rejects a mismatched extension and MIME", () => {
    expect(isMimeConsistentWithExtension("png", "image/svg+xml")).toBe(false);
    expect(isMimeConsistentWithExtension("png", "image/jpeg")).toBe(false);
  });

  it("rejects an unsupported extension", () => {
    expect(isMimeConsistentWithExtension("svg", "image/svg+xml")).toBe(false);
  });

  it("is case-insensitive", () => {
    expect(isMimeConsistentWithExtension("PNG", "Image/PNG")).toBe(true);
  });
});

describe("canonicalMimeType", () => {
  it("returns the canonical MIME for supported extensions", () => {
    expect(canonicalMimeType("png")).toBe("image/png");
    expect(canonicalMimeType("jpg")).toBe("image/jpeg");
  });

  it("returns undefined for unsupported extensions", () => {
    expect(canonicalMimeType("svg")).toBeUndefined();
    expect(canonicalMimeType("exe")).toBeUndefined();
  });
});

describe("isWithinSizeLimit", () => {
  it("accepts 1 byte file", () => {
    expect(isWithinSizeLimit(1)).toBe(true);
  });

  it("accepts exactly 10MB", () => {
    expect(isWithinSizeLimit(10 * 1024 * 1024)).toBe(true);
  });

  it("rejects 0 bytes", () => {
    expect(isWithinSizeLimit(0)).toBe(false);
  });

  it("rejects over 10MB", () => {
    expect(isWithinSizeLimit(10 * 1024 * 1024 + 1)).toBe(false);
  });
});

describe("sanitizeFilename", () => {
  it("keeps valid filenames unchanged", () => {
    expect(sanitizeFilename("photo.png")).toBe("photo.png");
  });

  it("removes path separators", () => {
    expect(sanitizeFilename("../../etc/passwd.png")).toBe("etcpasswd.png");
  });

  it("replaces spaces with underscore", () => {
    expect(sanitizeFilename("my photo.png")).toBe("my_photo.png");
  });

  it("handles special characters", () => {
    expect(sanitizeFilename("image (1).jpg")).toBe("image__1_.jpg");
  });

  it("keeps hyphens and underscores", () => {
    expect(sanitizeFilename("my-image_2024.webp")).toBe("my-image_2024.webp");
  });
});

// --- Integration Tests for Handler ---

describe("handler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function createEvent(overrides: Partial<APIGatewayProxyEventV2> = {}): APIGatewayProxyEventV2 {
    return {
      version: "2.0",
      routeKey: "POST /api/media/{type}/{slug}",
      rawPath: "/api/media/posts/my-post",
      rawQueryString: "",
      headers: {
        "content-type": "multipart/form-data; boundary=----FormBoundary123",
      },
      requestContext: {
        accountId: "123456789",
        apiId: "api123",
        domainName: "api.example.com",
        domainPrefix: "api",
        http: {
          method: "POST",
          path: "/api/media/posts/my-post",
          protocol: "HTTP/1.1",
          sourceIp: "127.0.0.1",
          userAgent: "test",
        },
        requestId: "req123",
        routeKey: "POST /api/media/{type}/{slug}",
        stage: "$default",
        time: "01/Jan/2024:00:00:00 +0000",
        timeEpoch: 1704067200000,
      },
      body: "",
      isBase64Encoded: false,
      ...overrides,
    } as APIGatewayProxyEventV2;
  }

  function createMultipartBody(
    filename: string,
    mimeType: string,
    content: Buffer,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _boundary: string = "----FormBoundary123"
  ): string {
    const parts: string[] = [];
    parts.push(`------FormBoundary123`);
    parts.push(`Content-Disposition: form-data; name="file"; filename="${filename}"`);
    parts.push(`Content-Type: ${mimeType}`);
    parts.push("");
    // For binary content, we need to use base64 encoding
    const bodyStr =
      parts.join("\r\n") + "\r\n" + content.toString("binary") + "\r\n------FormBoundary123--\r\n";
    return bodyStr;
  }

  it("rejects unsupported methods (PUT)", async () => {
    const event = createEvent({
      requestContext: {
        ...createEvent().requestContext,
        http: { ...createEvent().requestContext.http, method: "PUT" },
      },
    });

    const result = await handler(event);
    expect(result.statusCode).toBe(405);
    const body = JSON.parse(result.body as string);
    expect(body.code).toBe("METHOD_NOT_ALLOWED");
  });

  it("lists images on GET", async () => {
    mockSend.mockResolvedValueOnce({
      Contents: [
        {
          Key: "content/posts/my-post/images/photo.png",
          Size: 1024,
          LastModified: new Date("2024-01-01T00:00:00Z"),
        },
      ],
    });

    const event = createEvent({
      requestContext: {
        ...createEvent().requestContext,
        http: { ...createEvent().requestContext.http, method: "GET" },
      },
    });

    const result = await handler(event);
    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body as string) as Array<{ filename: string; path: string }>;
    expect(body).toHaveLength(1);
    expect(body[0].filename).toBe("photo.png");
    expect(body[0].path).toBe("images/photo.png");
  });

  it("deletes an image on DELETE", async () => {
    const event = createEvent({
      rawPath: "/api/media/posts/my-post/photo.png",
      requestContext: {
        ...createEvent().requestContext,
        http: {
          ...createEvent().requestContext.http,
          method: "DELETE",
          path: "/api/media/posts/my-post/photo.png",
        },
      },
    });

    const result = await handler(event);
    expect(result.statusCode).toBe(204);
  });

  it("rejects invalid content type path", async () => {
    const event = createEvent({
      rawPath: "/api/media/invalid-type/my-post",
    });

    const result = await handler(event);
    expect(result.statusCode).toBe(400);
    const body = JSON.parse(result.body as string);
    expect(body.code).toBe("INVALID_TYPE");
  });

  it("rejects invalid path format", async () => {
    const event = createEvent({
      rawPath: "/api/media/posts",
    });

    const result = await handler(event);
    expect(result.statusCode).toBe(400);
    const body = JSON.parse(result.body as string);
    expect(body.code).toBe("INVALID_PATH");
  });

  it("rejects request with no file in body", async () => {
    const event = createEvent({
      headers: {
        "content-type": "multipart/form-data; boundary=----FormBoundary123",
      },
      body: "------FormBoundary123--\r\n",
      isBase64Encoded: false,
    });

    const result = await handler(event);
    expect(result.statusCode).toBe(400);
    const body = JSON.parse(result.body as string);
    expect(body.code).toBe("NO_FILE");
  });

  it("rejects non-multipart content type", async () => {
    const event = createEvent({
      headers: {
        "content-type": "application/json",
      },
      body: "{}",
    });

    const result = await handler(event);
    expect(result.statusCode).toBe(400);
    const body = JSON.parse(result.body as string);
    expect(body.code).toBe("PARSE_ERROR");
  });

  it("successfully uploads a valid image", async () => {
    const imageContent = Buffer.from("fake-png-data");
    const boundary = "----FormBoundary123";
    const body = createMultipartBody("test-image.png", "image/png", imageContent, boundary);

    const event = createEvent({
      headers: {
        "content-type": `multipart/form-data; boundary=${boundary}`,
      },
      body: Buffer.from(body, "binary").toString("base64"),
      isBase64Encoded: true,
    });

    mockSend.mockResolvedValue({});

    const result = await handler(event);
    expect(result.statusCode).toBe(200);
    const responseBody = JSON.parse(result.body as string);
    expect(responseBody.path).toBe("images/test-image.png");
  });

  it("rejects unsupported file extension", async () => {
    const content = Buffer.from("fake-pdf-data");
    const boundary = "----FormBoundary123";
    const body = createMultipartBody("document.pdf", "image/png", content, boundary);

    const event = createEvent({
      headers: {
        "content-type": `multipart/form-data; boundary=${boundary}`,
      },
      body: Buffer.from(body, "binary").toString("base64"),
      isBase64Encoded: true,
    });

    const result = await handler(event);
    expect(result.statusCode).toBe(400);
    const responseBody = JSON.parse(result.body as string);
    expect(responseBody.code).toBe("INVALID_FILE_TYPE");
  });

  it("rejects unsupported MIME type", async () => {
    const content = Buffer.from("fake-data");
    const boundary = "----FormBoundary123";
    const body = createMultipartBody("image.png", "application/pdf", content, boundary);

    const event = createEvent({
      headers: {
        "content-type": `multipart/form-data; boundary=${boundary}`,
      },
      body: Buffer.from(body, "binary").toString("base64"),
      isBase64Encoded: true,
    });

    const result = await handler(event);
    expect(result.statusCode).toBe(400);
    const responseBody = JSON.parse(result.body as string);
    expect(responseBody.code).toBe("INVALID_MIME_TYPE");
  });

  it("includes correlationId in error responses", async () => {
    const event = createEvent({
      rawPath: "/api/media/posts",
    });

    const result = await handler(event);
    const body = JSON.parse(result.body as string);
    expect(body.correlationId).toBeDefined();
    expect(typeof body.correlationId).toBe("string");
    expect(body.correlationId.length).toBeGreaterThan(0);
  });

  it("sanitizes filenames before uploading", async () => {
    const imageContent = Buffer.from("fake-png-data");
    const boundary = "----FormBoundary123";
    const body = createMultipartBody("my photo (1).png", "image/png", imageContent, boundary);

    const event = createEvent({
      headers: {
        "content-type": `multipart/form-data; boundary=${boundary}`,
      },
      body: Buffer.from(body, "binary").toString("base64"),
      isBase64Encoded: true,
    });

    mockSend.mockResolvedValue({});

    const result = await handler(event);
    expect(result.statusCode).toBe(200);
    const responseBody = JSON.parse(result.body as string);
    expect(responseBody.path).toBe("images/my_photo__1_.png");
  });

  it("accepts knowledge-base type", async () => {
    const imageContent = Buffer.from("fake-png-data");
    const boundary = "----FormBoundary123";
    const body = createMultipartBody("test.jpg", "image/jpeg", imageContent, boundary);

    const event = createEvent({
      rawPath: "/api/media/knowledge-base/my-article",
      headers: {
        "content-type": `multipart/form-data; boundary=${boundary}`,
      },
      body: Buffer.from(body, "binary").toString("base64"),
      isBase64Encoded: true,
    });

    mockSend.mockResolvedValue({});

    const result = await handler(event);
    expect(result.statusCode).toBe(200);
    const responseBody = JSON.parse(result.body as string);
    expect(responseBody.path).toBe("images/test.jpg");
  });
});

/**
 * Blocking commits for media (content-storage stage 4).
 *
 * The tests above use the hoisted static S3 mock and the real git provider, which skips
 * because the token is unset — so none of them reaches a commit outcome. This block
 * drives the git provider directly to prove an image is not stored when its commit
 * fails, and that an image delete does not touch S3 when its commit fails. It uses its
 * own module graph (resetModules + doMock + dynamic import) so it does not disturb the
 * static mock the rest of the file relies on.
 */
describe("blocking commits", () => {
  const BOUNDARY = "----FormBoundary123";

  function multipartUpload(filename: string, mimeType: string): string {
    const data = Buffer.from([0x89, 0x50, 0x4e, 0x47]); // PNG signature bytes
    const head =
      `------FormBoundary123\r\n` +
      `Content-Disposition: form-data; name="file"; filename="${filename}"\r\n` +
      `Content-Type: ${mimeType}\r\n\r\n`;
    const tail = `\r\n------FormBoundary123--\r\n`;
    return Buffer.concat([Buffer.from(head, "binary"), data, Buffer.from(tail, "binary")]).toString(
      "base64"
    );
  }

  async function loadWithGit(commitResult: unknown) {
    vi.resetModules();
    const s3Send = vi.fn().mockResolvedValue({});
    vi.doMock("@aws-sdk/client-s3", () => ({
      S3Client: class {
        send = s3Send;
      },
      PutObjectCommand: class {
        constructor(public input: unknown) {}
      },
      ListObjectsV2Command: class {
        constructor(public input: unknown) {}
      },
      DeleteObjectCommand: class {
        constructor(public input: unknown) {}
      },
    }));

    const actual = await vi.importActual<typeof import("../shared/git")>("../shared/git");
    vi.doMock("../shared/git", () => ({
      ...actual,
      createGitProvider: () => ({
        s3KeyToRepoPath: (k: string) => k,
        commitUpsert: async () => commitResult,
        commitDelete: async () => commitResult,
        commitFiles: async () => commitResult,
        listFileCommits: async () => [],
        getFileAtRef: async () => null,
      }),
    }));

    const mod = await import("./index");
    return { handler: mod.handler, s3Send };
  }

  const uploadEvent = {
    rawPath: "/api/media/posts/my-post",
    requestContext: { http: { method: "POST" } },
    headers: { "content-type": `multipart/form-data; boundary=${BOUNDARY}` },
    body: multipartUpload("photo.png", "image/png"),
    isBase64Encoded: true,
  } as unknown as APIGatewayProxyEventV2;

  it("returns 502 and does not store the image when the commit fails", async () => {
    const { handler, s3Send } = await loadWithGit({
      committed: false,
      error: "403: insufficient_scope",
    });

    const result = await handler(uploadEvent);

    expect(result.statusCode).toBe(502);
    expect(JSON.parse(result.body as string).code).toBe("GIT_COMMIT_FAILED");
    const put = s3Send.mock.calls.some(
      (c) => (c[0] as { input?: { Body?: unknown } })?.input?.Body !== undefined
    );
    expect(put).toBe(false);
  });

  it("stores the image when the commit succeeds", async () => {
    const { handler, s3Send } = await loadWithGit({ committed: true });

    const result = await handler(uploadEvent);

    expect(result.statusCode).toBe(200);
    const put = s3Send.mock.calls.some(
      (c) => (c[0] as { input?: { Body?: unknown } })?.input?.Body !== undefined
    );
    expect(put).toBe(true);
  });

  it("does not delete the image when the delete commit fails", async () => {
    const { handler, s3Send } = await loadWithGit({ committed: false, error: "409: conflict" });

    const result = await handler({
      rawPath: "/api/media/posts/my-post/photo.png",
      requestContext: { http: { method: "DELETE" } },
      headers: {},
      isBase64Encoded: false,
    } as unknown as APIGatewayProxyEventV2);

    expect(result.statusCode).toBe(502);
    const deleted = s3Send.mock.calls.some(
      (c) =>
        (c[0] as { constructor?: { name?: string } })?.constructor?.name === "DeleteObjectCommand"
    );
    expect(deleted).toBe(false);
  });
});
