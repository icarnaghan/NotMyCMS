/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { APIGatewayProxyEventV2 } from "aws-lambda";

// Set environment variables before importing handler
process.env.CONTENT_BUCKET = "test-bucket";
process.env.AWS_LAMBDA_FUNCTION_NAME = "carnaghan-admin-deploy";
process.env.ALERT_TOPIC_ARN = "arn:aws:sns:us-east-1:123456789012:carnaghan-admin-alerts";
// Site identity, injected by the stack from site.config.json in production.
// Deliberately not this site's values — the Lambda should work for any deployment,
// and a test that passed only with the real domain would hide a regression.
process.env.SITE_URL = "https://www.example.test";
process.env.SITE_ALIAS = "www.example.test";
process.env.SITE_NAME = "Example Site";
process.env.SITE_DESCRIPTION = "An example description";
process.env.SITE_LOCALE = "en-us";

function makeEvent(method: string, path: string): APIGatewayProxyEventV2 {
  return {
    rawPath: path,
    requestContext: {
      http: { method },
    },
    headers: {},
    isBase64Encoded: false,
  } as unknown as APIGatewayProxyEventV2;
}

describe("DeployLambda", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  function createMocks() {
    const mockS3Send = vi.fn();
    const mockCfSend = vi.fn();
    const mockLambdaSend = vi.fn();

    // Commands carry a discriminator so the mock send can respond by type,
    // which keeps tests robust to the concurrent (Promise.all) calls in the
    // regeneration worker.
    vi.doMock("@aws-sdk/client-s3", () => ({
      S3Client: class {
        send = mockS3Send;
      },
      GetObjectCommand: class {
        readonly _t = "get";
        constructor(public input: unknown) {}
      },
      PutObjectCommand: class {
        readonly _t = "put";
        constructor(public input: unknown) {}
      },
      DeleteObjectCommand: class {
        readonly _t = "delete";
        constructor(public input: unknown) {}
      },
      ListObjectsV2Command: class {
        readonly _t = "list";
        constructor(public input: unknown) {}
      },
    }));

    vi.doMock("@aws-sdk/client-cloudfront", () => ({
      CloudFrontClient: class {
        send = mockCfSend;
      },
      ListDistributionsCommand: class {
        readonly _t = "listDist";
        constructor(public input: unknown) {}
      },
      CreateInvalidationCommand: class {
        readonly _t = "invalidate";
        constructor(public input: unknown) {}
      },
    }));

    vi.doMock("@aws-sdk/client-lambda", () => ({
      LambdaClient: class {
        send = mockLambdaSend;
      },
      InvokeCommand: class {
        readonly _t = "invoke";
        constructor(public input: unknown) {}
      },
    }));

    const mockSnsSend = vi.fn().mockResolvedValue({});
    vi.doMock("@aws-sdk/client-sns", () => ({
      SNSClient: class {
        send = mockSnsSend;
      },
      PublishCommand: class {
        readonly _t = "publish";
        constructor(public input: unknown) {}
      },
    }));

    return { mockS3Send, mockCfSend, mockLambdaSend, mockSnsSend };
  }

  function makeS3Body(data: unknown) {
    return {
      Body: {
        transformToString: () => Promise.resolve(JSON.stringify(data)),
      },
    };
  }

  function makeS3Text(text: string) {
    return { Body: { transformToString: () => Promise.resolve(text) } };
  }

  /**
   * CloudFront with a distribution whose alias matches SITE_ALIAS. Without this the
   * Lambda finds no distribution, logs that it is skipping, and creates no invalidation
   * — so any test asserting on invalidation paths needs it.
   */
  function mockCfWithDistribution(mockCfSend: any) {
    mockCfSend.mockImplementation((cmd: any) => {
      if (cmd._t === "listDist")
        return Promise.resolve({
          DistributionList: { Items: [{ Id: "D1", Aliases: { Items: ["www.example.test"] } }] },
        });
      return Promise.resolve({});
    });
  }

  /**
   * A stand-in for the deployed SPA shell. Carries the title and canonical that the
   * per-page head replaces, and nothing else — the body is irrelevant to the swap.
   */
  const SHELL_HTML =
    `<!doctype html><html><head><title>example.test</title>` +
    `<link rel="canonical" href="https://www.example.test" />` +
    `</head><body><div id="root"></div></body></html>`;

  /**
   * The GetObject responses publishArtifacts needs: the deploy status, the two live
   * manifests it diffs the prerendered pages against, and the shell itself.
   */
  function respondToGet(cmd: any, status: unknown) {
    const key = cmd.input?.Key as string | undefined;
    if (key === "index.html") return Promise.resolve(makeS3Text(SHELL_HTML));
    if (key?.endsWith("manifest.json")) return Promise.resolve(makeS3Body([]));
    return Promise.resolve(makeS3Body(status));
  }

  function noSuchKey() {
    const err = new Error("NoSuchKey");
    (err as any).name = "NoSuchKey";
    return err;
  }

  describe("GET /api/deploy/status", () => {
    it("returns idle status when no deploy-status.json exists", async () => {
      const { mockS3Send } = createMocks();
      mockS3Send.mockImplementation((cmd: any) =>
        cmd._t === "get" ? Promise.reject(noSuchKey()) : Promise.resolve({})
      );

      const { handler } = await import("./index");
      const result = (await handler(makeEvent("GET", "/api/deploy/status"))) as any;

      expect(result.statusCode).toBe(200);
      expect(JSON.parse(result.body).status).toBe("idle");
    });

    it("returns the existing status from S3 without contacting CodeBuild", async () => {
      const { mockS3Send } = createMocks();
      const status = {
        status: "success",
        startedAt: "2024-01-01T00:00:00.000Z",
        completedAt: "2024-01-01T00:05:00.000Z",
      };
      mockS3Send.mockImplementation((cmd: any) =>
        cmd._t === "get" ? Promise.resolve(makeS3Body(status)) : Promise.resolve({})
      );

      const { handler } = await import("./index");
      const result = (await handler(makeEvent("GET", "/api/deploy/status"))) as any;

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.status).toBe("success");
      expect(body.completedAt).toBe("2024-01-01T00:05:00.000Z");
    });

    it("returns the raw building status (no synchronous status transition)", async () => {
      const { mockS3Send } = createMocks();
      const status = { status: "building", startedAt: "2024-01-01T00:00:00.000Z" };
      mockS3Send.mockImplementation((cmd: any) =>
        cmd._t === "get" ? Promise.resolve(makeS3Body(status)) : Promise.resolve({})
      );

      const { handler } = await import("./index");
      const result = (await handler(makeEvent("GET", "/api/deploy/status"))) as any;

      expect(result.statusCode).toBe(200);
      expect(JSON.parse(result.body).status).toBe("building");
    });
  });

  describe("POST /api/deploy", () => {
    it("starts a deployment and asynchronously invokes the worker when idle", async () => {
      const { mockS3Send, mockLambdaSend } = createMocks();
      mockS3Send.mockImplementation((cmd: any) =>
        cmd._t === "get" ? Promise.resolve(makeS3Body({ status: "idle" })) : Promise.resolve({})
      );
      mockLambdaSend.mockResolvedValue({});

      const { handler } = await import("./index");
      const result = (await handler(makeEvent("POST", "/api/deploy"))) as any;

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.status).toBe("building");
      expect(body.startedAt).toBeDefined();
      // The heavy work is delegated via an async self-invocation.
      expect(mockLambdaSend).toHaveBeenCalledTimes(1);
      const invokeInput = (mockLambdaSend.mock.calls[0][0] as any).input;
      expect(invokeInput.InvocationType).toBe("Event");
    });

    it("starts a deployment after a previous success", async () => {
      const { mockS3Send, mockLambdaSend } = createMocks();
      mockS3Send.mockImplementation((cmd: any) =>
        cmd._t === "get" ? Promise.resolve(makeS3Body({ status: "success" })) : Promise.resolve({})
      );
      mockLambdaSend.mockResolvedValue({});

      const { handler } = await import("./index");
      const result = (await handler(makeEvent("POST", "/api/deploy"))) as any;

      expect(result.statusCode).toBe(200);
      expect(JSON.parse(result.body).status).toBe("building");
    });

    it("starts a deployment when no status file exists (first deploy)", async () => {
      const { mockS3Send, mockLambdaSend } = createMocks();
      mockS3Send.mockImplementation((cmd: any) =>
        cmd._t === "get" ? Promise.reject(noSuchKey()) : Promise.resolve({})
      );
      mockLambdaSend.mockResolvedValue({});

      const { handler } = await import("./index");
      const result = (await handler(makeEvent("POST", "/api/deploy"))) as any;

      expect(result.statusCode).toBe(200);
      expect(JSON.parse(result.body).status).toBe("building");
      expect(mockLambdaSend).toHaveBeenCalledTimes(1);
    });

    it("rejects a deployment when one is already building", async () => {
      const { mockS3Send, mockLambdaSend } = createMocks();
      // A freshly-started in-progress deploy (not stale) must block a new one.
      mockS3Send.mockImplementation((cmd: any) =>
        cmd._t === "get"
          ? Promise.resolve(makeS3Body({ status: "building", startedAt: new Date().toISOString() }))
          : Promise.resolve({})
      );

      const { handler } = await import("./index");
      const result = (await handler(makeEvent("POST", "/api/deploy"))) as any;

      expect(result.statusCode).toBe(409);
      expect(JSON.parse(result.body).code).toBe("DEPLOY_IN_PROGRESS");
      expect(mockLambdaSend).not.toHaveBeenCalled();
    });

    it("supersedes a stale in-progress deploy instead of wedging", async () => {
      const { mockS3Send, mockLambdaSend } = createMocks();
      // An in-progress status from long ago (lost worker invocation) is stale
      // and must not block a new deploy.
      mockS3Send.mockImplementation((cmd: any) =>
        cmd._t === "get"
          ? Promise.resolve(
              makeS3Body({ status: "building", startedAt: "2024-01-01T00:00:00.000Z" })
            )
          : Promise.resolve({})
      );

      const { handler } = await import("./index");
      const result = (await handler(makeEvent("POST", "/api/deploy"))) as any;

      expect(result.statusCode).toBe(200);
      expect(JSON.parse(result.body).status).toBe("building");
      expect(mockLambdaSend).toHaveBeenCalledTimes(1);
    });

    it("rejects a deployment when one is deploying", async () => {
      const { mockS3Send } = createMocks();
      mockS3Send.mockImplementation((cmd: any) =>
        cmd._t === "get"
          ? Promise.resolve(
              makeS3Body({ status: "deploying", startedAt: new Date().toISOString() })
            )
          : Promise.resolve({})
      );

      const { handler } = await import("./index");
      const result = (await handler(makeEvent("POST", "/api/deploy"))) as any;

      expect(result.statusCode).toBe(409);
      expect(JSON.parse(result.body).code).toBe("DEPLOY_IN_PROGRESS");
    });
  });

  describe("regeneration worker (async self-invocation)", () => {
    it("regenerates artifacts, invalidates CloudFront, and marks success", async () => {
      const { mockS3Send, mockCfSend } = createMocks();

      mockS3Send.mockImplementation((cmd: any) => {
        if (cmd._t === "get")
          return respondToGet(cmd, { status: "building", startedAt: "2024-01-01T00:00:00.000Z" });
        if (cmd._t === "list") return Promise.resolve({ Contents: [] });
        return Promise.resolve({}); // put
      });
      mockCfSend.mockImplementation((cmd: any) => {
        if (cmd._t === "listDist")
          return Promise.resolve({
            DistributionList: {
              Items: [{ Id: "D1", Aliases: { Items: ["www.example.test"] } }],
            },
          });
        return Promise.resolve({});
      });

      const { handler } = await import("./index");
      const result = await handler({ action: "regenerate" } as any);

      // Worker invocations return void, not an HTTP response.
      expect(result).toBeUndefined();

      // CloudFront invalidation was created.
      const invalidateCalls = mockCfSend.mock.calls.filter(
        (c) => (c[0] as any)._t === "invalidate"
      );
      expect(invalidateCalls.length).toBe(1);

      // The final status written to the status file is "success".
      const statusPuts = mockS3Send.mock.calls.filter(
        (c) => (c[0] as any)._t === "put" && (c[0] as any).input.Key === "admin/deploy-status.json"
      );
      const lastStatusBody = JSON.parse((statusPuts[statusPuts.length - 1][0] as any).input.Body);
      expect(lastStatusBody.status).toBe("success");

      // A history entry was appended.
      const historyPuts = mockS3Send.mock.calls.filter(
        (c) => (c[0] as any)._t === "put" && (c[0] as any).input.Key === "admin/deploy-history.json"
      );
      expect(historyPuts.length).toBe(1);
      const historyBody = JSON.parse((historyPuts[0][0] as any).input.Body);
      expect(Array.isArray(historyBody)).toBe(true);
      expect(historyBody[0].status).toBe("success");
    });

    /**
     * End to end through the worker, because the unit tests for diffMetaPages and
     * buildMetaHtml would both pass with publishArtifacts never calling either.
     */
    it("writes a prerendered page for a newly published post", async () => {
      const { mockS3Send, mockCfSend } = createMocks();
      const md = `---\ntitle: Fresh Post\ndate: 2020-01-01\ndescription: Fresh desc\nauthor: Someone\n---\n\nBody.`;

      mockS3Send.mockImplementation((cmd: any) => {
        if (cmd._t === "get") {
          const key = cmd.input.Key as string;
          if (key === "index.html") return Promise.resolve(makeS3Text(SHELL_HTML));
          if (key === "content/posts/fresh-post/index.md") return Promise.resolve(makeS3Text(md));
          if (key.endsWith("manifest.json")) return Promise.resolve(makeS3Body([]));
          return Promise.resolve(makeS3Body({ status: "building", startedAt: "2024-01-01" }));
        }
        if (cmd._t === "list")
          return Promise.resolve({
            Contents:
              cmd.input.Prefix === "content/posts/"
                ? [{ Key: "content/posts/fresh-post/index.md" }]
                : [],
          });
        return Promise.resolve({});
      });
      mockCfWithDistribution(mockCfSend);

      const { handler } = await import("./index");
      await handler({ action: "regenerate" } as any);

      const metaPut = mockS3Send.mock.calls.find(
        (c: any[]) =>
          (c[0] as any)._t === "put" && (c[0] as any).input.Key === "fresh-post/index.html"
      );
      expect(metaPut).toBeDefined();

      const put = (metaPut![0] as any).input;
      expect(put.ContentType).toBe("text/html");
      expect(put.Body).toContain("<title>Fresh Post | Example Site</title>");
      expect(put.Body).toContain('content="Fresh desc"');
      expect(put.Body).toContain(
        '<link rel="canonical" href="https://www.example.test/fresh-post" />'
      );

      // The path has to be invalidated or CloudFront keeps serving the old head.
      const invalidation = mockCfSend.mock.calls.find(
        (c: any[]) => (c[0] as any)._t === "invalidate"
      );
      expect(invalidation![0].input.InvalidationBatch.Paths.Items).toContain(
        "/fresh-post/index.html"
      );
    });

    it("prerenders landing-page heads from the pages manifest (stage 6)", async () => {
      const { mockS3Send, mockCfSend } = createMocks();

      mockS3Send.mockImplementation((cmd: any) => {
        if (cmd._t === "get") {
          const key = cmd.input.Key as string;
          if (key === "index.html") return Promise.resolve(makeS3Text(SHELL_HTML));
          if (key === "content/pages/manifest.json")
            return Promise.resolve(
              makeS3Body([
                {
                  slug: "about",
                  nav: { label: "About", order: 1 },
                  seo: { title: "About Me", description: "Who I am." },
                },
                {
                  slug: "teaching/cmst388-tips",
                  seo: { title: "CMST 388 Tips", description: "Guidance." },
                },
              ])
            );
          if (key.endsWith("manifest.json")) return Promise.resolve(makeS3Body([]));
          return Promise.resolve(makeS3Body({ status: "building", startedAt: "2024-01-01" }));
        }
        if (cmd._t === "list") return Promise.resolve({ Contents: [] });
        return Promise.resolve({});
      });
      mockCfWithDistribution(mockCfSend);

      const { handler } = await import("./index");
      await handler({ action: "regenerate" } as any);

      // The landing head is written at <slug>/index.html, including the slash slug.
      const puts = mockS3Send.mock.calls.filter((c: any[]) => (c[0] as any)._t === "put");
      const aboutPut = puts.find((c: any[]) => (c[0] as any).input.Key === "about/index.html");
      expect(aboutPut).toBeDefined();
      expect((aboutPut![0] as any).input.Body).toContain("<title>About Me | Example Site</title>");
      // Landing pages are websites, not articles, and carry no BlogPosting JSON-LD.
      expect((aboutPut![0] as any).input.Body).toContain(
        '<meta property="og:type" content="website" />'
      );
      expect((aboutPut![0] as any).input.Body).not.toContain("application/ld+json");

      const nestedPut = puts.find(
        (c: any[]) => (c[0] as any).input.Key === "teaching/cmst388-tips/index.html"
      );
      expect(nestedPut).toBeDefined();
    });

    it("removes the prerendered page of a post that is no longer published", async () => {
      const { mockS3Send, mockCfSend } = createMocks();

      // Live manifest has a post; the bucket no longer has its markdown, so the
      // rebuilt manifest drops it — the same shape as a delete or a flip to draft.
      mockS3Send.mockImplementation((cmd: any) => {
        if (cmd._t === "get") {
          const key = cmd.input.Key as string;
          if (key === "index.html") return Promise.resolve(makeS3Text(SHELL_HTML));
          if (key === "content/posts/manifest.json")
            return Promise.resolve(makeS3Body([{ slug: "gone-post", title: "Gone" }]));
          if (key.endsWith("manifest.json")) return Promise.resolve(makeS3Body([]));
          return Promise.resolve(makeS3Body({ status: "building", startedAt: "2024-01-01" }));
        }
        if (cmd._t === "list") return Promise.resolve({ Contents: [] });
        return Promise.resolve({});
      });
      mockCfSend.mockResolvedValue({});

      const { handler } = await import("./index");
      await handler({ action: "regenerate" } as any);

      const deletes = mockS3Send.mock.calls.filter((c: any[]) => (c[0] as any)._t === "delete");
      expect(deletes.map((c: any[]) => (c[0] as any).input.Key)).toContain("gone-post/index.html");
    });

    it("collapses a bulk change to a single wildcard invalidation", async () => {
      const { mockS3Send, mockCfSend } = createMocks();

      // Thirty posts leaving the manifest at once — a taxonomy rename, or the first run
      // after prerendered pages were introduced. Listing every path would bill.
      const many = Array.from({ length: 30 }, (_, i) => ({ slug: `post-${i}`, title: `P${i}` }));
      mockS3Send.mockImplementation((cmd: any) => {
        if (cmd._t === "get") {
          const key = cmd.input.Key as string;
          if (key === "index.html") return Promise.resolve(makeS3Text(SHELL_HTML));
          if (key === "content/posts/manifest.json") return Promise.resolve(makeS3Body(many));
          if (key.endsWith("manifest.json")) return Promise.resolve(makeS3Body([]));
          return Promise.resolve(makeS3Body({ status: "building", startedAt: "2024-01-01" }));
        }
        if (cmd._t === "list") return Promise.resolve({ Contents: [] });
        return Promise.resolve({});
      });
      mockCfWithDistribution(mockCfSend);

      const { handler } = await import("./index");
      await handler({ action: "regenerate" } as any);

      const invalidation = mockCfSend.mock.calls.find(
        (c: any[]) => (c[0] as any)._t === "invalidate"
      );
      expect(invalidation![0].input.InvalidationBatch.Paths.Items).toEqual(["/*"]);
      expect(invalidation![0].input.InvalidationBatch.Paths.Quantity).toBe(1);
    });

    it("keeps the invalidation path list explicit for a small change", async () => {
      const { mockS3Send, mockCfSend } = createMocks();
      mockS3Send.mockImplementation((cmd: any) => {
        if (cmd._t === "get")
          return respondToGet(cmd, { status: "building", startedAt: "2024-01-01" });
        if (cmd._t === "list") return Promise.resolve({ Contents: [] });
        return Promise.resolve({});
      });
      mockCfWithDistribution(mockCfSend);

      const { handler } = await import("./index");
      await handler({ action: "regenerate" } as any);

      const invalidation = mockCfSend.mock.calls.find(
        (c: any[]) => (c[0] as any)._t === "invalidate"
      );
      const items = invalidation![0].input.InvalidationBatch.Paths.Items;
      expect(items).toEqual(["/content/*", "/search-index.json", "/rss.xml", "/sitemap.xml"]);
    });

    it("marks the deploy failed when regeneration throws", async () => {
      const { mockS3Send, mockCfSend } = createMocks();

      mockS3Send.mockImplementation((cmd: any) => {
        if (cmd._t === "get")
          return Promise.resolve(
            makeS3Body({ status: "building", startedAt: "2024-01-01T00:00:00.000Z" })
          );
        if (cmd._t === "list") return Promise.reject(new Error("S3 list failed"));
        return Promise.resolve({}); // put
      });
      mockCfSend.mockResolvedValue({});

      const { handler } = await import("./index");
      await handler({ action: "regenerate" } as any);

      const statusPuts = mockS3Send.mock.calls.filter(
        (c) => (c[0] as any)._t === "put" && (c[0] as any).input.Key === "admin/deploy-status.json"
      );
      const lastStatusBody = JSON.parse((statusPuts[statusPuts.length - 1][0] as any).input.Body);
      expect(lastStatusBody.status).toBe("failed");
      expect(lastStatusBody.error).toBeDefined();
    });

    it("excludes drafts and future-dated posts from the generated manifest", async () => {
      const { mockS3Send, mockCfSend } = createMocks();

      const md = (fm: string, body = "Body text.") => `---\n${fm}\n---\n\n${body}`;
      const files: Record<string, string> = {
        "content/posts/published/index.md": md("title: Published Post\ndate: 2020-01-01"),
        "content/posts/draft/index.md": md("title: Draft Post\ndate: 2020-01-01\ndraft: true"),
        "content/posts/future/index.md": md("title: Future Post\ndate: 2999-01-01"),
      };

      mockS3Send.mockImplementation((cmd: any) => {
        if (cmd._t === "get") {
          const key = cmd.input.Key as string;
          if (key in files) {
            return Promise.resolve({
              Body: { transformToString: () => Promise.resolve(files[key]) },
            });
          }
          // deploy-status.json / deploy-history.json
          return Promise.resolve(
            makeS3Body({ status: "building", startedAt: "2024-01-01T00:00:00.000Z" })
          );
        }
        if (cmd._t === "list") {
          const prefix = cmd.input.Prefix as string;
          if (prefix === "content/posts/") {
            return Promise.resolve({ Contents: Object.keys(files).map((Key) => ({ Key })) });
          }
          return Promise.resolve({ Contents: [] });
        }
        return Promise.resolve({}); // put
      });
      mockCfSend.mockResolvedValue({});

      const { handler } = await import("./index");
      await handler({ action: "regenerate" } as any);

      const postsManifestPut = mockS3Send.mock.calls.find(
        (c) =>
          (c[0] as any)._t === "put" && (c[0] as any).input.Key === "content/posts/manifest.json"
      );
      expect(postsManifestPut).toBeDefined();
      const manifest = JSON.parse((postsManifestPut![0] as any).input.Body);
      expect(manifest).toHaveLength(1);
      expect(manifest[0].title).toBe("Published Post");
    });
  });

  describe("scheduled publisher", () => {
    function putsFor(mockS3Send: any, key: string) {
      return mockS3Send.mock.calls.filter(
        (c: any[]) => (c[0] as any)._t === "put" && (c[0] as any).input.Key === key
      );
    }

    it("does nothing when no content is due (manifests unchanged)", async () => {
      const { mockS3Send, mockCfSend } = createMocks();
      mockS3Send.mockImplementation((cmd: any) => {
        if (cmd._t === "get") {
          const key = cmd.input.Key as string;
          if (key === "admin/deploy-status.json")
            return Promise.resolve(makeS3Body({ status: "success" }));
          // Both live manifests are empty and buildManifest will also be empty.
          return Promise.resolve(makeS3Body([]));
        }
        if (cmd._t === "list") return Promise.resolve({ Contents: [] });
        return Promise.resolve({});
      });
      mockCfSend.mockResolvedValue({});

      const { handler } = await import("./index");
      await handler({ action: "scheduled-publish" } as any);

      // No artifacts written, no status change, no history.
      const anyPut = mockS3Send.mock.calls.filter((c: any[]) => (c[0] as any)._t === "put");
      expect(anyPut.length).toBe(0);
    });

    it("publishes when a scheduled post has come due", async () => {
      const { mockS3Send, mockCfSend } = createMocks();
      const md = `---\ntitle: Now Due\ndate: 2020-01-01\n---\n\nBody.`;
      mockS3Send.mockImplementation((cmd: any) => {
        if (cmd._t === "get") {
          const key = cmd.input.Key as string;
          if (key === "admin/deploy-status.json")
            return Promise.resolve(makeS3Body({ status: "success" }));
          if (key === "index.html") return Promise.resolve(makeS3Text(SHELL_HTML));
          if (key === "content/posts/now-due/index.md")
            return Promise.resolve({
              Body: { transformToString: () => Promise.resolve(md) },
            });
          // Live manifests + history are empty -> the built manifest will differ.
          return Promise.resolve(makeS3Body([]));
        }
        if (cmd._t === "list") {
          const prefix = cmd.input.Prefix as string;
          if (prefix === "content/posts/")
            return Promise.resolve({ Contents: [{ Key: "content/posts/now-due/index.md" }] });
          return Promise.resolve({ Contents: [] });
        }
        return Promise.resolve({});
      });
      mockCfSend.mockResolvedValue({});

      const { handler } = await import("./index");
      await handler({ action: "scheduled-publish" } as any);

      // The posts manifest was rewritten with the now-due post.
      const manifestPuts = putsFor(mockS3Send, "content/posts/manifest.json");
      expect(manifestPuts.length).toBe(1);
      const manifest = JSON.parse((manifestPuts[0][0] as any).input.Body);
      expect(manifest).toHaveLength(1);
      expect(manifest[0].title).toBe("Now Due");

      // Status ended success and a scheduler history entry was recorded.
      const statusPuts = putsFor(mockS3Send, "admin/deploy-status.json");
      const lastStatus = JSON.parse((statusPuts[statusPuts.length - 1][0] as any).input.Body);
      expect(lastStatus.status).toBe("success");

      const historyPuts = putsFor(mockS3Send, "admin/deploy-history.json");
      expect(historyPuts.length).toBe(1);
      const history = JSON.parse((historyPuts[0][0] as any).input.Body);
      expect(history[0].triggeredBy).toBe("scheduler");
    });

    it("skips when a deploy is already in progress", async () => {
      const { mockS3Send } = createMocks();
      mockS3Send.mockImplementation((cmd: any) => {
        if (cmd._t === "get")
          return Promise.resolve(makeS3Body({ status: "deploying", startedAt: "x" }));
        return Promise.resolve({});
      });

      const { handler } = await import("./index");
      await handler({ action: "scheduled-publish" } as any);

      const anyPut = mockS3Send.mock.calls.filter((c: any[]) => (c[0] as any)._t === "put");
      const anyList = mockS3Send.mock.calls.filter((c: any[]) => (c[0] as any)._t === "list");
      expect(anyPut.length).toBe(0);
      expect(anyList.length).toBe(0);
    });
  });

  describe("slugify", () => {
    /**
     * This decides the slug the manifest advertises, while the content Lambda
     * decides the directory name. They must agree, so these expectations are
     * duplicated in src/lib/slugify.test.ts and the admin's slugify tests.
     */
    async function load() {
      createMocks();
      return await import("./index");
    }

    it("removes apostrophes rather than turning them into separators", async () => {
      const { slugify } = await load();
      expect(slugify("Here's the reason")).toBe("heres-the-reason");
      expect(slugify("Why you shouldn't change it")).toBe("why-you-shouldnt-change-it");
      expect(slugify("Drupal\u2019s Domain Access")).toBe("drupals-domain-access");
    });

    it("does not leave a bare -s- separator", async () => {
      const { slugify } = await load();
      expect(slugify("Here's the reason")).not.toContain("-s-");
    });

    it("lowercases, hyphenates and trims", async () => {
      const { slugify } = await load();
      expect(slugify("Hello World")).toBe("hello-world");
      expect(slugify("--Wrapped--")).toBe("wrapped");
      expect(slugify("Too   Many   Spaces")).toBe("too-many-spaces");
      expect(slugify("Top 10 Tips for 2024")).toBe("top-10-tips-for-2024");
    });
  });

  describe("failure alerts", () => {
    it("publishes an alert when regeneration fails", async () => {
      const { mockS3Send, mockSnsSend } = createMocks();
      mockS3Send.mockImplementation((cmd: any) => {
        if (cmd._t === "get")
          return Promise.resolve(makeS3Body({ status: "building", startedAt: "2024-01-01" }));
        if (cmd._t === "list") return Promise.reject(new Error("S3 exploded"));
        return Promise.resolve({});
      });

      const { handler } = await import("./index");
      await handler({ action: "regenerate", triggeredBy: "ian@example.com" } as any);

      expect(mockSnsSend).toHaveBeenCalledTimes(1);
      const input = (mockSnsSend.mock.calls[0][0] as any).input;
      expect(input.TopicArn).toBe(process.env.ALERT_TOPIC_ARN);
      expect(input.Subject).toMatch(/deploy failed/i);
      expect(input.Message).toContain("S3 exploded");
      // The actor is carried through so the email says who triggered it.
      expect(input.Message).toContain("ian@example.com");
    });

    it("publishes an alert when the scheduled publish fails", async () => {
      const { mockS3Send, mockSnsSend } = createMocks();
      mockS3Send.mockImplementation((cmd: any) => {
        if (cmd._t === "get") {
          const key = (cmd.input as any).Key as string;
          if (key === "admin/deploy-status.json")
            return Promise.resolve(makeS3Body({ status: "success" }));
          return Promise.resolve(makeS3Body([]));
        }
        if (cmd._t === "list") return Promise.reject(new Error("listing blew up"));
        return Promise.resolve({});
      });

      const { handler } = await import("./index");
      await handler({ action: "scheduled-publish" } as any);

      expect(mockSnsSend).toHaveBeenCalledTimes(1);
      const input = (mockSnsSend.mock.calls[0][0] as any).input;
      expect(input.Subject).toMatch(/scheduled publish failed/i);
      expect(input.Message).toContain("listing blew up");
    });

    it("does not publish an alert on a successful regeneration", async () => {
      const { mockS3Send, mockCfSend, mockSnsSend } = createMocks();
      mockS3Send.mockImplementation((cmd: any) => {
        if (cmd._t === "get")
          return respondToGet(cmd, { status: "building", startedAt: "2024-01-01" });
        if (cmd._t === "list") return Promise.resolve({ Contents: [] });
        return Promise.resolve({});
      });
      mockCfSend.mockResolvedValue({});

      const { handler } = await import("./index");
      await handler({ action: "regenerate" } as any);

      expect(mockSnsSend).not.toHaveBeenCalled();
    });

    it("still records the failure if publishing the alert throws", async () => {
      const { mockS3Send, mockSnsSend } = createMocks();
      mockSnsSend.mockRejectedValue(new Error("SNS unavailable"));
      mockS3Send.mockImplementation((cmd: any) => {
        if (cmd._t === "get")
          return Promise.resolve(makeS3Body({ status: "building", startedAt: "2024-01-01" }));
        if (cmd._t === "list") return Promise.reject(new Error("original failure"));
        return Promise.resolve({});
      });

      const { handler } = await import("./index");
      // A broken alert must not throw out of the handler or mask the real error.
      await expect(handler({ action: "regenerate" } as any)).resolves.toBeUndefined();

      const statusPuts = mockS3Send.mock.calls.filter(
        (c: any[]) =>
          (c[0] as any)._t === "put" && (c[0] as any).input.Key === "admin/deploy-status.json"
      );
      const last = JSON.parse((statusPuts[statusPuts.length - 1][0] as any).input.Body);
      expect(last.status).toBe("failed");
      expect(last.error).toContain("original failure");
    });
  });

  describe("Error handling", () => {
    it("returns 405 for unsupported methods", async () => {
      createMocks();

      const { handler } = await import("./index");
      const result = (await handler(makeEvent("DELETE", "/api/deploy"))) as any;

      expect(result.statusCode).toBe(405);
      expect(JSON.parse(result.body).code).toBe("METHOD_NOT_ALLOWED");
    });

    it("returns 500 with correlationId on unexpected errors", async () => {
      const { mockS3Send } = createMocks();
      mockS3Send.mockImplementation((cmd: any) =>
        cmd._t === "get" ? Promise.reject(new Error("S3 unavailable")) : Promise.resolve({})
      );

      const { handler } = await import("./index");
      const result = (await handler(makeEvent("GET", "/api/deploy/status"))) as any;

      expect(result.statusCode).toBe(500);
      const body = JSON.parse(result.body);
      expect(body.code).toBe("INTERNAL_ERROR");
      expect(body.correlationId).toBeDefined();
    });

    it("error responses have Content-Type application/json header", async () => {
      createMocks();

      const { handler } = await import("./index");
      const result = (await handler(makeEvent("PUT", "/api/deploy"))) as any;

      expect(result.statusCode).toBe(405);
      expect(result.headers["Content-Type"]).toBe("application/json");
    });
  });

  describe("isPublished", () => {
    async function load() {
      createMocks();
      return await import("./index");
    }

    const NOW = Date.parse("2024-06-01T00:00:00.000Z");

    it("treats content with no draft flag and no date as published", async () => {
      const { isPublished } = await load();
      expect(isPublished({}, NOW)).toBe(true);
    });

    it("excludes explicit drafts", async () => {
      const { isPublished } = await load();
      expect(isPublished({ draft: true }, NOW)).toBe(false);
    });

    it("includes non-drafts with a past date", async () => {
      const { isPublished } = await load();
      expect(isPublished({ date: "2020-01-01" }, NOW)).toBe(true);
    });

    it("excludes future-dated content", async () => {
      const { isPublished } = await load();
      expect(isPublished({ date: "2999-01-01" }, NOW)).toBe(false);
    });

    it("treats unparseable dates as published", async () => {
      const { isPublished } = await load();
      expect(isPublished({ date: "not-a-date" }, NOW)).toBe(true);
    });

    it("excludes drafts even when the date is in the past", async () => {
      const { isPublished } = await load();
      expect(isPublished({ draft: true, date: "2020-01-01" }, NOW)).toBe(false);
    });
  });
});

