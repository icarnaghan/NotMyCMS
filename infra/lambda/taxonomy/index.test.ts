import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockSend } = vi.hoisted(() => {
  const mockSend = vi.fn();
  return { mockSend };
});

vi.mock("@aws-sdk/client-s3", () => {
  return {
    S3Client: class {
      send = mockSend;
    },
    ListObjectsV2Command: class {
      _type = "ListObjectsV2";
      input: unknown;
      constructor(input: unknown) {
        this.input = input;
      }
    },
    GetObjectCommand: class {
      _type = "GetObject";
      input: unknown;
      constructor(input: unknown) {
        this.input = input;
      }
    },
    PutObjectCommand: class {
      _type = "PutObject";
      input: unknown;
      constructor(input: unknown) {
        this.input = input;
      }
    },
  };
});

import {
  parseFrontmatter,
  serializeContent,
  deriveTaxonomy,
  renameInMeta,
  mergeInMeta,
  deleteFromMeta,
  handler,
} from "./index";
import type { APIGatewayProxyEventV2 } from "aws-lambda";

describe("parseFrontmatter", () => {
  it("parses valid frontmatter with categories and tags", () => {
    const content = `---
title: Test Post
categories:
  - JavaScript
  - Web Development
tags:
  - react
  - typescript
---

Hello world`;

    const { meta, body } = parseFrontmatter(content);
    expect(meta.title).toBe("Test Post");
    expect(meta.categories).toEqual(["JavaScript", "Web Development"]);
    expect(meta.tags).toEqual(["react", "typescript"]);
    expect(body).toBe("Hello world");
  });

  it("throws on invalid frontmatter", () => {
    expect(() => parseFrontmatter("no frontmatter")).toThrow("Invalid frontmatter format");
  });
});

describe("serializeContent", () => {
  it("serializes meta and body back to markdown", () => {
    const meta = { title: "Test", categories: ["JS"], tags: ["web"] };
    const body = "Content here";
    const result = serializeContent(meta, body);

    expect(result).toContain("---\n");
    expect(result).toContain("title: Test");
    expect(result).toContain("Content here");

    // Round-trip: parse what we serialized
    const { meta: parsed, body: parsedBody } = parseFrontmatter(result);
    expect(parsed.title).toBe("Test");
    expect(parsed.categories).toEqual(["JS"]);
    expect(parsed.tags).toEqual(["web"]);
    expect(parsedBody).toBe("Content here");
  });
});

describe("deriveTaxonomy", () => {
  it("counts categories and tags across multiple files", () => {
    const files = [
      {
        key: "content/posts/a/index.md",
        meta: { title: "A", categories: ["JavaScript", "Web"], tags: ["react"] },
        body: "",
      },
      {
        key: "content/posts/b/index.md",
        meta: { title: "B", categories: ["JavaScript"], tags: ["react", "node"] },
        body: "",
      },
      {
        key: "content/knowledge-base/c/index.md",
        meta: { title: "C", categories: ["Python"], tags: ["django"] },
        body: "",
      },
    ];

    const taxonomy = deriveTaxonomy(files);

    const jsCategory = taxonomy.find((t) => t.name === "JavaScript" && t.type === "category");
    expect(jsCategory).toBeDefined();
    expect(jsCategory!.count).toBe(2);

    const webCategory = taxonomy.find((t) => t.name === "Web" && t.type === "category");
    expect(webCategory).toBeDefined();
    expect(webCategory!.count).toBe(1);

    const reactTag = taxonomy.find((t) => t.name === "react" && t.type === "tag");
    expect(reactTag).toBeDefined();
    expect(reactTag!.count).toBe(2);

    const nodeTag = taxonomy.find((t) => t.name === "node" && t.type === "tag");
    expect(nodeTag).toBeDefined();
    expect(nodeTag!.count).toBe(1);
  });

  it("returns empty array for files with no categories or tags", () => {
    const files = [{ key: "content/posts/a/index.md", meta: { title: "A" }, body: "" }];
    const taxonomy = deriveTaxonomy(files);
    expect(taxonomy).toEqual([]);
  });

  it("sorts results alphabetically by name", () => {
    const files = [
      {
        key: "content/posts/a/index.md",
        meta: { title: "A", categories: ["Zebra", "Apple"], tags: ["banana"] },
        body: "",
      },
    ];
    const taxonomy = deriveTaxonomy(files);
    const names = taxonomy.map((t) => t.name);
    // localeCompare default is case-sensitive: uppercase before lowercase
    expect(names).toEqual(["Apple", "banana", "Zebra"]);
  });
});

