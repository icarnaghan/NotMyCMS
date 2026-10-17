/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  parseFrontmatter,
  serializeContent,
  slugify,
  normalizeDate,
  normalizeTimestamp,
} from "./index";

describe("parseFrontmatter", () => {
  it("parses basic frontmatter with title and date", () => {
    const content = `---
title: Hello World
date: "2024-01-15"
---

This is the body.`;

    const { meta, body } = parseFrontmatter(content);
    expect(meta.title).toBe("Hello World");
    expect(meta.date).toBe("2024-01-15");
    expect(body).toBe("This is the body.");
  });

  it("parses unquoted date as Date object (js-yaml behavior)", () => {
    const content = `---
title: Hello World
date: 2024-01-15
---

Body.`;

    const { meta } = parseFrontmatter(content);
    expect(meta.title).toBe("Hello World");
    // js-yaml parses unquoted dates as Date objects
    expect(meta.date).toBeInstanceOf(Date);
  });

  it("parses frontmatter with arrays", () => {
    const content = `---
title: Test Post
categories:
  - JavaScript
  - TypeScript
tags:
  - tutorial
  - beginner
---

Body content here.`;

    const { meta, body } = parseFrontmatter(content);
    expect(meta.title).toBe("Test Post");
    expect(meta.categories).toEqual(["JavaScript", "TypeScript"]);
    expect(meta.tags).toEqual(["tutorial", "beginner"]);
    expect(body).toBe("Body content here.");
  });

  it("parses frontmatter with boolean draft field", () => {
    const content = `---
title: Draft Post
draft: true
---

Draft body.`;

    const { meta } = parseFrontmatter(content);
    expect(meta.draft).toBe(true);
  });

  it("parses frontmatter with optional fields", () => {
    const content = `---
title: Full Post
date: "2024-03-20"
description: A full post with all fields
author: John Doe
categories:
  - Tech
tags:
  - aws
draft: false
---

Full body content.`;

    const { meta, body } = parseFrontmatter(content);
    expect(meta.title).toBe("Full Post");
    expect(meta.date).toBe("2024-03-20");
    expect(meta.description).toBe("A full post with all fields");
    expect(meta.author).toBe("John Doe");
    expect(meta.categories).toEqual(["Tech"]);
    expect(meta.tags).toEqual(["aws"]);
    expect(meta.draft).toBe(false);
    expect(body).toBe("Full body content.");
  });

  it("throws on missing frontmatter delimiters", () => {
    const content = "No frontmatter here.";
    expect(() => parseFrontmatter(content)).toThrow("Invalid frontmatter format");
  });

  it("handles empty body", () => {
    const content = `---
title: No Body
---

`;

    const { meta, body } = parseFrontmatter(content);
    expect(meta.title).toBe("No Body");
    expect(body).toBe("");
  });

  it("handles multiline body with markdown", () => {
    const content = `---
title: Markdown Post
---

# Heading

Some paragraph.

- List item 1
- List item 2`;

    const { meta, body } = parseFrontmatter(content);
    expect(meta.title).toBe("Markdown Post");
    expect(body).toContain("# Heading");
    expect(body).toContain("- List item 1");
  });

  // --- Edge cases for task 3.4 ---

  it("parses empty categories array", () => {
    const content = `---
title: Empty Categories
categories: []
---

Body.`;

    const { meta } = parseFrontmatter(content);
    expect(meta.categories).toEqual([]);
  });

  it("parses empty tags array", () => {
    const content = `---
title: Empty Tags
tags: []
---

Body.`;

    const { meta } = parseFrontmatter(content);
    expect(meta.tags).toEqual([]);
  });

  it("handles missing optional fields gracefully", () => {
    const content = `---
title: Minimal Post
---

Body only.`;

    const { meta } = parseFrontmatter(content);
    expect(meta.title).toBe("Minimal Post");
    expect(meta.date).toBeUndefined();
    expect(meta.description).toBeUndefined();
    expect(meta.author).toBeUndefined();
    expect(meta.categories).toBeUndefined();
    expect(meta.tags).toBeUndefined();
    expect(meta.draft).toBeUndefined();
  });

  it("preserves extra/unknown fields in frontmatter", () => {
    const content = `---
title: Extended Post
date: "2024-06-01"
customField: custom value
weight: 42
featured: true
---

Body.`;

    const { meta } = parseFrontmatter(content);
    expect(meta.title).toBe("Extended Post");
    expect(meta["customField"]).toBe("custom value");
    expect(meta["weight"]).toBe(42);
    expect(meta["featured"]).toBe(true);
  });

  it("handles null values in frontmatter fields", () => {
    const content = `---
title: Null Fields
description: null
author: null
---

Body.`;

    const { meta } = parseFrontmatter(content);
    expect(meta.title).toBe("Null Fields");
    expect(meta.description).toBeNull();
    expect(meta.author).toBeNull();
  });

  it("throws on content with only opening delimiter", () => {
    const content = `---
title: Broken
No closing delimiter here.`;

    expect(() => parseFrontmatter(content)).toThrow("Invalid frontmatter format");
  });

  it("throws on empty string", () => {
    expect(() => parseFrontmatter("")).toThrow("Invalid frontmatter format");
  });
});

