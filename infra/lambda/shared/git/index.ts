/**
 * Selects the git provider for this deployment.
 *
 * The only entry point the Lambdas use. They depend on {@link GitProvider} and never on
 * a specific host, so adding GitHub is a new file here plus a configuration value — not
 * a change to the three Lambdas that write content.
 */
import type { CommitResult, GitProvider } from "./provider";
import * as gitlab from "./providers/gitlab";

export type { CommitResult, FileChange, FileCommit, GitProvider } from "./provider";

/**
 * Thrown when a commit that must succeed did not.
 *
 * Carries the HTTP status a handler should return. A commit the provider actually
 * attempted and that failed is the caller's fault as often as ours — a bad token, a
 * revoked scope, a project that moved — so 502 (we failed talking to an upstream)
 * rather than 500.
 */
export class CommitFailedError extends Error {
  readonly statusCode = 502;
  readonly code = "GIT_COMMIT_FAILED";
  constructor(message: string) {
    super(message);
    this.name = "CommitFailedError";
  }
}

/**
 * Stage 4's blocking contract, in one place so all three write Lambdas apply it
 * identically: **a save that did not reach git is not a save.**
 *
 * The subtlety is `skipped`. A provider returns `{committed: false, skipped: true}`
 * when git is not configured at all — no token secret. That is a deliberate deployment
 * choice (a framework install that hasn't wired up a content repo yet, and every test,
 * where the token is unset), not a failure, so it must *not* fail the save. Only an
 * attempted commit that failed — `error` set, `committed` false — blocks.
 *
 * Returns so the caller can thread the result into its audit entry; throws
 * {@link CommitFailedError} on a real failure.
 */
export function requireCommitted(result: CommitResult): CommitResult {
  if (result.committed || result.skipped) return result;
  throw new CommitFailedError(
    result.error
      ? `The change was not saved: committing to the content repository failed (${result.error}).`
      : "The change was not saved: committing to the content repository failed."
  );
}

/** Provider identifiers. Matches `git.provider` in `site.config.json`. */
export type GitProviderName = "gitlab" | "github";

/**
 * The GitLab provider, wrapping the existing module.
 *
 * Wrapped rather than rewritten as a class. That module reads its configuration from
 * environment variables at load time and has worked in production for months; the point
 * of this stage is to name the seam, not to rewrite the one implementation behind it.
 */
const gitlabProvider: GitProvider = {
  s3KeyToRepoPath: gitlab.s3KeyToRepoPath,
  commitUpsert: gitlab.commitUpsert,
  commitDelete: gitlab.commitDelete,
  commitFiles: gitlab.commitFiles,
  listFileCommits: gitlab.listFileCommits,
  getFileAtRef: gitlab.getFileAtRef,
};

/**
 * Returns the configured provider.
 *
 * Defaults to GitLab, which is what every deployment uses today. An unrecognised value
 * is a configuration error and is loud about it rather than silently falling back —
 * silently using GitLab when `github` was asked for would mean commits going to the
 * wrong host, or nowhere.
 */
export function createGitProvider(
  name: string = process.env.GIT_PROVIDER || "gitlab"
): GitProvider {
  switch (name) {
    case "gitlab":
      return gitlabProvider;
    case "github":
      throw new Error(
        "GIT_PROVIDER=github is not implemented yet. It is needed for the framework, " +
          "not for this site — see .kiro/specs/README.md."
      );
    default:
      throw new Error(`Unknown GIT_PROVIDER "${name}". Supported: gitlab.`);
  }
}