describe("renameInMeta", () => {
  it("renames a category in meta", () => {
    const meta = { title: "Test", categories: ["JavaScript", "Web"], tags: ["react"] };
    const result = renameInMeta(meta, "category", "JavaScript", "JS");

    expect(result.updated).toBe(true);
    expect(result.meta.categories).toEqual(["JS", "Web"]);
    expect(result.meta.tags).toEqual(["react"]); // Tags unchanged
  });

  it("renames a tag in meta", () => {
    const meta = { title: "Test", categories: ["Web"], tags: ["react", "vue"] };
    const result = renameInMeta(meta, "tag", "react", "reactjs");

    expect(result.updated).toBe(true);
    expect(result.meta.tags).toEqual(["reactjs", "vue"]);
    expect(result.meta.categories).toEqual(["Web"]); // Categories unchanged
  });

  it("returns updated=false when name not found", () => {
    const meta = { title: "Test", categories: ["Web"], tags: ["react"] };
    const result = renameInMeta(meta, "category", "NotHere", "Something");

    expect(result.updated).toBe(false);
    expect(result.meta).toBe(meta); // Same reference
  });

  it("handles missing categories/tags arrays", () => {
    const meta = { title: "Test" };
    const result = renameInMeta(meta, "category", "Web", "Internet");

    expect(result.updated).toBe(false);
  });
});

describe("mergeInMeta", () => {
  it("replaces source with target when target not present", () => {
    const meta = { title: "Test", categories: ["JavaScript", "Web"], tags: [] };
    const result = mergeInMeta(meta, "category", "JavaScript", "JS");

    expect(result.updated).toBe(true);
    expect(result.meta.categories).toContain("JS");
    expect(result.meta.categories).toContain("Web");
    expect(result.meta.categories).not.toContain("JavaScript");
  });

  it("deduplicates when target already present", () => {
    const meta = { title: "Test", tags: ["react", "reactjs"], categories: [] };
    const result = mergeInMeta(meta, "tag", "react", "reactjs");

    expect(result.updated).toBe(true);
    expect(result.meta.tags).toEqual(["reactjs"]);
  });

  it("returns updated=false when source not found", () => {
    const meta = { title: "Test", categories: ["Web"], tags: [] };
    const result = mergeInMeta(meta, "category", "NotHere", "Web");

    expect(result.updated).toBe(false);
  });

  it("handles missing arrays", () => {
    const meta = { title: "Test" };
    const result = mergeInMeta(meta, "tag", "old", "new");

    expect(result.updated).toBe(false);
  });
});

describe("deleteFromMeta", () => {
  it("removes a category from meta", () => {
    const meta = { title: "Test", categories: ["JavaScript", "Web"], tags: ["react"] };
    const result = deleteFromMeta(meta, "category", "JavaScript");

    expect(result.updated).toBe(true);
    expect(result.meta.categories).toEqual(["Web"]);
    expect(result.meta.tags).toEqual(["react"]); // Tags unchanged
  });

  it("removes a tag from meta", () => {
    const meta = { title: "Test", categories: ["Web"], tags: ["react", "vue"] };
    const result = deleteFromMeta(meta, "tag", "react");

    expect(result.updated).toBe(true);
    expect(result.meta.tags).toEqual(["vue"]);
  });

  it("returns updated=false when name not found", () => {
    const meta = { title: "Test", categories: ["Web"], tags: [] };
    const result = deleteFromMeta(meta, "category", "NotHere");

    expect(result.updated).toBe(false);
  });

  it("handles missing arrays", () => {
    const meta = { title: "Test" };
    const result = deleteFromMeta(meta, "tag", "something");

    expect(result.updated).toBe(false);
  });

  it("removes all occurrences of the name", () => {
    const meta = { title: "Test", tags: ["react", "react", "vue"] };
    const result = deleteFromMeta(meta, "tag", "react");

    expect(result.updated).toBe(true);
    expect(result.meta.tags).toEqual(["vue"]);
  });
});

// --- Multi-file scenario tests ---