describe("serializeContent", () => {
  it("serializes basic metadata and body", () => {
    const meta = { title: "Test Post" };
    const body = "Hello world.";

    const result = serializeContent(meta, body);
    expect(result).toContain("---\n");
    expect(result).toContain("title: Test Post");
    expect(result).toContain("---\n\n");
    expect(result).toContain("Hello world.");
  });

  it("serializes arrays in frontmatter", () => {
    const meta = {
      title: "Post with Arrays",
      categories: ["JavaScript", "TypeScript"],
      tags: ["tutorial"],
    };
    const body = "Content.";

    const result = serializeContent(meta, body);
    expect(result).toContain("categories:");
    expect(result).toContain("JavaScript");
    expect(result).toContain("TypeScript");
    expect(result).toContain("tags:");
    expect(result).toContain("tutorial");
  });

  it("round-trips through parse and serialize", () => {
    const originalMeta = {
      title: "Round Trip",
      date: "2024-06-01",
      description: "Testing round trip",
      categories: ["Cat1", "Cat2"],
      tags: ["tag1", "tag2"],
      draft: true,
    };
    const originalBody = "This is the body content.\n\nWith multiple paragraphs.";

    const serialized = serializeContent(originalMeta, originalBody);
    const { meta, body } = parseFrontmatter(serialized);

    expect(meta.title).toBe(originalMeta.title);
    expect(meta.date).toBe(originalMeta.date);
    expect(meta.description).toBe(originalMeta.description);
    expect(meta.categories).toEqual(originalMeta.categories);
    expect(meta.tags).toEqual(originalMeta.tags);
    expect(meta.draft).toBe(originalMeta.draft);
    expect(body).toBe(originalBody);
  });

  // --- Additional round-trip and serialization tests ---

  it("round-trips with empty arrays", () => {
    const originalMeta = {
      title: "Empty Arrays",
      categories: [] as string[],
      tags: [] as string[],
    };
    const originalBody = "Body text.";

    const serialized = serializeContent(originalMeta, originalBody);
    const { meta, body } = parseFrontmatter(serialized);

    expect(meta.title).toBe(originalMeta.title);
    expect(meta.categories).toEqual([]);
    expect(meta.tags).toEqual([]);
    expect(body).toBe(originalBody);
  });

  it("round-trips with extra/custom fields preserved", () => {
    const originalMeta = {
      title: "Custom Fields",
      customField: "preserved",
      weight: 10,
      featured: true,
    };
    const originalBody = "Body.";

    const serialized = serializeContent(originalMeta, originalBody);
    const { meta, body } = parseFrontmatter(serialized);

    expect(meta.title).toBe(originalMeta.title);
    expect(meta["customField"]).toBe("preserved");
    expect(meta["weight"]).toBe(10);
    expect(meta["featured"]).toBe(true);
    expect(body).toBe(originalBody);
  });

  it("round-trips with body containing frontmatter-like delimiters", () => {
    const originalMeta = { title: "Tricky Body" };
    const originalBody = "Some content.\n\nMore content after that.";

    const serialized = serializeContent(originalMeta, originalBody);
    const { meta, body } = parseFrontmatter(serialized);

    expect(meta.title).toBe("Tricky Body");
    expect(body).toBe(originalBody);
  });

  it("serializes with empty body", () => {
    const meta = { title: "No Body" };
    const body = "";

    const result = serializeContent(meta, body);
    expect(result).toContain("title: No Body");
    expect(result.endsWith("---\n\n")).toBe(true);
  });

  it("handles body with leading/trailing whitespace", () => {
    const meta = { title: "Whitespace" };
    const body = "  leading spaces\n\ntrailing spaces  ";

    const serialized = serializeContent(meta, body);
    const { body: parsedBody } = parseFrontmatter(serialized);
    expect(parsedBody).toBe(body);
  });
});

