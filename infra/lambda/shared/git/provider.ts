/**
 * The git operations the admin needs, independent of which host provides them.
 *
 * Three Lambdas — content, media and taxonomy — write content to S3 and commit the same
 * change to git. They each imported the GitLab module directly, which made GitLab a
 * structural dependency rather than a choice. For a framework intended to be used by
 * other people that is a hard blocker: most of them are on GitHub.
 *
 * The interface is deliberately the six operations already in use, not a general-purpose
 * git abstraction. Anything broader would be guessing at what a second provider needs.
 *
 * ## Error handling
 *
 * Every operation returns a {@link CommitResult} and **never throws**. That is today's
 * best-effort contract: the S3 write has already succeeded by the time a commit is
 * attempted, so a git failure is reported rather than raised.
 *
 * Stage 4 of the content-storage spec inverts this — commits become blocking and happen
 * first, so a failed commit fails the save. The return shape already carries everything
 * a caller needs to make that decision (`committed`, `skipped`, `error`), so that change
 * is in the callers rather than here.
 */

/** Outcome of a write operation. `skipped` means git is not configured. */
export interface CommitResult {
  committed: boolean;
  skipped?: boolean;
  error?: string;
}

/** A single file change within a multi-file commit. */
export interface FileChange {
  action: "create" | "update" | "delete";
  filePath: string;
  content?: string;
  encoding?: "text" | "base64";
}

/** A commit touching a specific file, for revision history. */
export interface FileCommit {
  id: string;
  shortId: string;
  createdAt: string;
  message: string;
  authorName: string;
}

export interface GitProvider {
  /**
   * Maps an S3 content key to its path in the repository.
   *
   * Provider-independent today, but it belongs on the interface because it encodes the
   * repository's layout, and that layout changes when content moves to its own
   * repository — stage 3.3 drops the `public/` prefix here.
   */
  s3KeyToRepoPath(s3Key: string): string;

  /**
   * Creates or updates one file, one commit.
   *
   * `preferCreate` is a hint, not a constraint: the implementation is expected to try
   * the other verb if the first fails, since the caller does not reliably know whether
   * the file already exists.
   */
  commitUpsert(
    filePath: string,
    content: string,
    encoding: "text" | "base64",
    message: string,
    preferCreate: boolean
  ): Promise<CommitResult>;

  /**
   * Deletes files. May produce one commit per file — deleting a post with images is
   * several commits on GitLab's Repository Files API.
   */
  commitDelete(filePaths: string[], message: string): Promise<CommitResult>;

  /**
   * Commits several changes as one atomic commit.
   *
   * Used where a single user action touches many files — a taxonomy rename rewrites
   * every post carrying the old tag, and that must be one revertible commit rather than
   * hundreds.
   */
  commitFiles(changes: FileChange[], message: string): Promise<CommitResult>;

  /** Commits touching a file, most recent first. Returns `[]` when unconfigured. */
  listFileCommits(repoPath: string, limit?: number): Promise<FileCommit[]>;

  /** A file's contents at a ref. Returns `null` when unavailable. */
  getFileAtRef(repoPath: string, ref: string): Promise<string | null>;
}