describe("rename across multiple files", () => {
  it("renames a category in all files that contain it", () => {
    const files = [
      {
        key: "content/posts/a/index.md",
        meta: { title: "A", categories: ["JavaScript", "Web"], tags: ["react"] },
        body: "Body A",
      },
      {
        key: "content/posts/b/index.md",
        meta: { title: "B", categories: ["JavaScript"], tags: ["node"] },
        body: "Body B",
      },
      {
        key: "content/posts/c/index.md",
        meta: { title: "C", categories: ["Python"], tags: ["django"] },
        body: "Body C",
      },
    ];

    const results = files.map((f) => renameInMeta(f.meta, "category", "JavaScript", "JS"));

    // First two files should be updated
    expect(results[0].updated).toBe(true);
    expect(results[0].meta.categories).toEqual(["JS", "Web"]);

    expect(results[1].updated).toBe(true);
    expect(results[1].meta.categories).toEqual(["JS"]);

    // Third file should not be updated
    expect(results[2].updated).toBe(false);
    expect(results[2].meta.categories).toEqual(["Python"]);
  });

  it("renames a tag in all files that contain it", () => {
    const files = [
      {
        key: "content/posts/a/index.md",
        meta: { title: "A", categories: [], tags: ["react", "typescript"] },
        body: "",
      },
      {
        key: "content/posts/b/index.md",
        meta: { title: "B", categories: [], tags: ["react", "node"] },
        body: "",
      },
      {
        key: "content/knowledge-base/c/index.md",
        meta: { title: "C", categories: [], tags: ["python"] },
        body: "",
      },
    ];

    const results = files.map((f) => renameInMeta(f.meta, "tag", "react", "reactjs"));

    expect(results[0].updated).toBe(true);
    expect(results[0].meta.tags).toEqual(["reactjs", "typescript"]);

    expect(results[1].updated).toBe(true);
    expect(results[1].meta.tags).toEqual(["reactjs", "node"]);

    expect(results[2].updated).toBe(false);
    expect(results[2].meta.tags).toEqual(["python"]);
  });

  it("returns no updates when name is not found in any file", () => {
    const files = [
      {
        key: "content/posts/a/index.md",
        meta: { title: "A", categories: ["Web"], tags: ["react"] },
        body: "",
      },
      {
        key: "content/posts/b/index.md",
        meta: { title: "B", categories: ["Python"], tags: ["django"] },
        body: "",
      },
    ];

    const results = files.map((f) => renameInMeta(f.meta, "category", "NonExistent", "New"));

    expect(results.every((r) => r.updated === false)).toBe(true);
  });

  it("preserves other metadata fields when renaming", () => {
    const files = [
      {
        key: "content/posts/a/index.md",
        meta: {
          title: "A",
          date: "2024-01-01",
          author: "John",
          categories: ["JavaScript"],
          tags: ["react"],
          draft: true,
        },
        body: "content",
      },
    ];

    const result = renameInMeta(files[0].meta, "category", "JavaScript", "JS");

    expect(result.updated).toBe(true);
    expect(result.meta.title).toBe("A");
    expect(result.meta.date).toBe("2024-01-01");
    expect(result.meta.author).toBe("John");
    expect(result.meta.tags).toEqual(["react"]);
    expect(result.meta.draft).toBe(true);
  });
});

describe("merge with deduplication across multiple files", () => {
  it("merges source into target without duplicates when target already exists", () => {
    const files = [
      {
        key: "content/posts/a/index.md",
        meta: { title: "A", categories: ["JavaScript", "JS"], tags: [] },
        body: "",
      },
      {
        key: "content/posts/b/index.md",
        meta: { title: "B", categories: ["JavaScript"], tags: [] },
        body: "",
      },
      {
        key: "content/posts/c/index.md",
        meta: { title: "C", categories: ["JS"], tags: [] },
        body: "",
      },
    ];

    const results = files.map((f) => mergeInMeta(f.meta, "category", "JavaScript", "JS"));

    // File A: had both JavaScript and JS → should deduplicate to just JS
    expect(results[0].updated).toBe(true);
    expect(results[0].meta.categories).toEqual(["JS"]);
    expect(results[0].meta.categories!.filter((c) => c === "JS").length).toBe(1);

    // File B: had JavaScript, not JS → should replace with JS
    expect(results[1].updated).toBe(true);
    expect(results[1].meta.categories).toEqual(["JS"]);

    // File C: had only JS (no source) → should not be updated
    expect(results[2].updated).toBe(false);
    expect(results[2].meta.categories).toEqual(["JS"]);
  });

  it("merges tags with deduplication across multiple files", () => {
    const files = [
      {
        key: "content/posts/a/index.md",
        meta: { title: "A", categories: [], tags: ["react", "reactjs"] },
        body: "",
      },
      {
        key: "content/posts/b/index.md",
        meta: { title: "B", categories: [], tags: ["react", "vue"] },
        body: "",
      },
      {
        key: "content/posts/c/index.md",
        meta: { title: "C", categories: [], tags: ["vue", "angular"] },
        body: "",
      },
    ];

    const results = files.map((f) => mergeInMeta(f.meta, "tag", "react", "reactjs"));

    // File A: had both react and reactjs → should deduplicate to just reactjs
    expect(results[0].updated).toBe(true);
    expect(results[0].meta.tags).toEqual(["reactjs"]);

    // File B: had react but not reactjs → should replace react with reactjs
    expect(results[1].updated).toBe(true);
    expect(results[1].meta.tags).toContain("reactjs");
    expect(results[1].meta.tags).toContain("vue");
    expect(results[1].meta.tags).not.toContain("react");

    // File C: no react → should not be updated
    expect(results[2].updated).toBe(false);
  });

  it("returns no updates when source is not found in any file", () => {
    const files = [
      {
        key: "content/posts/a/index.md",
        meta: { title: "A", categories: ["Web"], tags: [] },
        body: "",
      },
      {
        key: "content/posts/b/index.md",
        meta: { title: "B", categories: ["Python"], tags: [] },
        body: "",
      },
    ];

    const results = files.map((f) => mergeInMeta(f.meta, "category", "NonExistent", "Web"));

    expect(results.every((r) => r.updated === false)).toBe(true);
  });

  it("counts correct number of updated files during merge", () => {
    const files = [
      {
        key: "content/posts/a/index.md",
        meta: { title: "A", categories: ["OldCat"], tags: [] },
        body: "",
      },
      {
        key: "content/posts/b/index.md",
        meta: { title: "B", categories: ["OldCat", "NewCat"], tags: [] },
        body: "",
      },
      {
        key: "content/posts/c/index.md",
        meta: { title: "C", categories: ["NewCat"], tags: [] },
        body: "",
      },
      {
        key: "content/posts/d/index.md",
        meta: { title: "D", categories: ["OldCat"], tags: [] },
        body: "",
      },
    ];

    const results = files.map((f) => mergeInMeta(f.meta, "category", "OldCat", "NewCat"));
    const updatedCount = results.filter((r) => r.updated).length;

    expect(updatedCount).toBe(3); // files a, b, d have OldCat
  });
});