describe("slugify", () => {
  it("converts title to lowercase with hyphens", () => {
    expect(slugify("Hello World")).toBe("hello-world");
  });

  it("strips straight apostrophes", () => {
    expect(slugify("It's a Test")).toBe("its-a-test");
  });

  it("strips curly apostrophes", () => {
    expect(slugify("It\u2019s a Test")).toBe("its-a-test");
    expect(slugify("It\u2018s a Test")).toBe("its-a-test");
  });

  it("removes special characters", () => {
    expect(slugify("Hello! World? #1")).toBe("hello-world-1");
  });

  it("collapses consecutive hyphens", () => {
    expect(slugify("Hello --- World")).toBe("hello-world");
  });

  it("strips leading and trailing hyphens", () => {
    expect(slugify("--Hello World--")).toBe("hello-world");
  });

  it("handles numbers", () => {
    expect(slugify("Top 10 Tips for 2024")).toBe("top-10-tips-for-2024");
  });

  it("handles unicode characters", () => {
    expect(slugify("Café & Résumé")).toBe("caf-r-sum");
  });

  it("returns empty string for non-alphanumeric input", () => {
    expect(slugify("!!!")).toBe("");
  });

  // --- Additional slug tests for task 3.4 ---

  it("strips curly right single quote (U+201B)", () => {
    expect(slugify("It\u201Bs fine")).toBe("its-fine");
  });

  it("handles titles with only numbers", () => {
    expect(slugify("12345")).toBe("12345");
  });

  it("handles mixed punctuation and spaces", () => {
    expect(slugify("Hello, World! How's it going?")).toBe("hello-world-hows-it-going");
  });

  it("handles parentheses and brackets", () => {
    expect(slugify("React (JavaScript) [Guide]")).toBe("react-javascript-guide");
  });

  it("handles ampersands", () => {
    expect(slugify("Pros & Cons")).toBe("pros-cons");
  });

  it("handles dots and underscores", () => {
    expect(slugify("Node.js_Best_Practices")).toBe("node-js-best-practices");
  });

  it("handles em-dashes and en-dashes", () => {
    expect(slugify("Hello\u2014World\u2013Test")).toBe("hello-world-test");
  });

  it("handles a title with leading special chars only", () => {
    expect(slugify("!!!Hello")).toBe("hello");
  });

  it("handles a title with trailing special chars only", () => {
    expect(slugify("Hello!!!")).toBe("hello");
  });

  it("handles multiple consecutive apostrophes", () => {
    expect(slugify("don''t won''t")).toBe("dont-wont");
  });

  it("preserves hyphens in the middle of words", () => {
    expect(slugify("well-known")).toBe("well-known");
  });
});

describe("normalizeDate", () => {
  it("converts Date object to ISO date string", () => {
    const date = new Date("2024-01-15T00:00:00Z");
    expect(normalizeDate(date)).toBe("2024-01-15");
  });

  it("passes through string dates unchanged", () => {
    expect(normalizeDate("2024-06-01")).toBe("2024-06-01");
  });

  it("returns empty string for undefined/null", () => {
    expect(normalizeDate(undefined)).toBe("");
    expect(normalizeDate(null)).toBe("");
  });

  it("converts number to string", () => {
    expect(normalizeDate(2024)).toBe("2024");
  });
});

describe("normalizeTimestamp", () => {
  it("keeps the time component, unlike normalizeDate", () => {
    expect(normalizeTimestamp("2024-06-01T13:45:30.000Z")).toBe("2024-06-01T13:45:30.000Z");
  });

  it("converts a Date (js-yaml parses unquoted timestamps as Date)", () => {
    expect(normalizeTimestamp(new Date("2024-06-01T13:45:30Z"))).toBe("2024-06-01T13:45:30.000Z");
  });

  it("normalizes a date-only string to midnight UTC", () => {
    expect(normalizeTimestamp("2024-06-01")).toBe("2024-06-01T00:00:00.000Z");
  });

  it("returns undefined for missing or blank values", () => {
    expect(normalizeTimestamp(undefined)).toBeUndefined();
    expect(normalizeTimestamp(null)).toBeUndefined();
    expect(normalizeTimestamp("")).toBeUndefined();
    expect(normalizeTimestamp("   ")).toBeUndefined();
  });

  it("drops unparseable values so they fall back rather than rendering Invalid Date", () => {
    expect(normalizeTimestamp("not a date")).toBeUndefined();
    expect(normalizeTimestamp(new Date("nonsense"))).toBeUndefined();
    expect(normalizeTimestamp(12345)).toBeUndefined();
  });
});

