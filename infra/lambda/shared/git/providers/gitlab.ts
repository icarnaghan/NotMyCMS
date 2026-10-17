/**
 * The GitLab implementation of {@link GitProvider}.
 *
 * The admin writes content to S3 for immediate serving and commits the same change
 * to the **Content_Repo** — a private repository holding only content, which is the
 * source of truth for it.
 *
 * One caveat while the migration finishes: the full site build still reads this
 * source repository's `public/content`, which these commits no longer touch. So a
 * post authored only through the admin is not in the tree CI builds from. That is
 * survivable only because `BucketDeployment` has `prune: false` — see the comment
 * in `infra/lib/site-stack.ts`. The Reconcile_Job in a later stage is what closes
 * it properly.
 *
 * Configuration comes from environment variables set on the Lambda, derived from
 * the `git` block in `site.config.json`:
 *   - GITLAB_API_URL          (default https://gitlab.com/api/v4)
 *   - GITLAB_PROJECT_ID       the Content_Repo, as a numeric id or encoded path —
 *                             **not** the repository this file lives in
 *   - GITLAB_BRANCH           (default main)
 *   - GITLAB_TOKEN_SECRET_ARN Secrets Manager secret holding the token, which must
 *                             grant access to the Content_Repo
 *
 * Commits are best-effort: if git is unconfigured or the API call fails, the
 * caller's S3 write has already succeeded and the content is live, so we log
 * and report the failure rather than throwing. Stage 4 of the content-storage
 * spec inverts this — commit first, and fail the save if the commit fails.
 */

const GITLAB_API_URL = process.env.GITLAB_API_URL || "https://gitlab.com/api/v4";
const GITLAB_PROJECT_ID = process.env.GITLAB_PROJECT_ID || "";
const GITLAB_BRANCH = process.env.GITLAB_BRANCH || "main";
const GITLAB_TOKEN_SECRET_ARN = process.env.GITLAB_TOKEN_SECRET_ARN || "";

/**
 * Retrieve the GitLab token from Secrets Manager. Returns null when git
 * integration is not configured. The AWS SDK is imported lazily so this
 * module can be loaded (e.g. in tests) without the package present.
 *
 * The token is intentionally NOT cached: content edits are infrequent, and
 * fetching fresh each time means a rotated/corrected token takes effect on
 * the next edit without waiting for a Lambda cold start.
 */
async function getToken(): Promise<string | null> {
  if (!GITLAB_TOKEN_SECRET_ARN) return null;

  const { SecretsManagerClient, GetSecretValueCommand } =
    await import("@aws-sdk/client-secrets-manager");
  const client = new SecretsManagerClient({});
  const response = await client.send(
    new GetSecretValueCommand({ SecretId: GITLAB_TOKEN_SECRET_ARN })
  );

  const raw = (response.SecretString || "").trim();
  // The secret may be the raw token or a JSON object like {"token":"..."}.
  let token = raw;
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.token === "string") {
      token = parsed.token.trim();
    }
  } catch {
    // Not JSON — treat the whole value as the token.
  }

  return token || null;
}

export interface CommitResult {
  committed: boolean;
  skipped?: boolean;
  error?: string;
}

/**
 * Convert an S3 content key to its path in the Content_Repo.
 *
 * Identity, now that content lives in a repository of its own: S3 holds `content/...`
 * and so does the Content_Repo. This used to prepend `public/`, because content sat in
 * the source repository's `public/` directory where Vite serves static files from.
 *
 * Kept rather than inlined because it is the seam where an installation with a different
 * layout — content under `src/content/`, say — adapts without touching the handlers.
 */
export function s3KeyToRepoPath(s3Key: string): string {
  return s3Key;
}

function isConfigured(): boolean {
  return Boolean(GITLAB_TOKEN_SECRET_ARN && GITLAB_PROJECT_ID);
}

/**
 * Send a single-file operation to the Repository Files API. This API is
 * covered by the `write_repository` token scope, unlike the Commits API which
 * requires the broader `api` scope. Each call produces one commit.
 * Best-effort: never throws — returns a CommitResult describing the outcome.
 */