describe("delete removes from all files", () => {
  it("removes a category from all files that contain it", () => {
    const files = [
      {
        key: "content/posts/a/index.md",
        meta: { title: "A", categories: ["JavaScript", "Web"], tags: ["react"] },
        body: "",
      },
      {
        key: "content/posts/b/index.md",
        meta: { title: "B", categories: ["JavaScript"], tags: ["node"] },
        body: "",
      },
      {
        key: "content/posts/c/index.md",
        meta: { title: "C", categories: ["Python"], tags: ["django"] },
        body: "",
      },
    ];

    const results = files.map((f) => deleteFromMeta(f.meta, "category", "JavaScript"));

    // File A: JavaScript removed, Web remains
    expect(results[0].updated).toBe(true);
    expect(results[0].meta.categories).toEqual(["Web"]);

    // File B: JavaScript removed, empty array remains
    expect(results[1].updated).toBe(true);
    expect(results[1].meta.categories).toEqual([]);

    // File C: not affected
    expect(results[2].updated).toBe(false);
    expect(results[2].meta.categories).toEqual(["Python"]);
  });

  it("removes a tag from all files that contain it", () => {
    const files = [
      {
        key: "content/posts/a/index.md",
        meta: { title: "A", categories: [], tags: ["react", "typescript"] },
        body: "",
      },
      {
        key: "content/posts/b/index.md",
        meta: { title: "B", categories: [], tags: ["react", "node"] },
        body: "",
      },
      {
        key: "content/knowledge-base/c/index.md",
        meta: { title: "C", categories: [], tags: ["python"] },
        body: "",
      },
    ];

    const results = files.map((f) => deleteFromMeta(f.meta, "tag", "react"));

    expect(results[0].updated).toBe(true);
    expect(results[0].meta.tags).toEqual(["typescript"]);

    expect(results[1].updated).toBe(true);
    expect(results[1].meta.tags).toEqual(["node"]);

    expect(results[2].updated).toBe(false);
    expect(results[2].meta.tags).toEqual(["python"]);
  });

  it("returns no updates when name is not found in any file", () => {
    const files = [
      {
        key: "content/posts/a/index.md",
        meta: { title: "A", categories: ["Web"], tags: ["react"] },
        body: "",
      },
      {
        key: "content/posts/b/index.md",
        meta: { title: "B", categories: ["Python"], tags: ["django"] },
        body: "",
      },
    ];

    const results = files.map((f) => deleteFromMeta(f.meta, "tag", "nonexistent"));

    expect(results.every((r) => r.updated === false)).toBe(true);
  });

  it("correctly counts the number of files affected by delete", () => {
    const files = [
      {
        key: "content/posts/a/index.md",
        meta: { title: "A", categories: [], tags: ["shared-tag", "unique-a"] },
        body: "",
      },
      {
        key: "content/posts/b/index.md",
        meta: { title: "B", categories: [], tags: ["shared-tag", "unique-b"] },
        body: "",
      },
      {
        key: "content/posts/c/index.md",
        meta: { title: "C", categories: [], tags: ["shared-tag"] },
        body: "",
      },
      {
        key: "content/posts/d/index.md",
        meta: { title: "D", categories: [], tags: ["unique-d"] },
        body: "",
      },
    ];

    const results = files.map((f) => deleteFromMeta(f.meta, "tag", "shared-tag"));
    const updatedCount = results.filter((r) => r.updated).length;

    expect(updatedCount).toBe(3);
    // Verify remaining tags
    expect(results[0].meta.tags).toEqual(["unique-a"]);
    expect(results[1].meta.tags).toEqual(["unique-b"]);
    expect(results[2].meta.tags).toEqual([]);
    expect(results[3].meta.tags).toEqual(["unique-d"]);
  });

  it("does not affect tags when deleting a category", () => {
    const files = [
      {
        key: "content/posts/a/index.md",
        meta: { title: "A", categories: ["JavaScript"], tags: ["JavaScript"] },
        body: "",
      },
    ];

    const result = deleteFromMeta(files[0].meta, "category", "JavaScript");

    expect(result.updated).toBe(true);
    expect(result.meta.categories).toEqual([]);
    // Tag with same name should remain untouched
    expect(result.meta.tags).toEqual(["JavaScript"]);
  });
});