describe("error response formatting", () => {
  it("returns structured ApiError with required fields", async () => {
    // We import the handler and simulate a request with invalid path
    const { handler } = await import("./index");

    const event = {
      rawPath: "/api/content/invalid-type",
      requestContext: {
        http: { method: "GET" },
      },
      headers: {},
    } as any;

    const result = await handler(event);
    expect(result.statusCode).toBe(400);

    const body = JSON.parse(result.body as string);
    expect(body).toHaveProperty("code");
    expect(body).toHaveProperty("message");
    expect(body).toHaveProperty("correlationId");
    expect(typeof body.code).toBe("string");
    expect(typeof body.message).toBe("string");
    expect(typeof body.correlationId).toBe("string");
    expect(body.code).toBe("INVALID_TYPE");
  });

  it("returns 400 with INVALID_PATH for missing type", async () => {
    const { handler } = await import("./index");

    const event = {
      rawPath: "/api/content",
      requestContext: {
        http: { method: "GET" },
      },
      headers: {},
    } as any;

    const result = await handler(event);
    expect(result.statusCode).toBe(400);

    const body = JSON.parse(result.body as string);
    expect(body.code).toBe("INVALID_PATH");
  });

  it("returns 405 for unsupported HTTP methods", async () => {
    const { handler } = await import("./index");

    const event = {
      rawPath: "/api/content/posts",
      requestContext: {
        http: { method: "PATCH" },
      },
      headers: {},
    } as any;

    const result = await handler(event);
    expect(result.statusCode).toBe(405);

    const body = JSON.parse(result.body as string);
    expect(body.code).toBe("METHOD_NOT_ALLOWED");
    expect(body).toHaveProperty("correlationId");
  });

  it("error responses have Content-Type application/json header", async () => {
    const { handler } = await import("./index");

    const event = {
      rawPath: "/api/content/invalid-type",
      requestContext: {
        http: { method: "GET" },
      },
      headers: {},
    } as any;

    const result = await handler(event);
    expect(result.headers).toBeDefined();
    expect((result.headers as Record<string, string>)["Content-Type"]).toBe("application/json");
  });

  it("returns 400 with MISSING_BODY for PUT without body", async () => {
    const { handler } = await import("./index");

    const event = {
      rawPath: "/api/content/posts",
      requestContext: {
        http: { method: "PUT" },
      },
      headers: {},
      body: undefined,
    } as any;

    const result = await handler(event);
    expect(result.statusCode).toBe(400);

    const body = JSON.parse(result.body as string);
    expect(body.code).toBe("MISSING_BODY");
  });

  it("returns 400 with INVALID_JSON for malformed body", async () => {
    const { handler } = await import("./index");

    const event = {
      rawPath: "/api/content/posts",
      requestContext: {
        http: { method: "PUT" },
      },
      headers: {},
      body: "not json {{{",
      isBase64Encoded: false,
    } as any;

    const result = await handler(event);
    expect(result.statusCode).toBe(400);

    const body = JSON.parse(result.body as string);
    expect(body.code).toBe("INVALID_JSON");
  });

  it("returns 400 with VALIDATION_ERROR for PUT without title", async () => {
    const { handler } = await import("./index");

    const event = {
      rawPath: "/api/content/posts",
      requestContext: {
        http: { method: "PUT" },
      },
      headers: {},
      body: JSON.stringify({ body: "content without title" }),
      isBase64Encoded: false,
    } as any;

    const result = await handler(event);
    expect(result.statusCode).toBe(400);

    const body = JSON.parse(result.body as string);
    expect(body.code).toBe("VALIDATION_ERROR");
    expect(body.message).toContain("Title");
  });

  it("returns 400 for DELETE without slug", async () => {
    const { handler } = await import("./index");

    const event = {
      rawPath: "/api/content/posts",
      requestContext: {
        http: { method: "DELETE" },
      },
      headers: {},
    } as any;

    const result = await handler(event);
    expect(result.statusCode).toBe(400);

    const body = JSON.parse(result.body as string);
    expect(body.code).toBe("MISSING_SLUG");
  });
});

