import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

/**
 * A regression tripwire for the content-storage data-loss pairing.
 *
 * The site deploy's BucketDeployment is only safe to prune because it excludes
 * `content/*`. The migration moved through three states and the dangerous one —
 * `prune: true` with content *included* — would let a deploy built from a git tree
 * missing an admin-authored post delete that post from S3. The history shows this is a
 * pairing that is easy to get wrong by changing one setting and not the other.
 *
 * Synthesising the full SiteStack to assert this is impractical here: its
 * BucketDeployment bundles the ~1,180-file `dist/` asset, which stalls a unit test. The
 * real template is checked by `cdk diff` at deploy time. This instead reads the source
 * and enforces the invariant directly — cheap, and it fails loudly if someone flips
 * `prune` back on without keeping content excluded, or drops the content exclusion while
 * pruning is on.
 */
describe("site deploy prune/exclude invariant", () => {
  const source = readFileSync(join(__dirname, "site-stack.ts"), "utf-8");

  // Isolate the BucketDeployment call so unrelated `prune`/`exclude` elsewhere can't
  // satisfy or trip the checks.
  const deployBlock = (() => {
    const start = source.indexOf("new s3deploy.BucketDeployment(");
    expect(start, "BucketDeployment call not found").toBeGreaterThan(-1);
    // The call ends at the first `});` after it.
    const end = source.indexOf("});", start);
    expect(end, "BucketDeployment call close not found").toBeGreaterThan(start);
    return source.slice(start, end);
  })();

  function pruneValue(): boolean | null {
    const m = deployBlock.match(/prune:\s*(true|false)/);
    return m ? m[1] === "true" : null;
  }

  function excludeList(): string[] {
    const m = deployBlock.match(/exclude:\s*\[([^\]]*)\]/);
    if (!m) return [];
    return [...m[1].matchAll(/["']([^"']+)["']/g)].map((x) => x[1]);
  }

  it("declares an explicit prune setting rather than relying on the default", () => {
    // The CDK default is prune: true. Leaving it implicit is how the original data-loss
    // path existed; the value must be stated so the pairing is reviewable.
    expect(pruneValue()).not.toBeNull();
  });

  it("excludes content/* whenever pruning is on", () => {
    if (pruneValue() === true) {
      expect(excludeList()).toContain("content/*");
    }
  });

  it("also excludes admin/*, which the SPA sync owns", () => {
    expect(excludeList()).toContain("admin/*");
  });

  it("is in the safe post-1b state: pruning on, content excluded", () => {
    expect(pruneValue()).toBe(true);
    expect(excludeList()).toContain("content/*");
  });
});