/**
 * The sitemap's non-manifest entries.
 *
 * This Lambda regenerates sitemap.xml when someone hits Deploy in the admin, and the CI
 * build regenerates it from scratch. Both have to agree, or the sitemap's contents depend
 * on which path ran last. They did not agree: the Lambda held a hardcoded list of eight
 * that named `about`, `teaching` and `bitesize-javascript` by hand while omitting `apps`,
 * `teaching/cmst388-tips` and the three standalone children — so an admin deploy dropped
 * five URLs and the next pipeline build put them back.
 *
 * Landing pages now come from the same registry the build script and the route table
 * read, which is what removes the class of drift rather than this instance of it. The
 * framework routes and the three standalone paths are still written out in both places;
 * that is a smaller risk (five stable routes and three paths) and `verify-build.js` keeps
 * its own independent list as the backstop.
 */
describe("sitemapStaticPages", () => {
  // No SDK mocks: this is a pure function, and the module's clients are constructed at
  // load without making a call. `createMocks` is scoped to the DeployLambda describe
  // anyway, and reaching for it here would couple these tests to that setup for nothing.
  async function load() {
    vi.resetModules();
    return await import("./index");
  }

  // Landing slugs come from the S3 pages manifest now (passed in), not a compiled
  // registry. Use a representative set that includes a slash-containing slug.
  const LANDING = ["about", "apps", "teaching", "bitesize-javascript", "teaching/cmst388-tips"];

  it("includes every landing slug it is given", async () => {
    const { sitemapStaticPages } = await load();
    const pages = sitemapStaticPages(LANDING);
    for (const slug of LANDING) {
      expect(pages).toContain(slug);
    }
  });

  it("includes the standalone cmst388-tips children the hardcoded list used to miss", async () => {
    const { sitemapStaticPages } = await load();
    const pages = sitemapStaticPages(LANDING);

    expect(pages).toContain("teaching/cmst388-tips/project-1-javascript-selectors");
    expect(pages).toContain("teaching/cmst388-tips/project-3-ticket-purchasing");
    expect(pages).toContain("teaching/cmst388-tips/project-4-student-portfolio");
  });

  it("composes framework routes, landing slugs and standalone pages, in that order", async () => {
    const { sitemapStaticPages, FRAMEWORK_ROUTES, STANDALONE_PAGES } = await load();

    expect(sitemapStaticPages(LANDING)).toEqual([
      ...FRAMEWORK_ROUTES,
      ...LANDING,
      ...STANDALONE_PAGES,
    ]);
  });

  it("keeps the home page as the empty string, so the URL is the bare origin", async () => {
    const { sitemapStaticPages } = await load();
    expect(sitemapStaticPages(LANDING)[0]).toBe("");
  });

  it("lists no entry twice", async () => {
    const { sitemapStaticPages } = await load();
    const pages = sitemapStaticPages(LANDING);
    expect(new Set(pages).size).toBe(pages.length);
  });

  it("stores paths without a leading slash, as the sitemap builder expects", async () => {
    const { sitemapStaticPages } = await load();
    for (const page of sitemapStaticPages(LANDING)) {
      expect(page.startsWith("/")).toBe(false);
    }
  });

  it("composes with an empty landing set (manifest missing) without error", async () => {
    const { sitemapStaticPages, FRAMEWORK_ROUTES, STANDALONE_PAGES } = await load();
    expect(sitemapStaticPages([])).toEqual([...FRAMEWORK_ROUTES, ...STANDALONE_PAGES]);
  });
});