// --- Handler routing with mocked S3 ---
describe("handler routing with mocked S3", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  function createMockS3() {
    const mockSend = vi.fn();
    vi.doMock("@aws-sdk/client-s3", () => {
      return {
        S3Client: class MockS3Client {
          send = mockSend;
        },
        ListObjectsV2Command: class {
          input: any;
          constructor(input: any) {
            this.input = input;
          }
        },
        GetObjectCommand: class {
          input: any;
          constructor(input: any) {
            this.input = input;
          }
        },
        PutObjectCommand: class {
          input: any;
          constructor(input: any) {
            this.input = input;
          }
        },
        DeleteObjectsCommand: class {
          input: any;
          constructor(input: any) {
            this.input = input;
          }
        },
        HeadObjectCommand: class {
          input: any;
          constructor(input: any) {
            this.input = input;
          }
        },
      };
    });
    return mockSend;
  }

  it("GET /api/content/posts lists content items", async () => {
    const mockSend = createMockS3();

    const fileContent = `---
title: Test Post
date: "2024-01-15"
categories:
  - Tech
tags:
  - vitest
---

Hello world.`;

    // First call: ListObjectsV2Command for listing posts
    mockSend.mockImplementation((cmd: any) => {
      if (cmd.input?.Prefix === "content/posts/") {
        return Promise.resolve({
          Contents: [
            {
              Key: "content/posts/test-post/index.md",
              LastModified: new Date("2024-01-15"),
            },
          ],
          NextContinuationToken: undefined,
        });
      }
      // GetObjectCommand for reading the file
      if (cmd.input?.Key === "content/posts/test-post/index.md") {
        return Promise.resolve({
          Body: { transformToString: () => Promise.resolve(fileContent) },
          LastModified: new Date("2024-01-15"),
        });
      }
      // ListObjectsV2Command for images
      if (cmd.input?.Prefix === "content/posts/test-post/images/") {
        return Promise.resolve({ Contents: [] });
      }
      return Promise.resolve({});
    });

    const { handler } = await import("./index");

    const event = {
      rawPath: "/api/content/posts",
      requestContext: { http: { method: "GET" } },
      headers: {},
    } as any;

    const result = await handler(event);
    expect(result.statusCode).toBe(200);

    const body = JSON.parse(result.body as string);
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBe(1);
    expect(body[0].slug).toBe("test-post");
    expect(body[0].title).toBe("Test Post");
    expect(body[0].categories).toEqual(["Tech"]);
    expect(body[0].tags).toEqual(["vitest"]);
  });

  it("GET /api/content/posts/test-post returns single item with body", async () => {
    const mockSend = createMockS3();

    const fileContent = `---
title: Test Post
date: "2024-01-15"
---

Body content here.`;

    mockSend.mockImplementation((cmd: any) => {
      if (cmd.input?.Key === "content/posts/test-post/index.md") {
        return Promise.resolve({
          Body: { transformToString: () => Promise.resolve(fileContent) },
          LastModified: new Date("2024-01-15"),
        });
      }
      // Images listing
      if (cmd.input?.Prefix === "content/posts/test-post/images/") {
        return Promise.resolve({ Contents: [] });
      }
      return Promise.resolve({});
    });

    const { handler } = await import("./index");

    const event = {
      rawPath: "/api/content/posts/test-post",
      requestContext: { http: { method: "GET" } },
      headers: {},
    } as any;

    const result = await handler(event);
    expect(result.statusCode).toBe(200);

    const body = JSON.parse(result.body as string);
    expect(body.slug).toBe("test-post");
    expect(body.title).toBe("Test Post");
    expect(body.body).toBe("Body content here.");
  });

  it("GET /api/content/posts/nonexistent returns 404", async () => {
    const mockSend = createMockS3();

    mockSend.mockImplementation((cmd: any) => {
      if (cmd.input?.Key === "content/posts/nonexistent/index.md") {
        const err = new Error("NoSuchKey");
        (err as any).name = "NoSuchKey";
        return Promise.reject(err);
      }
      return Promise.resolve({});
    });

    const { handler } = await import("./index");

    const event = {
      rawPath: "/api/content/posts/nonexistent",
      requestContext: { http: { method: "GET" } },
      headers: {},
    } as any;

    const result = await handler(event);
    expect(result.statusCode).toBe(404);

    const body = JSON.parse(result.body as string);
    expect(body.code).toBe("CONTENT_NOT_FOUND");
  });

  it("PUT /api/content/posts creates new content with generated slug", async () => {
    const mockSend = createMockS3();

    const createdContent = `---
title: New Post Title
date: "2024-06-01"
---

New body.`;

    let callCount = 0;
    mockSend.mockImplementation((cmd: any) => {
      callCount++;
      // First call: HeadObjectCommand for slug conflict check - throw to indicate no conflict
      if (callCount === 1) {
        const err = new Error("Not Found");
        (err as any).name = "NotFound";
        return Promise.reject(err);
      }
      // Second call: PutObjectCommand for writing
      if (cmd.input?.Body) {
        return Promise.resolve({});
      }
      // GetObjectCommand after put (to return the saved item)
      if (cmd.input?.Key === "content/posts/new-post-title/index.md") {
        return Promise.resolve({
          Body: { transformToString: () => Promise.resolve(createdContent) },
          LastModified: new Date("2024-06-01"),
        });
      }
      // Images listing
      if (cmd.input?.Prefix === "content/posts/new-post-title/images/") {
        return Promise.resolve({ Contents: [] });
      }
      return Promise.resolve({});
    });

    const { handler } = await import("./index");

    const event = {
      rawPath: "/api/content/posts",
      requestContext: { http: { method: "PUT" } },
      headers: {},
      body: JSON.stringify({
        title: "New Post Title",
        date: "2024-06-01",
        body: "New body.",
      }),
      isBase64Encoded: false,
    } as any;

    const result = await handler(event);
    expect(result.statusCode).toBe(201);

    const body = JSON.parse(result.body as string);
    expect(body.slug).toBe("new-post-title");
    expect(body.title).toBe("New Post Title");
  });

  it("PUT /api/content/posts returns 409 SLUG_CONFLICT when slug exists", async () => {
    const mockSend = createMockS3();

    // HeadObjectCommand succeeds = slug already exists
    mockSend.mockImplementation((cmd: any) => {
      if (cmd.input?.Key === "content/posts/existing-post/index.md") {
        return Promise.resolve({});
      }
      return Promise.resolve({});
    });

    const { handler } = await import("./index");

    const event = {
      rawPath: "/api/content/posts",
      requestContext: { http: { method: "PUT" } },
      headers: {},
      body: JSON.stringify({
        title: "Existing Post",
        body: "Some body.",
      }),
      isBase64Encoded: false,
    } as any;

    const result = await handler(event);
    expect(result.statusCode).toBe(409);

    const body = JSON.parse(result.body as string);
    expect(body.code).toBe("SLUG_CONFLICT");
    expect(body.path).toContain("existing-post");
  });

  it("PUT /api/content/posts/existing-slug updates existing content", async () => {
    const mockSend = createMockS3();

    const updatedContent = `---
title: Updated Title
date: "2024-06-01"
---

Updated body.`;

    mockSend.mockImplementation((cmd: any) => {
      // PutObjectCommand
      if (cmd.input?.Body) {
        return Promise.resolve({});
      }
      // GetObjectCommand after put
      if (cmd.input?.Key === "content/posts/existing-slug/index.md") {
        return Promise.resolve({
          Body: { transformToString: () => Promise.resolve(updatedContent) },
          LastModified: new Date("2024-06-01"),
        });
      }
      // Images
      if (cmd.input?.Prefix === "content/posts/existing-slug/images/") {
        return Promise.resolve({ Contents: [] });
      }
      return Promise.resolve({});
    });

    const { handler } = await import("./index");

    const event = {
      rawPath: "/api/content/posts/existing-slug",
      requestContext: { http: { method: "PUT" } },
      headers: {},
      body: JSON.stringify({
        title: "Updated Title",
        date: "2024-06-01",
        body: "Updated body.",
      }),
      isBase64Encoded: false,
    } as any;

    const result = await handler(event);
    expect(result.statusCode).toBe(200);

    const body = JSON.parse(result.body as string);
    expect(body.title).toBe("Updated Title");
  });

  it("DELETE /api/content/posts/test-post deletes content and returns 204", async () => {
    const mockSend = createMockS3();

    mockSend.mockImplementation((cmd: any) => {
      // HeadObjectCommand - item exists
      if (cmd.input?.Key === "content/posts/test-post/index.md" && !cmd.input?.Prefix) {
        return Promise.resolve({});
      }
      // ListObjectsV2Command for deletion
      if (cmd.input?.Prefix === "content/posts/test-post/") {
        return Promise.resolve({
          Contents: [
            { Key: "content/posts/test-post/index.md" },
            { Key: "content/posts/test-post/images/photo.jpg" },
          ],
        });
      }
      // DeleteObjectsCommand
      return Promise.resolve({});
    });

    const { handler } = await import("./index");

    const event = {
      rawPath: "/api/content/posts/test-post",
      requestContext: { http: { method: "DELETE" } },
      headers: {},
    } as any;

    const result = await handler(event);
    expect(result.statusCode).toBe(204);
  });

  it("DELETE /api/content/posts/nonexistent returns 404", async () => {
    const mockSend = createMockS3();

    mockSend.mockImplementation((cmd: any) => {
      // HeadObjectCommand - item does not exist
      if (cmd.input?.Key === "content/posts/nonexistent/index.md") {
        const err = new Error("Not Found");
        (err as any).name = "NotFound";
        return Promise.reject(err);
      }
      return Promise.resolve({});
    });

    const { handler } = await import("./index");

    const event = {
      rawPath: "/api/content/posts/nonexistent",
      requestContext: { http: { method: "DELETE" } },
      headers: {},
    } as any;

    const result = await handler(event);
    expect(result.statusCode).toBe(404);

    const body = JSON.parse(result.body as string);
    expect(body.code).toBe("CONTENT_NOT_FOUND");
  });

  /**
   * `modified` exists because S3 LastModified is useless as an edit time: a site
   * deploy rewrites every content object, so all of them read as the deploy time.
   * Keeping the stamp in frontmatter means it survives deploys.
   */
  describe("modified stamp", () => {
    /** Pull the frontmatter written by the PutObject call. */
    function writtenMeta(mockSend: ReturnType<typeof vi.fn>) {
      const put = mockSend.mock.calls
        .map(([cmd]: any) => cmd)
        .find((cmd: any) => typeof cmd?.input?.Body === "string");
      expect(put, "expected a PutObjectCommand with a string Body").toBeTruthy();
      return parseFrontmatter(put.input.Body).meta;
    }

    it("stamps modified on create", async () => {
      const mockSend = createMockS3();
      let callCount = 0;
      mockSend.mockImplementation((cmd: any) => {
        callCount++;
        if (callCount === 1) {
          const err = new Error("Not Found");
          (err as any).name = "NotFound";
          return Promise.reject(err);
        }
        if (cmd.input?.Body) return Promise.resolve({});
        if (cmd.input?.Key === "content/posts/stamped/index.md") {
          return Promise.resolve({
            Body: { transformToString: () => Promise.resolve("---\ntitle: Stamped\n---\n\nx.") },
            LastModified: new Date("2024-06-01"),
          });
        }
        return Promise.resolve({ Contents: [] });
      });

      const { handler } = await import("./index");
      const before = Date.now();
      const result = await handler({
        rawPath: "/api/content/posts",
        requestContext: { http: { method: "PUT" } },
        headers: {},
        body: JSON.stringify({ title: "Stamped", date: "2024-06-01", body: "x." }),
        isBase64Encoded: false,
      } as any);
      const after = Date.now();

      expect(result.statusCode).toBe(201);
      const meta = writtenMeta(mockSend);
      const stamped = new Date(meta.modified as string).getTime();
      expect(stamped).toBeGreaterThanOrEqual(before);
      expect(stamped).toBeLessThanOrEqual(after);
    });

    it("ignores a client-supplied modified so an edit cannot be backdated", async () => {
      const mockSend = createMockS3();
      let callCount = 0;
      mockSend.mockImplementation((cmd: any) => {
        callCount++;
        if (callCount === 1) {
          const err = new Error("Not Found");
          (err as any).name = "NotFound";
          return Promise.reject(err);
        }
        if (cmd.input?.Body) return Promise.resolve({});
        if (cmd.input?.Key === "content/posts/backdated/index.md") {
          return Promise.resolve({
            Body: { transformToString: () => Promise.resolve("---\ntitle: Backdated\n---\n\nx.") },
            LastModified: new Date("2024-06-01"),
          });
        }
        return Promise.resolve({ Contents: [] });
      });

      const { handler } = await import("./index");
      const result = await handler({
        rawPath: "/api/content/posts",
        requestContext: { http: { method: "PUT" } },
        headers: {},
        body: JSON.stringify({
          title: "Backdated",
          date: "2024-06-01",
          body: "x.",
          modified: "1999-01-01T00:00:00.000Z",
        }),
        isBase64Encoded: false,
      } as any);

      expect(result.statusCode).toBe(201);
      const meta = writtenMeta(mockSend);
      expect(meta.modified).not.toBe("1999-01-01T00:00:00.000Z");
      expect(new Date(meta.modified as string).getFullYear()).toBeGreaterThan(2000);
    });

    it("returns modified from frontmatter when listing", async () => {
      const mockSend = createMockS3();
      const fileContent = `---
title: Edited Post
date: "2020-01-01"
modified: "2026-09-26T10:00:00.000Z"
---

Body.`;
      mockSend.mockImplementation((cmd: any) => {
        if (cmd.input?.Prefix === "content/posts/") {
          return Promise.resolve({
            Contents: [
              { Key: "content/posts/edited-post/index.md", LastModified: new Date("2024-01-15") },
            ],
          });
        }
        return Promise.resolve({
          Body: { transformToString: () => Promise.resolve(fileContent) },
          LastModified: new Date("2024-01-15"),
        });
      });

      const { handler } = await import("./index");
      const result = await handler({
        rawPath: "/api/content/posts",
        requestContext: { http: { method: "GET" } },
        headers: {},
      } as any);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body as string);
      expect(body.length).toBe(1);
      const item = body[0];
      expect(item.modified).toBe("2026-09-26T10:00:00.000Z");
      // lastModified stays S3-derived: it is the concurrency token, not a display value.
      expect(item.lastModified).toBe(new Date("2024-01-15").toISOString());
    });

    it("omits modified for content that has never been edited", async () => {
      const mockSend = createMockS3();
      const fileContent = `---
title: Untouched
date: "2015-05-05"
---

Body.`;
      mockSend.mockImplementation((cmd: any) => {
        if (cmd.input?.Prefix === "content/posts/") {
          return Promise.resolve({
            Contents: [
              { Key: "content/posts/untouched/index.md", LastModified: new Date("2024-01-15") },
            ],
          });
        }
        return Promise.resolve({
          Body: { transformToString: () => Promise.resolve(fileContent) },
          LastModified: new Date("2024-01-15"),
        });
      });

      const { handler } = await import("./index");
      const result = await handler({
        rawPath: "/api/content/posts",
        requestContext: { http: { method: "GET" } },
        headers: {},
      } as any);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body as string);
      expect(body.length).toBe(1);
      expect(body[0].modified).toBeUndefined();
    });
  });

  /**
   * Blocking commits (content-storage stage 4).
   *
   * Git is the source of truth now: a save that cannot be committed is not a save. The
   * other tests in this file never reach a real commit — the token is unset, so the
   * provider skips and the save proceeds — which is exactly the gap that lets a broken
   * commit path pass unnoticed. These mock the git provider directly to drive the
   * commit outcome, and assert both halves of the contract: a failed commit aborts the
   * save without touching S3, and the write order is commit-then-S3.
   */
  describe("blocking commits", () => {
    /**
     * Replace the git module's provider while keeping the real requireCommitted and
     * CommitFailedError, which the handler also imports from it. `commits` records the
     * calls so a test can assert ordering against the S3 mock.
     */
    async function mockGit(outcome: {
      commitUpsert?: () => Promise<unknown>;
      commitDelete?: () => Promise<unknown>;
    }) {
      const actual = await vi.importActual<typeof import("../shared/git")>("../shared/git");
      const calls: string[] = [];
      vi.doMock("../shared/git", () => ({
        ...actual,
        createGitProvider: () => ({
          s3KeyToRepoPath: (k: string) => k,
          commitUpsert: async (...a: unknown[]) => {
            calls.push("commitUpsert");
            return (outcome.commitUpsert ?? (async () => ({ committed: true })))(...(a as []));
          },
          commitDelete: async (...a: unknown[]) => {
            calls.push("commitDelete");
            return (outcome.commitDelete ?? (async () => ({ committed: true })))(...(a as []));
          },
          commitFiles: async () => ({ committed: true }),
          listFileCommits: async () => [],
          getFileAtRef: async () => null,
        }),
      }));
      return calls;
    }

    const createEvent = {
      rawPath: "/api/content/posts",
      requestContext: { http: { method: "PUT" } },
      headers: {},
      body: JSON.stringify({ title: "Blocked Post", date: "2024-06-01", body: "x." }),
      isBase64Encoded: false,
    } as any;

    it("returns 502 and does not write S3 when the commit fails", async () => {
      await mockGit({
        commitUpsert: async () => ({ committed: false, error: "403: insufficient_scope" }),
      });
      const mockSend = createMockS3();
      // No conflict on the slug check; anything else resolves.
      mockSend.mockImplementation((cmd: any) => {
        if (cmd.input?.Key === "content/posts/blocked-post/index.md" && !cmd.input?.Prefix) {
          const err = new Error("Not Found");
          (err as any).name = "NotFound";
          return Promise.reject(err);
        }
        return Promise.resolve({});
      });

      const { handler } = await import("./index");
      const result = await handler(createEvent);

      expect(result.statusCode).toBe(502);
      const body = JSON.parse(result.body as string);
      expect(body.code).toBe("GIT_COMMIT_FAILED");
      expect(body.message).toContain("insufficient_scope");

      // The projection was never written: no PutObjectCommand carried a body.
      const wrote = mockSend.mock.calls.some(([cmd]: any) => typeof cmd?.input?.Body === "string");
      expect(wrote).toBe(false);
    });

    it("writes S3 only after a successful commit", async () => {
      const order: string[] = [];
      await mockGit({
        commitUpsert: async () => {
          order.push("commit");
          return { committed: true };
        },
      });
      const mockSend = createMockS3();
      mockSend.mockImplementation((cmd: any) => {
        // Projection write.
        if (typeof cmd.input?.Body === "string") {
          order.push("s3-put");
          return Promise.resolve({});
        }
        // Read-back after save (GetObject has a Key, no Body, after the put).
        if (cmd.input?.Key === "content/posts/blocked-post/index.md" && order.includes("s3-put")) {
          return Promise.resolve({
            Body: {
              transformToString: () => Promise.resolve("---\ntitle: Blocked Post\n---\n\nx."),
            },
            LastModified: new Date("2024-06-01"),
          });
        }
        // Slug-conflict HeadObject: not found means no conflict.
        if (cmd.input?.Key === "content/posts/blocked-post/index.md") {
          const err = new Error("Not Found");
          (err as any).name = "NotFound";
          return Promise.reject(err);
        }
        return Promise.resolve({ Contents: [] });
      });

      const { handler } = await import("./index");
      const result = await handler(createEvent);

      expect(result.statusCode).toBe(201);
      // Commit happened, and before the projection write.
      expect(order.indexOf("commit")).toBeGreaterThanOrEqual(0);
      expect(order.indexOf("commit")).toBeLessThan(order.indexOf("s3-put"));
    });

    it("does not delete from S3 when the delete commit fails", async () => {
      await mockGit({
        commitDelete: async () => ({ committed: false, error: "409: conflict" }),
      });
      const mockSend = createMockS3();
      mockSend.mockImplementation((cmd: any) => {
        // Item exists.
        if (cmd.input?.Key === "content/posts/doomed/index.md" && !cmd.input?.Prefix) {
          return Promise.resolve({});
        }
        // Listing for deletion.
        if (cmd.input?.Prefix === "content/posts/doomed/") {
          return Promise.resolve({ Contents: [{ Key: "content/posts/doomed/index.md" }] });
        }
        return Promise.resolve({});
      });

      const { handler } = await import("./index");
      const result = await handler({
        rawPath: "/api/content/posts/doomed",
        requestContext: { http: { method: "DELETE" } },
        headers: {},
      } as any);

      expect(result.statusCode).toBe(502);
      // No DeleteObjectsCommand was issued (its input has a Delete member).
      const deleted = mockSend.mock.calls.some(([cmd]: any) => cmd?.input?.Delete);
      expect(deleted).toBe(false);
    });

    it("still saves when git is unconfigured (skip is not a failure)", async () => {
      await mockGit({
        commitUpsert: async () => ({ committed: false, skipped: true }),
      });
      const mockSend = createMockS3();
      let wrote = false;
      mockSend.mockImplementation((cmd: any) => {
        if (typeof cmd.input?.Body === "string") {
          wrote = true;
          return Promise.resolve({});
        }
        if (cmd.input?.Key === "content/posts/blocked-post/index.md" && wrote) {
          return Promise.resolve({
            Body: {
              transformToString: () => Promise.resolve("---\ntitle: Blocked Post\n---\n\nx."),
            },
            LastModified: new Date("2024-06-01"),
          });
        }
        if (cmd.input?.Key === "content/posts/blocked-post/index.md") {
          const err = new Error("Not Found");
          (err as any).name = "NotFound";
          return Promise.reject(err);
        }
        return Promise.resolve({ Contents: [] });
      });

      const { handler } = await import("./index");
      const result = await handler(createEvent);

      // Skip passes through: the save succeeds and S3 is written.
      expect(result.statusCode).toBe(201);
      expect(wrote).toBe(true);
    });
  });
});