// --- Handler integration tests with mocked S3 ---

function createMockEvent(
  overrides: Partial<APIGatewayProxyEventV2> & { method?: string; path?: string }
): APIGatewayProxyEventV2 {
  const { method = "GET", path = "/api/taxonomy", ...rest } = overrides;
  return {
    version: "2.0",
    routeKey: `${method} ${path}`,
    rawPath: path,
    rawQueryString: "",
    headers: {},
    requestContext: {
      accountId: "123456789",
      apiId: "api-id",
      domainName: "test.execute-api.us-east-1.amazonaws.com",
      domainPrefix: "test",
      http: {
        method,
        path,
        protocol: "HTTP/1.1",
        sourceIp: "127.0.0.1",
        userAgent: "test",
      },
      requestId: "req-123",
      routeKey: `${method} ${path}`,
      stage: "$default",
      time: "01/Jan/2024:00:00:00 +0000",
      timeEpoch: 1704067200000,
    },
    isBase64Encoded: false,
    ...rest,
  } as APIGatewayProxyEventV2;
}

function createMarkdownContent(meta: Record<string, unknown>, body: string): string {
  const yaml = Object.entries(meta)
    .map(([key, value]) => {
      if (Array.isArray(value)) {
        if (value.length === 0) return `${key}: []`;
        return `${key}:\n${value.map((v) => `  - ${v}`).join("\n")}`;
      }
      return `${key}: ${value}`;
    })
    .join("\n");
  return `---\n${yaml}\n---\n\n${body}`;
}

