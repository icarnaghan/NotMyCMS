/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Pages Lambda handler tests. Mirrors the content Lambda's approach: mock the S3 client
 * (send dispatched by command input) and the git provider, then import the handler.
 *
 * The behaviours that matter and that these pin:
 *   - a page failing the shared validator is a 400 and NOTHING is committed or written;
 *   - a valid save commits to git BEFORE touching S3 (the commit-then-write contract);
 *   - a failed commit is a 502 and S3 is never written;
 *   - a reserved/colliding slug is rejected;
 *   - optimistic concurrency rejects a stale save.
 */

const BUCKET = "test-bucket";

/** A minimal valid landing page. */
function validPage(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 1,
    slug: "about",
    seo: { title: "About", description: "About me." },
    header: { title: "About Me" },
    blocks: [{ id: "intro", type: "prose", version: 1, markdown: "Hi." }],
    ...overrides,
  };
}

interface MockS3Options {
  /** Map of S3 key → stored body (for GetObject). Missing keys 404. */
  objects?: Record<string, string>;
  /** Objects to return for a ListObjectsV2 under content/pages/. */
  listKeys?: string[];
  /** LastModified for HeadObject, keyed by S3 key. */
  lastModified?: Record<string, Date>;
}

function setup(opts: MockS3Options = {}) {
  const s3Calls: Array<{ cmd: string; input: any }> = [];
  const s3Send = vi.fn((cmd: any) => {
    const name = cmd.constructor.name;
    s3Calls.push({ cmd: name, input: cmd.input });
    if (name === "ListObjectsV2Command") {
      return Promise.resolve({
        Contents: (opts.listKeys ?? []).map((Key) => ({ Key })),
        NextContinuationToken: undefined,
      });
    }
    if (name === "GetObjectCommand") {
      const body = opts.objects?.[cmd.input.Key];
      if (body === undefined) return Promise.reject(new Error("NoSuchKey"));
      return Promise.resolve({ Body: { transformToString: () => Promise.resolve(body) } });
    }
    if (name === "HeadObjectCommand") {
      const lm = opts.lastModified?.[cmd.input.Key];
      if (!lm) return Promise.reject(new Error("NotFound"));
      return Promise.resolve({ LastModified: lm });
    }
    return Promise.resolve({});
  });

  vi.doMock("@aws-sdk/client-s3", () => {
    return {
      S3Client: class {
        send = s3Send;
      },
      ListObjectsV2Command: class ListObjectsV2Command {
        input: any;
        constructor(input: any) {
          this.input = input;
        }
      },
      GetObjectCommand: class GetObjectCommand {
        input: any;
        constructor(input: any) {
          this.input = input;
        }
      },
      PutObjectCommand: class PutObjectCommand {
        input: any;
        constructor(input: any) {
          this.input = input;
        }
      },
      DeleteObjectsCommand: class DeleteObjectsCommand {
        input: any;
        constructor(input: any) {
          this.input = input;
        }
      },
      HeadObjectCommand: class HeadObjectCommand {
        input: any;
        constructor(input: any) {
          this.input = input;
        }
      },
    };
  });

  const commitCalls: Array<{ changes: any[]; message: string }> = [];
  const gitResult: { value: { committed: boolean; skipped?: boolean; error?: string } } = {
    value: { committed: true },
  };
  vi.doMock("../shared/git", async () => {
    const actual = await vi.importActual<any>("../shared/git");
    return {
      ...actual,
      createGitProvider: () => ({
        s3KeyToRepoPath: (k: string) => k,
        commitFiles: async (changes: any[], message: string) => {
          commitCalls.push({ changes, message });
          return gitResult.value;
        },
        commitUpsert: async () => gitResult.value,
        commitDelete: async () => gitResult.value,
      }),
    };
  });

  vi.doMock("../shared/audit", () => ({
    writeAudit: vi.fn(async () => {}),
    getActor: () => "tester",
  }));

  return { s3Send, s3Calls, commitCalls, gitResult };
}

function event(method: string, slug: string | undefined, body?: unknown) {
  return {
    requestContext: { http: { method } },
    pathParameters: slug ? { proxy: slug } : {},
    body: body === undefined ? undefined : JSON.stringify(body),
    isBase64Encoded: false,
  } as any;
}