/**
 * Prerendered meta pages.
 *
 * The build wrote these and this Lambda did not, so publishing through the admin gave a
 * post that was listed, searchable and sitemapped but still served the site-wide generic
 * head until CI next ran. Un-publishing was worse: the manifest entry went and the page
 * stayed, so the URL kept advertising a post the site no longer acknowledged.
 */
describe("meta pages", () => {
  const SHELL =
    `<!doctype html><html><head><title>example.test</title>` +
    `<link rel="canonical" href="https://www.example.test" />` +
    `<script src="/assets/app-abc123.js"></script>` +
    `</head><body><div id="root"></div></body></html>`;

  async function load() {
    vi.resetModules();
    return await import("./index");
  }

  function entry(over: Partial<Record<string, unknown>> = {}) {
    return {
      slug: "a-post",
      title: "A Post",
      date: "2024-01-15",
      description: "A description",
      excerpt: "An excerpt",
      categories: "",
      tags: [],
      author: "Someone",
      ...over,
    } as any;
  }

  describe("keys and paths", () => {
    it("serves posts from the root and articles under knowledge-base", async () => {
      const { metaPageKey, metaPagePath } = await load();

      expect(metaPageKey("posts", "a-post")).toBe("a-post/index.html");
      expect(metaPagePath("posts", "a-post")).toBe("/a-post");
      expect(metaPageKey("knowledge-base", "a-fix")).toBe("knowledge-base/a-fix/index.html");
      expect(metaPagePath("knowledge-base", "a-fix")).toBe("/knowledge-base/a-fix");
    });
  });

  describe("buildMetaHtml", () => {
    it("replaces the shell's title and canonical, keeping the rest of the shell", async () => {
      const { buildMetaHtml } = await load();

      const html = buildMetaHtml(SHELL, {
        title: "A Post",
        description: "A description",
        url: "https://www.example.test/a-post",
      });

      expect(html).toContain("<title>A Post | Example Site</title>");
      expect(html).not.toContain("<title>example.test</title>");
      expect(html).toContain('<link rel="canonical" href="https://www.example.test/a-post" />');
      expect(html).not.toContain('href="https://www.example.test"/');
      // The body and the script tag are untouched — the client app still boots.
      expect(html).toContain('<script src="/assets/app-abc123.js"></script>');
      expect(html).toContain('<div id="root"></div>');
    });

    it("emits Open Graph and Twitter tags", async () => {
      const { buildMetaHtml } = await load();
      const html = buildMetaHtml(SHELL, {
        title: "A Post",
        description: "A description",
        url: "https://www.example.test/a-post",
      });

      expect(html).toContain('<meta property="og:title" content="A Post" />');
      expect(html).toContain(
        '<meta property="og:url" content="https://www.example.test/a-post" />'
      );
      expect(html).toContain('<meta property="og:type" content="article" />');
      expect(html).toContain('<meta property="og:site_name" content="Example Site" />');
      expect(html).toContain('<meta name="twitter:card" content="summary" />');
      expect(html).toContain('<meta name="description" content="A description" />');
    });

    it("emits BlogPosting JSON-LD with the author and date when present", async () => {
      const { buildMetaHtml } = await load();
      const html = buildMetaHtml(SHELL, {
        title: "A Post",
        description: "A description",
        url: "https://www.example.test/a-post",
        date: "2024-01-15",
        author: "Someone",
      });

      const json = html.match(/<script type="application\/ld\+json">(.*?)<\/script>/)?.[1];
      const data = JSON.parse(json!);
      expect(data["@type"]).toBe("BlogPosting");
      expect(data.headline).toBe("A Post");
      expect(data.datePublished).toBe("2024-01-15");
      expect(data.author).toEqual({ "@type": "Person", name: "Someone" });
      // Publisher is the site, whoever wrote the post.
      expect(data.publisher).toEqual({ "@type": "Person", name: "Example Site" });
    });

    it("falls back to the site name when a post has no author", async () => {
      const { buildMetaHtml } = await load();
      const html = buildMetaHtml(SHELL, { title: "T", description: "D", url: "https://x/t" });
      const json = html.match(/<script type="application\/ld\+json">(.*?)<\/script>/)?.[1];
      expect(JSON.parse(json!).author).toEqual({ "@type": "Person", name: "Example Site" });
    });

    it("omits date and description from the graph rather than emitting empty ones", async () => {
      const { buildMetaHtml } = await load();
      const html = buildMetaHtml(SHELL, { title: "T", description: "", url: "https://x/t" });
      const json = html.match(/<script type="application\/ld\+json">(.*?)<\/script>/)?.[1];
      const data = JSON.parse(json!);
      expect("datePublished" in data).toBe(false);
      expect("description" in data).toBe(false);
    });

    it("emits og:type website and no BlogPosting JSON-LD for a landing page", async () => {
      // Landing pages pass ogType "website" (stage 6): a landing page is not a blog
      // posting and must not advertise itself as one.
      const { buildMetaHtml } = await load();
      const html = buildMetaHtml(SHELL, {
        title: "About Me",
        description: "Who I am.",
        url: "https://www.example.test/about",
        ogType: "website",
      });
      expect(html).toContain('<meta property="og:type" content="website" />');
      expect(html).not.toContain('<meta property="og:type" content="article" />');
      expect(html).not.toContain("application/ld+json");
      // The title and canonical are still swapped in as for any page.
      expect(html).toContain("<title>About Me | Example Site</title>");
      expect(html).toContain('<link rel="canonical" href="https://www.example.test/about" />');
    });

    it("escapes quotes and angle brackets in titles", async () => {
      const { buildMetaHtml } = await load();
      const html = buildMetaHtml(SHELL, {
        title: 'He said "hi" <script>',
        description: "D",
        url: "https://x/t",
      });

      expect(html).toContain('content="He said &quot;hi&quot; &lt;script&gt;"');
      expect(html).not.toContain('content="He said "hi"');
    });

    it("escapes a closing script tag inside the JSON-LD", async () => {
      const { buildMetaHtml } = await load();
      const html = buildMetaHtml(SHELL, {
        title: "</script><img onerror=alert(1)>",
        description: "D",
        url: "https://x/t",
      });

      // The literal sequence must not appear, or the block could be broken out of.
      const ldBlock = html.match(/<script type="application\/ld\+json">[\s\S]*?<\/script>/)![0];
      expect(ldBlock.match(/<\/script>/g)).toHaveLength(1);
      expect(ldBlock).toContain("\\u003c/script");
    });

    // String replacements interpret `$&` and `$1` as references to the match. A function
    // replacer is used so a title containing them is taken literally.
    it("does not let a dollar pattern in the title inject the matched tag", async () => {
      const { buildMetaHtml } = await load();
      const html = buildMetaHtml(SHELL, {
        title: "Save $5 on $& and $1",
        description: "D",
        url: "https://x/t",
      });

      expect(html).toContain("<title>Save $5 on $&amp; and $1 | Example Site</title>");
      expect(html).not.toContain("example.test</title>");
    });

    it("does not let a dollar pattern in the url corrupt the canonical", async () => {
      const { buildMetaHtml } = await load();
      const html = buildMetaHtml(SHELL, {
        title: "T",
        description: "D",
        url: "https://www.example.test/a$&b",
      });
      expect(html).toContain('<link rel="canonical" href="https://www.example.test/a$&amp;b" />');
    });
  });

  describe("diffMetaPages", () => {
    it("writes a page for a newly published entry", async () => {
      const { diffMetaPages } = await load();
      const result = diffMetaPages([], [entry()]);

      expect(result.write.map((e: any) => e.slug)).toEqual(["a-post"]);
      expect(result.remove).toEqual([]);
    });

    it("skips an entry whose head-relevant fields are unchanged", async () => {
      const { diffMetaPages } = await load();
      const result = diffMetaPages([entry()], [entry()]);

      expect(result.write).toEqual([]);
      expect(result.remove).toEqual([]);
    });

    it.each(["title", "description", "excerpt", "date", "author"])(
      "rewrites a page when %s changes",
      async (field) => {
        const { diffMetaPages } = await load();
        const result = diffMetaPages([entry()], [entry({ [field]: "changed" })]);
        expect(result.write.map((e: any) => e.slug)).toEqual(["a-post"]);
      }
    );

    it("ignores fields that do not reach the head", async () => {
      const { diffMetaPages } = await load();
      // Tags and categories render client-side from the markdown, not in the head.
      const result = diffMetaPages([entry()], [entry({ tags: ["new"], categories: "New" })]);
      expect(result.write).toEqual([]);
    });

    it("removes the page of an entry that left the manifest", async () => {
      const { diffMetaPages } = await load();
      const result = diffMetaPages([entry(), entry({ slug: "gone" })], [entry()]);

      expect(result.write).toEqual([]);
      expect(result.remove).toEqual(["gone"]);
    });

    it("handles a simultaneous add, edit and removal", async () => {
      const { diffMetaPages } = await load();
      const result = diffMetaPages(
        [entry({ slug: "keep" }), entry({ slug: "edit" }), entry({ slug: "drop" })],
        [entry({ slug: "keep" }), entry({ slug: "edit", title: "Edited" }), entry({ slug: "add" })]
      );

      expect(result.write.map((e: any) => e.slug).sort()).toEqual(["add", "edit"]);
      expect(result.remove).toEqual(["drop"]);
    });
  });

  describe("loadShell", () => {
    function mockS3(body: string) {
      const send = vi.fn().mockResolvedValue({
        Body: { transformToString: () => Promise.resolve(body) },
      });
      vi.doMock("@aws-sdk/client-s3", () => ({
        S3Client: class {
          send = send;
        },
        GetObjectCommand: class {
          constructor(public input: unknown) {}
        },
        PutObjectCommand: class {
          constructor(public input: unknown) {}
        },
        DeleteObjectCommand: class {
          constructor(public input: unknown) {}
        },
        ListObjectsV2Command: class {
          constructor(public input: unknown) {}
        },
      }));
      return send;
    }

    it("returns the deployed shell", async () => {
      vi.resetModules();
      const send = mockS3(SHELL);
      const { loadShell } = await import("./index");

      expect(await loadShell()).toBe(SHELL);
      expect((send.mock.calls[0][0] as any).input.Key).toBe("index.html");
    });

    // Silently writing pages with the generic head is the bug this exists to fix, so a
    // shell it cannot inject into has to fail rather than produce plausible wrong output.
    it("refuses a shell with no title", async () => {
      vi.resetModules();
      mockS3(`<html><head><link rel="canonical" href="https://x" /></head></html>`);
      const { loadShell } = await import("./index");

      await expect(loadShell()).rejects.toThrow(/no title/i);
    });

    it("refuses a shell with no canonical link", async () => {
      vi.resetModules();
      mockS3(`<html><head><title>x</title></head></html>`);
      const { loadShell } = await import("./index");

      await expect(loadShell()).rejects.toThrow(/no canonical link/i);
    });
  });
});