describe("handler integration tests", () => {
  beforeEach(() => {
    mockSend.mockReset();
  });

  it("GET /api/taxonomy returns derived taxonomy from S3 files", async () => {
    const fileA = createMarkdownContent(
      { title: "Post A", categories: ["JavaScript", "Web"], tags: ["react"] },
      "Body A"
    );
    const fileB = createMarkdownContent(
      { title: "Post B", categories: ["JavaScript"], tags: ["react", "node"] },
      "Body B"
    );

    // Mock S3 list and get operations
    mockSend.mockImplementation(
      (command: { _type: string; input: { Prefix?: string; Key?: string } }) => {
        if (command._type === "ListObjectsV2") {
          if (command.input.Prefix === "content/posts/") {
            return Promise.resolve({
              Contents: [{ Key: "content/posts/a/index.md" }, { Key: "content/posts/b/index.md" }],
            });
          }
          // knowledge-base prefix returns empty
          return Promise.resolve({ Contents: [] });
        }
        if (command._type === "GetObject") {
          const content = command.input.Key === "content/posts/a/index.md" ? fileA : fileB;
          return Promise.resolve({
            Body: { transformToString: () => Promise.resolve(content) },
          });
        }
        return Promise.resolve({});
      }
    );

    const event = createMockEvent({ method: "GET", path: "/api/taxonomy" });
    const response = await handler(event);

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body as string);

    // Should have JavaScript (count 2), Web (count 1), node (count 1), react (count 2)
    const jsItem = body.find(
      (t: { name: string; type: string }) => t.name === "JavaScript" && t.type === "category"
    );
    expect(jsItem).toBeDefined();
    expect(jsItem.count).toBe(2);

    const reactItem = body.find(
      (t: { name: string; type: string }) => t.name === "react" && t.type === "tag"
    );
    expect(reactItem).toBeDefined();
    expect(reactItem.count).toBe(2);
  });

  it("PUT /api/taxonomy/rename updates files and returns updated taxonomy", async () => {
    const fileA = createMarkdownContent(
      { title: "Post A", categories: ["JavaScript", "Web"], tags: ["react"] },
      "Body A"
    );
    const fileB = createMarkdownContent(
      { title: "Post B", categories: ["JavaScript"], tags: ["node"] },
      "Body B"
    );

    const writtenFiles: Array<{ key: string; content: string }> = [];

    mockSend.mockImplementation(
      (command: { _type: string; input: { Prefix?: string; Key?: string; Body?: string } }) => {
        if (command._type === "ListObjectsV2") {
          if (command.input.Prefix === "content/posts/") {
            return Promise.resolve({
              Contents: [{ Key: "content/posts/a/index.md" }, { Key: "content/posts/b/index.md" }],
            });
          }
          return Promise.resolve({ Contents: [] });
        }
        if (command._type === "GetObject") {
          const content = command.input.Key === "content/posts/a/index.md" ? fileA : fileB;
          return Promise.resolve({
            Body: { transformToString: () => Promise.resolve(content) },
          });
        }
        if (command._type === "PutObject") {
          writtenFiles.push({ key: command.input.Key!, content: command.input.Body! });
          return Promise.resolve({});
        }
        return Promise.resolve({});
      }
    );

    const event = createMockEvent({
      method: "PUT",
      path: "/api/taxonomy/rename",
      body: JSON.stringify({ type: "category", oldName: "JavaScript", newName: "JS" }),
    });

    const response = await handler(event);

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body as string);
    expect(body.updated).toBe(2); // Both files had JavaScript

    // Verify files were written with updated content
    expect(writtenFiles.length).toBe(2);
    for (const file of writtenFiles) {
      const parsed = parseFrontmatter(file.content);
      expect(parsed.meta.categories).toContain("JS");
      expect(parsed.meta.categories).not.toContain("JavaScript");
    }
  });

  it("PUT /api/taxonomy/merge deduplicates correctly via handler", async () => {
    // File A has both "react" and "reactjs" - merging react into reactjs should deduplicate
    const fileA = createMarkdownContent(
      { title: "Post A", categories: [], tags: ["react", "reactjs"] },
      "Body A"
    );
    // File B only has "react" - should get "reactjs" added
    const fileB = createMarkdownContent(
      { title: "Post B", categories: [], tags: ["react", "vue"] },
      "Body B"
    );

    const writtenFiles: Array<{ key: string; content: string }> = [];

    mockSend.mockImplementation(
      (command: { _type: string; input: { Prefix?: string; Key?: string; Body?: string } }) => {
        if (command._type === "ListObjectsV2") {
          if (command.input.Prefix === "content/posts/") {
            return Promise.resolve({
              Contents: [{ Key: "content/posts/a/index.md" }, { Key: "content/posts/b/index.md" }],
            });
          }
          return Promise.resolve({ Contents: [] });
        }
        if (command._type === "GetObject") {
          const content = command.input.Key === "content/posts/a/index.md" ? fileA : fileB;
          return Promise.resolve({
            Body: { transformToString: () => Promise.resolve(content) },
          });
        }
        if (command._type === "PutObject") {
          writtenFiles.push({ key: command.input.Key!, content: command.input.Body! });
          return Promise.resolve({});
        }
        return Promise.resolve({});
      }
    );

    const event = createMockEvent({
      method: "PUT",
      path: "/api/taxonomy/merge",
      body: JSON.stringify({ type: "tag", source: "react", target: "reactjs" }),
    });

    const response = await handler(event);

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body as string);
    expect(body.updated).toBe(2);

    // Verify file A: had both, should now only have reactjs (deduplicated)
    const fileAWritten = writtenFiles.find((f) => f.key === "content/posts/a/index.md");
    expect(fileAWritten).toBeDefined();
    const parsedA = parseFrontmatter(fileAWritten!.content);
    expect(parsedA.meta.tags).toEqual(["reactjs"]);

    // Verify file B: had react, should now have reactjs and vue
    const fileBWritten = writtenFiles.find((f) => f.key === "content/posts/b/index.md");
    expect(fileBWritten).toBeDefined();
    const parsedB = parseFrontmatter(fileBWritten!.content);
    expect(parsedB.meta.tags).toContain("reactjs");
    expect(parsedB.meta.tags).toContain("vue");
    expect(parsedB.meta.tags).not.toContain("react");
  });

  it("DELETE /api/taxonomy/{name} removes from all files via handler", async () => {
    const fileA = createMarkdownContent(
      { title: "Post A", categories: ["JavaScript", "Web"], tags: [] },
      "Body A"
    );
    const fileB = createMarkdownContent(
      { title: "Post B", categories: ["JavaScript"], tags: [] },
      "Body B"
    );
    const fileC = createMarkdownContent(
      { title: "Post C", categories: ["Python"], tags: [] },
      "Body C"
    );

    const writtenFiles: Array<{ key: string; content: string }> = [];

    mockSend.mockImplementation(
      (command: { _type: string; input: { Prefix?: string; Key?: string; Body?: string } }) => {
        if (command._type === "ListObjectsV2") {
          if (command.input.Prefix === "content/posts/") {
            return Promise.resolve({
              Contents: [
                { Key: "content/posts/a/index.md" },
                { Key: "content/posts/b/index.md" },
                { Key: "content/posts/c/index.md" },
              ],
            });
          }
          return Promise.resolve({ Contents: [] });
        }
        if (command._type === "GetObject") {
          const key = command.input.Key!;
          if (key.includes("/a/"))
            return Promise.resolve({ Body: { transformToString: () => Promise.resolve(fileA) } });
          if (key.includes("/b/"))
            return Promise.resolve({ Body: { transformToString: () => Promise.resolve(fileB) } });
          return Promise.resolve({ Body: { transformToString: () => Promise.resolve(fileC) } });
        }
        if (command._type === "PutObject") {
          writtenFiles.push({ key: command.input.Key!, content: command.input.Body! });
          return Promise.resolve({});
        }
        return Promise.resolve({});
      }
    );

    const event = createMockEvent({
      method: "DELETE",
      path: "/api/taxonomy/JavaScript",
      queryStringParameters: { type: "category" },
    });

    const response = await handler(event);

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body as string);
    expect(body.updated).toBe(2); // Files A and B had JavaScript

    // Verify written files don't contain JavaScript
    for (const file of writtenFiles) {
      const parsed = parseFrontmatter(file.content);
      expect(parsed.meta.categories).not.toContain("JavaScript");
    }
  });

  it("returns 400 for invalid rename request (missing fields)", async () => {
    const event = createMockEvent({
      method: "PUT",
      path: "/api/taxonomy/rename",
      body: JSON.stringify({ type: "category", oldName: "JavaScript" }), // missing newName
    });

    const response = await handler(event);
    expect(response.statusCode).toBe(400);
    const body = JSON.parse(response.body as string);
    expect(body.code).toBe("VALIDATION_ERROR");
  });

  it("returns 400 for invalid merge request (same source and target)", async () => {
    const event = createMockEvent({
      method: "PUT",
      path: "/api/taxonomy/merge",
      body: JSON.stringify({ type: "tag", source: "react", target: "react" }),
    });

    const response = await handler(event);
    expect(response.statusCode).toBe(400);
    const body = JSON.parse(response.body as string);
    expect(body.code).toBe("VALIDATION_ERROR");
  });

  it("returns 400 for delete without type query parameter", async () => {
    const event = createMockEvent({
      method: "DELETE",
      path: "/api/taxonomy/JavaScript",
    });

    const response = await handler(event);
    expect(response.statusCode).toBe(400);
    const body = JSON.parse(response.body as string);
    expect(body.code).toBe("VALIDATION_ERROR");
  });

  it("returns 400 for unknown endpoint", async () => {
    const event = createMockEvent({
      method: "POST",
      path: "/api/taxonomy/unknown",
    });

    const response = await handler(event);
    expect(response.statusCode).toBe(400);
    const body = JSON.parse(response.body as string);
    expect(body.code).toBe("INVALID_PATH");
  });
});

