import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * Tests for the GitLab provider.
 *
 * This module had no tests. The content/media/taxonomy handler tests exercise it
 * only by accident: GITLAB_TOKEN_SECRET_ARN is unset in that environment, so every
 * git call short-circuits to {committed: false, skipped: true} and none of the HTTP
 * paths below ever ran. That was tolerable while commits were best-effort. The next
 * stage makes them blocking, which turns a bug here into a failed user save, so the
 * request shapes and the failure handling are pinned down now.
 *
 * Configuration is read at module load, so each test sets the environment and then
 * imports the module fresh — the same approach as alerts.test.ts.
 */

const API = "https://gitlab.example/api/v4";
const PROJECT_ID = "80629335";
const BRANCH = "main";
const SECRET_ARN = "arn:aws:secretsmanager:us-east-1:123456789012:secret:gitlab-token-AbCdEf";
const TOKEN = "glpat-example-token";

const CONFIG_KEYS = [
  "GITLAB_API_URL",
  "GITLAB_PROJECT_ID",
  "GITLAB_BRANCH",
  "GITLAB_TOKEN_SECRET_ARN",
] as const;

const originalConfig = new Map<string, string | undefined>(
  CONFIG_KEYS.map((key) => [key, process.env[key]])
);

interface LoadOptions {
  /** Overrides on top of a fully configured environment. `undefined` unsets. */
  env?: Partial<Record<(typeof CONFIG_KEYS)[number], string | undefined>>;
  /** What Secrets Manager returns for the token. */
  secretString?: string;
  /** Make the Secrets Manager call reject. */
  secretError?: Error;
}

async function loadProvider(options: LoadOptions = {}) {
  vi.resetModules();

  const env: Record<string, string | undefined> = {
    GITLAB_API_URL: API,
    GITLAB_PROJECT_ID: PROJECT_ID,
    GITLAB_BRANCH: BRANCH,
    GITLAB_TOKEN_SECRET_ARN: SECRET_ARN,
    ...options.env,
  };
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }

  const secretsSend = vi.fn();
  if (options.secretError) {
    secretsSend.mockRejectedValue(options.secretError);
  } else {
    secretsSend.mockResolvedValue({ SecretString: options.secretString ?? TOKEN });
  }

  vi.doMock("@aws-sdk/client-secrets-manager", () => ({
    SecretsManagerClient: class {
      send = secretsSend;
    },
    GetSecretValueCommand: class {
      constructor(public input: unknown) {}
    },
  }));

  const fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);

  const mod = await import("./gitlab");
  return { mod, secretsSend, fetchMock };
}

