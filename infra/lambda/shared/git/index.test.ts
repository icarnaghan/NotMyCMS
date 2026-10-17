import { describe, it, expect } from "vitest";
import { requireCommitted, CommitFailedError, type CommitResult } from "./index";

/**
 * The blocking-commit gate (content-storage stage 4).
 *
 * This is the single place that decides whether a git result should fail the save, and
 * all three write Lambdas call it, so its three outcomes are pinned here directly rather
 * than only through each handler. The one that matters and is easy to get wrong is
 * `skipped`: git being unconfigured is a deployment choice, not a failure, and treating
 * it as one would break every not-yet-wired install and every test where the token is
 * unset.
 */
describe("requireCommitted", () => {
  it("passes a successful commit through, returning it", () => {
    const result: CommitResult = { committed: true };
    expect(requireCommitted(result)).toBe(result);
  });

  it("passes a skip through — unconfigured git is not a failure", () => {
    const result: CommitResult = { committed: false, skipped: true };
    expect(requireCommitted(result)).toBe(result);
  });

  it("throws on an attempted commit that failed", () => {
    expect(() => requireCommitted({ committed: false, error: "403: insufficient_scope" })).toThrow(
      CommitFailedError
    );
  });

  it("includes the provider error in the thrown message", () => {
    try {
      requireCommitted({ committed: false, error: "403: insufficient_scope" });
      expect.unreachable("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(CommitFailedError);
      expect((err as CommitFailedError).message).toContain("insufficient_scope");
      expect((err as CommitFailedError).message).toContain("not saved");
    }
  });

  it("throws even when no error string is present, since the save still did not commit", () => {
    // committed:false with neither skipped nor error — defensive, but a save that did
    // not reach git must not look like one that did.
    expect(() => requireCommitted({ committed: false })).toThrow(CommitFailedError);
  });

  it("carries a 502 and a stable code for the handlers to return", () => {
    try {
      requireCommitted({ committed: false, error: "boom" });
      expect.unreachable("should have thrown");
    } catch (err) {
      const e = err as CommitFailedError;
      expect(e.statusCode).toBe(502);
      expect(e.code).toBe("GIT_COMMIT_FAILED");
      expect(e.name).toBe("CommitFailedError");
    }
  });
});