/**
 * Blocking commits for taxonomy (content-storage stage 4).
 *
 * A taxonomy rename/merge/delete rewrites many files and must land as one atomic commit
 * (criterion 4.7). Under blocking commits that commit now comes before any projection
 * write: the edit is not real until git has it. The tests above use the hoisted static
 * S3 mock and the real git provider (which skips), so none of them sees a commit
 * outcome. This block drives the provider directly to prove a failed commit writes
 * nothing to S3, and that a successful change is one commitFiles call followed by the
 * S3 writes — not the other way round.
 */
describe("blocking commits", () => {
  async function loadWithGit(commitResult: unknown) {
    vi.resetModules();
    const order: string[] = [];
    const s3Send = vi.fn().mockImplementation((cmd: { _type?: string; input?: unknown }) => {
      if (cmd._type === "PutObject") order.push("s3-put");
      if (cmd._type === "ListObjectsV2") {
        const prefix = (cmd.input as { Prefix?: string })?.Prefix;
        if (prefix === "content/posts/") {
          return Promise.resolve({ Contents: [{ Key: "content/posts/a/index.md" }] });
        }
        return Promise.resolve({ Contents: [] });
      }
      if (cmd._type === "GetObject") {
        const md = `---\ntitle: Post A\ncategories:\n  - OldCat\ntags: []\n---\n\nBody.`;
        return Promise.resolve({ Body: { transformToString: () => Promise.resolve(md) } });
      }
      return Promise.resolve({});
    });

    vi.doMock("@aws-sdk/client-s3", () => ({
      S3Client: class {
        send = s3Send;
      },
      ListObjectsV2Command: class {
        _type = "ListObjectsV2";
        constructor(public input: unknown) {}
      },
      GetObjectCommand: class {
        _type = "GetObject";
        constructor(public input: unknown) {}
      },
      PutObjectCommand: class {
        _type = "PutObject";
        constructor(public input: unknown) {}
      },
    }));

    const actual = await vi.importActual<typeof import("../shared/git")>("../shared/git");
    const commitFiles = vi.fn().mockImplementation(async () => {
      order.push("commit");
      return commitResult;
    });
    vi.doMock("../shared/git", () => ({
      ...actual,
      createGitProvider: () => ({
        s3KeyToRepoPath: (k: string) => k,
        commitUpsert: async () => commitResult,
        commitDelete: async () => commitResult,
        commitFiles,
        listFileCommits: async () => [],
        getFileAtRef: async () => null,
      }),
    }));

    const mod = await import("./index");
    return { handler: mod.handler, s3Send, commitFiles, order };
  }

  const renameEvent = {
    rawPath: "/api/taxonomy/rename",
    requestContext: { http: { method: "PUT" } },
    headers: {},
    body: JSON.stringify({ type: "category", oldName: "OldCat", newName: "NewCat" }),
    isBase64Encoded: false,
  } as unknown as APIGatewayProxyEventV2;

  it("returns 502 and writes nothing to S3 when the commit fails", async () => {
    const { handler, s3Send } = await loadWithGit({
      committed: false,
      error: "403: insufficient_scope",
    });

    const result = await handler(renameEvent);

    expect(result.statusCode).toBe(502);
    expect(JSON.parse(result.body as string).code).toBe("GIT_COMMIT_FAILED");
    const put = s3Send.mock.calls.some((c) => (c[0] as { _type?: string })?._type === "PutObject");
    expect(put).toBe(false);
  });

  it("commits once, then writes the projection", async () => {
    const { handler, commitFiles, order } = await loadWithGit({ committed: true });

    const result = await handler(renameEvent);

    expect(result.statusCode).toBe(200);
    // Exactly one atomic commit for the whole rename (criterion 4.7).
    expect(commitFiles).toHaveBeenCalledTimes(1);
    // And it preceded the projection write.
    expect(order[0]).toBe("commit");
    expect(order).toContain("s3-put");
    expect(order.indexOf("commit")).toBeLessThan(order.indexOf("s3-put"));
  });

  it("reports projection writes behind when the commit succeeded but an S3 write failed", async () => {
    // Commit succeeds; the projection write throws. The change is authoritative in git,
    // so the handler reports a 207 (partial) rather than failing.
    vi.resetModules();
    const s3Send = vi.fn().mockImplementation((cmd: { _type?: string; input?: unknown }) => {
      if (cmd._type === "PutObject") return Promise.reject(new Error("S3 down"));
      if (cmd._type === "ListObjectsV2") {
        const prefix = (cmd.input as { Prefix?: string })?.Prefix;
        return Promise.resolve({
          Contents: prefix === "content/posts/" ? [{ Key: "content/posts/a/index.md" }] : [],
        });
      }
      if (cmd._type === "GetObject") {
        const md = `---\ntitle: Post A\ncategories:\n  - OldCat\ntags: []\n---\n\nBody.`;
        return Promise.resolve({ Body: { transformToString: () => Promise.resolve(md) } });
      }
      return Promise.resolve({});
    });
    vi.doMock("@aws-sdk/client-s3", () => ({
      S3Client: class {
        send = s3Send;
      },
      ListObjectsV2Command: class {
        _type = "ListObjectsV2";
        constructor(public input: unknown) {}
      },
      GetObjectCommand: class {
        _type = "GetObject";
        constructor(public input: unknown) {}
      },
      PutObjectCommand: class {
        _type = "PutObject";
        constructor(public input: unknown) {}
      },
    }));
    const actual = await vi.importActual<typeof import("../shared/git")>("../shared/git");
    vi.doMock("../shared/git", () => ({
      ...actual,
      createGitProvider: () => ({
        s3KeyToRepoPath: (k: string) => k,
        commitUpsert: async () => ({ committed: true }),
        commitDelete: async () => ({ committed: true }),
        commitFiles: async () => ({ committed: true }),
        listFileCommits: async () => [],
        getFileAtRef: async () => null,
      }),
    }));

    const mod = await import("./index");
    const result = await mod.handler(renameEvent);

    // Committed, but one projection write is behind — partial success, not failure.
    expect(result.statusCode).toBe(207);
    const body = JSON.parse(result.body as string);
    expect(body.failed).toBe(1);
  });
});