/** A successful GitLab response carrying a JSON body. */
function jsonResponse(body: unknown) {
  return {
    ok: true,
    status: 200,
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

/** A GitLab error response. `text()` is what the provider logs and reports. */
function errorResponse(status: number, detail: string) {
  return {
    ok: false,
    status,
    json: async () => ({}),
    text: async () => detail,
  };
}

/** Read the JSON body a fetch call was made with. */
function bodyOf(fetchMock: ReturnType<typeof vi.fn>, call = 0): Record<string, unknown> {
  const init = fetchMock.mock.calls[call][1] as { body: string };
  return JSON.parse(init.body);
}

function initOf(fetchMock: ReturnType<typeof vi.fn>, call = 0) {
  return fetchMock.mock.calls[call][1] as {
    method?: string;
    headers: Record<string, string>;
  };
}

beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  for (const [key, value] of originalConfig) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("s3KeyToRepoPath", () => {
  // Identity since content moved to the Content_Repo: S3 holds `content/...` and so does
  // the repo. It prepended `public/` while content lived in the source repository.
  it("maps an S3 key to the same path in the Content_Repo", async () => {
    const { mod } = await loadProvider();
    expect(mod.s3KeyToRepoPath("content/posts/hello/index.md")).toBe(
      "content/posts/hello/index.md"
    );
  });

  it("adds no prefix, so nothing lands under public/", async () => {
    const { mod } = await loadProvider();
    expect(mod.s3KeyToRepoPath("content/posts/hello/index.md")).not.toContain("public/");
  });

  it("leaves unusual characters in the key untouched", async () => {
    const { mod } = await loadProvider();
    expect(mod.s3KeyToRepoPath("content/media/a b/c+d.png")).toBe("content/media/a b/c+d.png");
  });
});

describe("configuration gating", () => {
  it("skips commits when no token secret is configured", async () => {
    const { mod, fetchMock } = await loadProvider({
      env: { GITLAB_TOKEN_SECRET_ARN: undefined },
    });

    const result = await mod.commitUpsert("content/a.md", "x", "text", "msg", true);

    expect(result).toEqual({ committed: false, skipped: true });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("skips commits when no project id is configured", async () => {
    const { mod, fetchMock } = await loadProvider({
      env: { GITLAB_PROJECT_ID: undefined },
    });

    const result = await mod.commitUpsert("content/a.md", "x", "text", "msg", true);

    expect(result).toEqual({ committed: false, skipped: true });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("skips when the secret resolves to an empty value", async () => {
    const { mod, fetchMock } = await loadProvider({ secretString: "   " });

    const result = await mod.commitUpsert("content/a.md", "x", "text", "msg", true);

    expect(result).toEqual({ committed: false, skipped: true });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reports read paths as empty or null rather than skipped", async () => {
    const { mod } = await loadProvider({ env: { GITLAB_TOKEN_SECRET_ARN: undefined } });

    expect(await mod.listFileCommits("content/a.md")).toEqual([]);
    expect(await mod.getFileAtRef("content/a.md", "abc123")).toBeNull();
  });
});

describe("token retrieval", () => {
  it("reads the token from the configured secret", async () => {
    const { mod, secretsSend, fetchMock } = await loadProvider();
    fetchMock.mockResolvedValue(jsonResponse({}));

    await mod.commitUpsert("content/a.md", "x", "text", "msg", true);

    const command = secretsSend.mock.calls[0][0] as { input: { SecretId: string } };
    expect(command.input.SecretId).toBe(SECRET_ARN);
    expect(initOf(fetchMock).headers["PRIVATE-TOKEN"]).toBe(TOKEN);
  });

  it('unwraps a JSON secret of the form {"token":"..."}', async () => {
    const { mod, fetchMock } = await loadProvider({
      secretString: JSON.stringify({ token: `  ${TOKEN}  ` }),
    });
    fetchMock.mockResolvedValue(jsonResponse({}));

    await mod.commitUpsert("content/a.md", "x", "text", "msg", true);

    expect(initOf(fetchMock).headers["PRIVATE-TOKEN"]).toBe(TOKEN);
  });

  it("treats a non-JSON secret as the raw token", async () => {
    const { mod, fetchMock } = await loadProvider({ secretString: `${TOKEN}\n` });
    fetchMock.mockResolvedValue(jsonResponse({}));

    await mod.commitUpsert("content/a.md", "x", "text", "msg", true);

    expect(initOf(fetchMock).headers["PRIVATE-TOKEN"]).toBe(TOKEN);
  });

  it("does not cache the token, so a rotated secret takes effect on the next edit", async () => {
    const { mod, secretsSend, fetchMock } = await loadProvider();
    fetchMock.mockResolvedValue(jsonResponse({}));

    await mod.commitUpsert("content/a.md", "x", "text", "msg", true);
    await mod.commitUpsert("content/b.md", "y", "text", "msg", true);

    expect(secretsSend).toHaveBeenCalledTimes(2);
  });

  it("reports an error instead of throwing when the secret cannot be read", async () => {
    const { mod, fetchMock } = await loadProvider({
      secretError: new Error("AccessDeniedException"),
    });

    const result = await mod.commitUpsert("content/a.md", "x", "text", "msg", true);

    expect(result.committed).toBe(false);
    expect(result.error).toContain("AccessDeniedException");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("commitUpsert", () => {
  it("builds a Repository Files request with the branch, message and content", async () => {
    const { mod, fetchMock } = await loadProvider();
    fetchMock.mockResolvedValue(jsonResponse({}));

    const result = await mod.commitUpsert(
      "content/posts/hello/index.md",
      "# Hello",
      "text",
      "Add hello",
      true
    );

    expect(result).toEqual({ committed: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url] = fetchMock.mock.calls[0];
    expect(url).toBe(
      `${API}/projects/${PROJECT_ID}/repository/files/` +
        encodeURIComponent("content/posts/hello/index.md")
    );
    expect(initOf(fetchMock).method).toBe("POST");
    expect(initOf(fetchMock).headers["Content-Type"]).toBe("application/json");
    expect(bodyOf(fetchMock)).toEqual({
      branch: BRANCH,
      commit_message: "Add hello",
      content: "# Hello",
      encoding: "text",
    });
  });

  it("URL-encodes the file path rather than leaving slashes in the path segment", async () => {
    const { mod, fetchMock } = await loadProvider();
    fetchMock.mockResolvedValue(jsonResponse({}));

    await mod.commitUpsert("content/media/a b.png", "zzz", "base64", "Add image", true);

    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain("content%2Fmedia%2Fa%20b.png");
    expect(url.endsWith("/repository/files/content%2Fmedia%2Fa%20b.png")).toBe(true);
    expect(bodyOf(fetchMock).encoding).toBe("base64");
  });

  it("creates with POST then falls back to PUT when the file already exists", async () => {
    const { mod, fetchMock } = await loadProvider();
    fetchMock
      .mockResolvedValueOnce(errorResponse(400, "A file with this name already exists"))
      .mockResolvedValueOnce(jsonResponse({}));

    const result = await mod.commitUpsert("content/a.md", "x", "text", "msg", true);

    expect(result).toEqual({ committed: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(initOf(fetchMock, 0).method).toBe("POST");
    expect(initOf(fetchMock, 1).method).toBe("PUT");
  });

  it("updates with PUT then falls back to POST when the file does not exist", async () => {
    const { mod, fetchMock } = await loadProvider();
    fetchMock
      .mockResolvedValueOnce(errorResponse(400, "A file with this name doesn't exist"))
      .mockResolvedValueOnce(jsonResponse({}));

    const result = await mod.commitUpsert("content/a.md", "x", "text", "msg", false);

    expect(result).toEqual({ committed: true });
    expect(initOf(fetchMock, 0).method).toBe("PUT");
    expect(initOf(fetchMock, 1).method).toBe("POST");
  });

  it("reports the second failure when both verbs fail", async () => {
    const { mod, fetchMock } = await loadProvider();
    fetchMock
      .mockResolvedValueOnce(errorResponse(400, "first failure"))
      .mockResolvedValueOnce(errorResponse(403, "insufficient scope"));

    const result = await mod.commitUpsert("content/a.md", "x", "text", "msg", true);

    expect(result.committed).toBe(false);
    expect(result.error).toBe("403: insufficient scope");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not retry when the first attempt was skipped", async () => {
    const { mod, fetchMock } = await loadProvider({ secretString: "" });

    const result = await mod.commitUpsert("content/a.md", "x", "text", "msg", true);

    expect(result.skipped).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reports a network failure instead of throwing", async () => {
    const { mod, fetchMock } = await loadProvider();
    fetchMock.mockRejectedValue(new Error("socket hang up"));

    const result = await mod.commitUpsert("content/a.md", "x", "text", "msg", true);

    expect(result.committed).toBe(false);
    expect(result.error).toContain("socket hang up");
  });
});

describe("commitDelete", () => {
  it("skips an empty file list without calling the API", async () => {
    const { mod, fetchMock } = await loadProvider();

    expect(await mod.commitDelete([], "msg")).toEqual({ committed: false, skipped: true });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("issues one DELETE per file", async () => {
    const { mod, fetchMock } = await loadProvider();
    fetchMock.mockResolvedValue(jsonResponse({}));

    const result = await mod.commitDelete(
      ["content/posts/p/index.md", "content/posts/p/cover.png"],
      "Delete post p"
    );

    expect(result).toEqual({ committed: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(initOf(fetchMock, 0).method).toBe("DELETE");
    expect(initOf(fetchMock, 1).method).toBe("DELETE");
    expect(bodyOf(fetchMock, 0)).toEqual({ branch: BRANCH, commit_message: "Delete post p" });
    expect(fetchMock.mock.calls[1][0]).toContain(encodeURIComponent("content/posts/p/cover.png"));
  });

  it("reports success when some files deleted and others did not", async () => {
    const { mod, fetchMock } = await loadProvider();
    fetchMock
      .mockResolvedValueOnce(jsonResponse({}))
      .mockResolvedValueOnce(errorResponse(404, "file not found"));

    expect(await mod.commitDelete(["content/a.md", "content/b.png"], "msg")).toEqual({
      committed: true,
    });
  });

  it("reports the last error when every file failed", async () => {
    const { mod, fetchMock } = await loadProvider();
    fetchMock
      .mockResolvedValueOnce(errorResponse(404, "missing a"))
      .mockResolvedValueOnce(errorResponse(404, "missing b"));

    const result = await mod.commitDelete(["content/a.md", "content/b.png"], "msg");

    expect(result.committed).toBe(false);
    expect(result.error).toBe("404: missing b");
  });

  it("skips rather than erroring when git is unconfigured", async () => {
    const { mod, fetchMock } = await loadProvider({
      env: { GITLAB_TOKEN_SECRET_ARN: undefined },
    });

    expect(await mod.commitDelete(["content/a.md"], "msg")).toEqual({
      committed: false,
      skipped: true,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("commitFiles", () => {
  it("sends every change as one commit to the Commits API", async () => {
    const { mod, fetchMock } = await loadProvider();
    fetchMock.mockResolvedValue(jsonResponse({ id: "abc" }));

    const result = await mod.commitFiles(
      [
        { action: "update", filePath: "content/a.md", content: "A", encoding: "text" },
        { action: "create", filePath: "content/b.png", content: "zz", encoding: "base64" },
        { action: "delete", filePath: "content/c.md" },
      ],
      "Rename tag"
    );

    expect(result).toEqual({ committed: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe(`${API}/projects/${PROJECT_ID}/repository/commits`);
    expect(initOf(fetchMock).method).toBe("POST");
    expect(bodyOf(fetchMock)).toEqual({
      branch: BRANCH,
      commit_message: "Rename tag",
      actions: [
        { action: "update", file_path: "content/a.md", content: "A", encoding: "text" },
        { action: "create", file_path: "content/b.png", content: "zz", encoding: "base64" },
        { action: "delete", file_path: "content/c.md" },
      ],
    });
  });

  it("skips an empty change list without calling the API", async () => {
    const { mod, fetchMock } = await loadProvider();

    expect(await mod.commitFiles([], "msg")).toEqual({ committed: false, skipped: true });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("skips when git is unconfigured", async () => {
    const { mod, fetchMock } = await loadProvider({ env: { GITLAB_PROJECT_ID: undefined } });

    expect(await mod.commitFiles([{ action: "delete", filePath: "content/a.md" }], "msg")).toEqual({
      committed: false,
      skipped: true,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reports the status and detail when the API rejects the commit", async () => {
    const { mod, fetchMock } = await loadProvider();
    fetchMock.mockResolvedValue(errorResponse(403, "insufficient_scope"));

    const result = await mod.commitFiles([{ action: "delete", filePath: "content/a.md" }], "msg");

    expect(result.committed).toBe(false);
    expect(result.error).toBe("403: insufficient_scope");
  });

  it("reports a network failure instead of throwing", async () => {
    const { mod, fetchMock } = await loadProvider();
    fetchMock.mockRejectedValue(new Error("ETIMEDOUT"));

    const result = await mod.commitFiles([{ action: "delete", filePath: "content/a.md" }], "msg");

    expect(result.committed).toBe(false);
    expect(result.error).toContain("ETIMEDOUT");
  });
});

describe("listFileCommits", () => {
  const gitlabCommits = [
    {
      id: "0123456789abcdef",
      short_id: "01234567",
      created_at: "2026-01-02T03:04:05.000Z",
      message: "Update post",
      author_name: "Ian",
    },
  ];

  it("maps the GitLab payload onto the FileCommit shape", async () => {
    const { mod, fetchMock } = await loadProvider();
    fetchMock.mockResolvedValue(jsonResponse(gitlabCommits));

    const commits = await mod.listFileCommits("content/posts/p/index.md");

    expect(commits).toEqual([
      {
        id: "0123456789abcdef",
        shortId: "01234567",
        createdAt: "2026-01-02T03:04:05.000Z",
        message: "Update post",
        authorName: "Ian",
      },
    ]);
  });

  it("queries the path, branch and page size, and sends the token", async () => {
    const { mod, fetchMock } = await loadProvider();
    fetchMock.mockResolvedValue(jsonResponse([]));

    await mod.listFileCommits("content/posts/p/index.md", 10);

    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain(`${API}/projects/${PROJECT_ID}/repository/commits?`);
    expect(url).toContain(`path=${encodeURIComponent("content/posts/p/index.md")}`);
    expect(url).toContain(`ref_name=${BRANCH}`);
    expect(url).toContain("per_page=10");
    expect(initOf(fetchMock).headers["PRIVATE-TOKEN"]).toBe(TOKEN);
  });

  it("defaults to 50 commits", async () => {
    const { mod, fetchMock } = await loadProvider();
    fetchMock.mockResolvedValue(jsonResponse([]));

    await mod.listFileCommits("content/a.md");

    expect(fetchMock.mock.calls[0][0]).toContain("per_page=50");
  });

  it("returns an empty list when the API errors", async () => {
    const { mod, fetchMock } = await loadProvider();
    fetchMock.mockResolvedValue(errorResponse(404, "project not found"));

    expect(await mod.listFileCommits("content/a.md")).toEqual([]);
  });

  it("returns an empty list when the request throws", async () => {
    const { mod, fetchMock } = await loadProvider();
    fetchMock.mockRejectedValue(new Error("DNS failure"));

    expect(await mod.listFileCommits("content/a.md")).toEqual([]);
  });
});

describe("getFileAtRef", () => {
  it("decodes a base64 payload", async () => {
    const { mod, fetchMock } = await loadProvider();
    fetchMock.mockResolvedValue(
      jsonResponse({
        content: Buffer.from("# Old version\n", "utf-8").toString("base64"),
        encoding: "base64",
      })
    );

    expect(await mod.getFileAtRef("content/a.md", "abc123")).toBe("# Old version\n");
  });

  it("returns the content unchanged when it is not base64", async () => {
    const { mod, fetchMock } = await loadProvider();
    fetchMock.mockResolvedValue(jsonResponse({ content: "plain", encoding: "text" }));

    expect(await mod.getFileAtRef("content/a.md", "abc123")).toBe("plain");
  });

  it("requests the file at the given ref", async () => {
    const { mod, fetchMock } = await loadProvider();
    fetchMock.mockResolvedValue(jsonResponse({ content: "", encoding: "text" }));

    await mod.getFileAtRef("content/posts/p/index.md", "feature/branch");

    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain(
      `/repository/files/${encodeURIComponent("content/posts/p/index.md")}?ref=`
    );
    expect(url).toContain(`ref=${encodeURIComponent("feature/branch")}`);
  });

  it("returns null when the ref or file is missing", async () => {
    const { mod, fetchMock } = await loadProvider();
    fetchMock.mockResolvedValue(errorResponse(404, "file not found"));

    expect(await mod.getFileAtRef("content/a.md", "abc123")).toBeNull();
  });

  it("returns null when the request throws", async () => {
    const { mod, fetchMock } = await loadProvider();
    fetchMock.mockRejectedValue(new Error("aborted"));

    expect(await mod.getFileAtRef("content/a.md", "abc123")).toBeNull();
  });
});