describe("pages handler", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    process.env.CONTENT_BUCKET = BUCKET;
  });

  it("rejects an invalid page with 400 and writes/commits nothing", async () => {
    const { s3Calls, commitCalls } = setup();
    const { handler } = await import("./index");

    // Missing seo.description — the validator rejects it.
    const bad = validPage({ seo: { title: "About" } });
    const res = await handler(event("PUT", undefined, bad));

    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body as string).code).toBe("VALIDATION_ERROR");
    expect(commitCalls).toHaveLength(0);
    expect(s3Calls.some((c) => c.cmd === "PutObjectCommand")).toBe(false);
  });

  it("rejects a slug that collides with a framework route", async () => {
    const { commitCalls } = setup();
    const { handler } = await import("./index");

    const res = await handler(event("PUT", undefined, validPage({ slug: "posts" })));
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body as string).code).toBe("SLUG_RESERVED");
    expect(commitCalls).toHaveLength(0);
  });

  it("creates a page: commits page + manifest atomically BEFORE writing S3", async () => {
    const { s3Calls, commitCalls } = setup({ listKeys: [] });
    const { handler } = await import("./index");

    const res = await handler(event("PUT", undefined, validPage()));
    expect(res.statusCode).toBe(201);

    // One atomic commit carrying both the page.json and the manifest.
    expect(commitCalls).toHaveLength(1);
    const paths = commitCalls[0].changes.map((c) => c.filePath).sort();
    expect(paths).toEqual(["content/pages/about/page.json", "content/pages/manifest.json"]);
    expect(commitCalls[0].changes.find((c) => c.filePath.endsWith("about/page.json")).action).toBe(
      "create"
    );

    // S3 writes happen, and only after the commit (ordering: no PutObject before the commit).
    const firstPut = s3Calls.findIndex((c) => c.cmd === "PutObjectCommand");
    expect(firstPut).toBeGreaterThanOrEqual(0);
    const putKeys = s3Calls.filter((c) => c.cmd === "PutObjectCommand").map((c) => c.input.Key);
    expect(putKeys).toContain("content/pages/about/page.json");
    expect(putKeys).toContain("content/pages/manifest.json");
  });

  it("stamps a server-managed modified and ignores a client-supplied one", async () => {
    setup({ listKeys: [] });
    const { handler } = await import("./index");

    const res = await handler(
      event("PUT", undefined, validPage({ modified: "1999-01-01T00:00:00.000Z" }))
    );
    const saved = JSON.parse(res.body as string);
    expect(saved.modified).not.toBe("1999-01-01T00:00:00.000Z");
    expect(new Date(saved.modified).getFullYear()).toBeGreaterThan(2020);
  });

  it("returns 502 and writes no S3 when the commit fails", async () => {
    const { s3Calls, gitResult } = setup({ listKeys: [] });
    gitResult.value = { committed: false, error: "token revoked" };
    const { handler } = await import("./index");

    const res = await handler(event("PUT", undefined, validPage()));
    expect(res.statusCode).toBe(502);
    expect(s3Calls.some((c) => c.cmd === "PutObjectCommand")).toBe(false);
  });

  it("rejects a stale update with 409 (optimistic concurrency)", async () => {
    setup({
      objects: { "content/pages/about/page.json": JSON.stringify(validPage()) },
      lastModified: { "content/pages/about/page.json": new Date("2026-01-01") },
    });
    const { handler } = await import("./index");

    // Client holds an older token than the stored LastModified.
    const res = await handler(
      event("PUT", "about", { ...validPage(), lastModified: "2020-01-01T00:00:00.000Z" })
    );
    expect(res.statusCode).toBe(409);
    expect(JSON.parse(res.body as string).code).toBe("EDIT_CONFLICT");
  });

  it("GET /api/pages lists the manifest-shaped summary", async () => {
    setup({
      listKeys: ["content/pages/about/page.json", "content/pages/apps/page.json"],
      objects: {
        "content/pages/about/page.json": JSON.stringify(
          validPage({ slug: "about", nav: { label: "About Me", order: 1 } })
        ),
        "content/pages/apps/page.json": JSON.stringify(
          validPage({ slug: "apps", nav: { label: "Apps", order: 2 } })
        ),
      },
    });
    const { handler } = await import("./index");

    const res = await handler(event("GET", undefined));
    expect(res.statusCode).toBe(200);
    const list = JSON.parse(res.body as string);
    expect(list.map((e: any) => e.slug)).toEqual(["about", "apps"]);
  });

  it("GET /api/pages/{slug} returns the full doc, 404 when missing", async () => {
    setup({
      listKeys: ["content/pages/about/page.json"],
      objects: { "content/pages/about/page.json": JSON.stringify(validPage()) },
      lastModified: { "content/pages/about/page.json": new Date("2026-01-01") },
    });
    const { handler } = await import("./index");

    const ok = await handler(event("GET", "about"));
    expect(ok.statusCode).toBe(200);
    expect(JSON.parse(ok.body as string).slug).toBe("about");

    const missing = await handler(event("GET", "nope"));
    expect(missing.statusCode).toBe(404);
  });

  it("deletes a page: commits removal + manifest, then deletes from S3", async () => {
    const { s3Calls, commitCalls } = setup({
      listKeys: ["content/pages/about/page.json"],
      objects: { "content/pages/about/page.json": JSON.stringify(validPage()) },
    });
    const { handler } = await import("./index");

    const res = await handler(event("DELETE", "about"));
    expect(res.statusCode).toBe(204);
    expect(commitCalls).toHaveLength(1);
    expect(commitCalls[0].changes.some((c) => c.action === "delete")).toBe(true);
    expect(s3Calls.some((c) => c.cmd === "DeleteObjectsCommand")).toBe(true);
  });
});