async function sendFile(
  method: "POST" | "PUT" | "DELETE",
  repoPath: string,
  message: string,
  content?: string,
  encoding?: "text" | "base64"
): Promise<CommitResult> {
  if (!isConfigured()) {
    console.warn("GitLab commit skipped: integration not configured");
    return { committed: false, skipped: true };
  }

  try {
    const token = await getToken();
    if (!token) {
      console.warn("GitLab commit skipped: no token available");
      return { committed: false, skipped: true };
    }

    const url = `${GITLAB_API_URL}/projects/${encodeURIComponent(
      GITLAB_PROJECT_ID
    )}/repository/files/${encodeURIComponent(repoPath)}`;

    const body: Record<string, string> = {
      branch: GITLAB_BRANCH,
      commit_message: message,
    };
    if (content !== undefined) body.content = content;
    if (encoding) body.encoding = encoding;

    const response = await fetch(url, {
      method,
      headers: { "PRIVATE-TOKEN": token, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const detail = await response.text();
      console.error(`GitLab file ${method} failed (${response.status}): ${detail}`);
      return { committed: false, error: `${response.status}: ${detail}` };
    }

    return { committed: true };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`GitLab file ${method} error: ${msg}`);
    return { committed: false, error: msg };
  }
}

/**
 * Create or update a single file via the Repository Files API. POST creates
 * (fails if the file exists) and PUT updates (fails if it doesn't), so we try
 * the preferred verb first and fall back to the other.
 */
export async function commitUpsert(
  filePath: string,
  content: string,
  encoding: "text" | "base64",
  message: string,
  preferCreate: boolean
): Promise<CommitResult> {
  const primary: "POST" | "PUT" = preferCreate ? "POST" : "PUT";
  const secondary: "POST" | "PUT" = preferCreate ? "PUT" : "POST";

  const first = await sendFile(primary, filePath, message, content, encoding);
  if (first.committed || first.skipped) return first;

  // The primary verb may have failed because the file already exists (or
  // doesn't yet) — retry with the opposite verb.
  return sendFile(secondary, filePath, message, content, encoding);
}

/**
 * Delete a set of repo files. The Repository Files API deletes one file per
 * request (one commit each), so removing a post with images produces several
 * commits. Best-effort per file.
 */
export async function commitDelete(filePaths: string[], message: string): Promise<CommitResult> {
  if (filePaths.length === 0) return { committed: false, skipped: true };

  let anyCommitted = false;
  let anyFailed = false;
  let lastError: string | undefined;

  for (const filePath of filePaths) {
    const result = await sendFile("DELETE", filePath, message);
    if (result.committed) {
      anyCommitted = true;
    } else if (!result.skipped) {
      anyFailed = true;
      lastError = result.error;
    }
  }

  if (anyCommitted) return { committed: true };
  if (anyFailed) return { committed: false, error: lastError };
  return { committed: false, skipped: true };
}

/** A single file change for a multi-file commit. */
export interface FileChange {
  action: "create" | "update" | "delete";
  filePath: string;
  content?: string;
  encoding?: "text" | "base64";
}

/**
 * Commit multiple file changes as a single atomic commit via the Commits API.
 * Unlike the Repository Files API (one commit per file), this batches an entire
 * operation — e.g. a taxonomy rename touching many posts — into one commit.
 *
 * Note: the Commits API requires the token to have the `api` scope (the Files
 * API only needs `write_repository`). Best-effort — never throws.
 */
export async function commitFiles(changes: FileChange[], message: string): Promise<CommitResult> {
  if (changes.length === 0) return { committed: false, skipped: true };
  if (!isConfigured()) {
    console.warn("GitLab commit skipped: integration not configured");
    return { committed: false, skipped: true };
  }

  try {
    const token = await getToken();
    if (!token) {
      console.warn("GitLab commit skipped: no token available");
      return { committed: false, skipped: true };
    }

    const url = `${GITLAB_API_URL}/projects/${encodeURIComponent(
      GITLAB_PROJECT_ID
    )}/repository/commits`;

    const response = await fetch(url, {
      method: "POST",
      headers: { "PRIVATE-TOKEN": token, "Content-Type": "application/json" },
      body: JSON.stringify({
        branch: GITLAB_BRANCH,
        commit_message: message,
        actions: changes.map((c) => ({
          action: c.action,
          file_path: c.filePath,
          ...(c.content !== undefined ? { content: c.content } : {}),
          ...(c.encoding ? { encoding: c.encoding } : {}),
        })),
      }),
    });

    if (!response.ok) {
      const detail = await response.text();
      console.error(`GitLab commit (multi-file) failed (${response.status}): ${detail}`);
      return { committed: false, error: `${response.status}: ${detail}` };
    }

    return { committed: true };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`GitLab commit (multi-file) error: ${msg}`);
    return { committed: false, error: msg };
  }
}

/** A commit touching a specific file, for revision history. */
export interface FileCommit {
  id: string;
  shortId: string;
  createdAt: string;
  message: string;
  authorName: string;
}

/**
 * List commits that touched a given repo file (most recent first). Read-only;
 * returns [] when git isn't configured or on error.
 */
export async function listFileCommits(repoPath: string, limit = 50): Promise<FileCommit[]> {
  if (!isConfigured()) return [];
  try {
    const token = await getToken();
    if (!token) return [];

    const url =
      `${GITLAB_API_URL}/projects/${encodeURIComponent(GITLAB_PROJECT_ID)}/repository/commits` +
      `?path=${encodeURIComponent(repoPath)}&ref_name=${encodeURIComponent(GITLAB_BRANCH)}` +
      `&per_page=${limit}`;

    const response = await fetch(url, { headers: { "PRIVATE-TOKEN": token } });
    if (!response.ok) {
      console.error(`GitLab list commits failed (${response.status}): ${await response.text()}`);
      return [];
    }

    const commits = (await response.json()) as Array<{
      id: string;
      short_id: string;
      created_at: string;
      message: string;
      author_name: string;
    }>;

    return commits.map((c) => ({
      id: c.id,
      shortId: c.short_id,
      createdAt: c.created_at,
      message: c.message,
      authorName: c.author_name,
    }));
  } catch (err) {
    console.error("GitLab list commits error:", err);
    return [];
  }
}

/**
 * Fetch the contents of a repo file at a specific ref (commit SHA). Returns the
 * decoded text, or null if unavailable.
 */
export async function getFileAtRef(repoPath: string, ref: string): Promise<string | null> {
  if (!isConfigured()) return null;
  try {
    const token = await getToken();
    if (!token) return null;

    const url =
      `${GITLAB_API_URL}/projects/${encodeURIComponent(GITLAB_PROJECT_ID)}/repository/files/` +
      `${encodeURIComponent(repoPath)}?ref=${encodeURIComponent(ref)}`;

    const response = await fetch(url, { headers: { "PRIVATE-TOKEN": token } });
    if (!response.ok) {
      console.error(`GitLab get file at ref failed (${response.status}): ${await response.text()}`);
      return null;
    }

    const data = (await response.json()) as { content: string; encoding: string };
    if (data.encoding === "base64") {
      return Buffer.from(data.content, "base64").toString("utf-8");
    }
    return data.content;
  } catch (err) {
    console.error("GitLab get file at ref error:", err);
    return null;
  }
}
