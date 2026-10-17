import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

/**
 * A regression tripwire for the admin SPA cache strategy.
 *
 * The admin HTML entry point (index.html, served via the SPA-rewrite function) names the
 * current hashed bundle. Every admin deploy ships a new hash and prunes the old asset. If
 * CloudFront caches that HTML long-term, returning visitors load an index.html that points
 * at a deleted bundle and get a white screen — originally surfaced as Cognito's "Both
 * UserPoolId and ClientId are required". So the /admin/* behavior must carry a no-cache
 * response-headers policy, while /admin/assets/* (immutable, content-addressed) may cache.
 *
 * Synthesising the full SiteStack here is impractical (its BucketDeployment bundles the
 * ~1,180-file dist/ asset and stalls a unit test), so this reads the source and enforces
 * the wiring directly, in the same spirit as site-stack.prune.test.ts.
 */
describe("admin SPA cache behaviors", () => {
  const source = readFileSync(join(__dirname, "site-stack.ts"), "utf-8");

  function behaviorBlock(pattern: string): string {
    const marker = `distribution.addBehavior(\n      "${pattern}"`;
    const altMarker = `distribution.addBehavior("${pattern}"`;
    const start = source.indexOf(marker) >= 0 ? source.indexOf(marker) : source.indexOf(altMarker);
    expect(start, `addBehavior("${pattern}") not found`).toBeGreaterThan(-1);
    // Close is whichever comes first: "});" (single-line options arg) or ")" after a
    // "}\n    )" (multi-line call). Taking the earliest keeps each block to its own call
    // so a later behavior's options can't leak in.
    const inlineEnd = source.indexOf("});", start);
    const multiEnd = source.indexOf("}\n    );", start);
    const candidates = [inlineEnd, multiEnd].filter((i) => i > start);
    expect(candidates.length, `addBehavior("${pattern}") close not found`).toBeGreaterThan(0);
    const end = Math.min(...candidates);
    return source.slice(start, end);
  }

  it("defines a no-cache response-headers policy for the admin HTML entry point", () => {
    // The policy exists and sets Cache-Control to a non-caching value.
    const policyStart = source.indexOf("AdminHtmlHeaders");
    expect(policyStart, "AdminHtmlHeaders policy not found").toBeGreaterThan(-1);
    const policyBlock = source.slice(policyStart, source.indexOf("});", policyStart));
    expect(policyBlock).toMatch(/cache-control/i);
    expect(policyBlock).toMatch(/no-cache/i);
    expect(policyBlock).toMatch(/override:\s*true/);
  });

  it("applies the no-cache policy to the /admin/* (HTML) behavior", () => {
    expect(behaviorBlock("/admin/*")).toContain("responseHeadersPolicy: noCacheHtmlPolicy");
  });

  it("serves hashed assets from a dedicated /admin/assets/* behavior", () => {
    // Its presence is what keeps asset requests off the no-cache HTML behavior.
    const assets = behaviorBlock("/admin/assets/*");
    expect(assets).toContain("CACHING_OPTIMIZED");
    // Assets must not use the no-cache HTML policy — they are safe to cache forever.
    expect(assets).not.toContain("noCacheHtmlPolicy");
  });

  it("declares /admin/assets/* before /admin/* so the specific behavior wins", () => {
    const assetsIdx = source.indexOf('"/admin/assets/*"');
    const adminIdx = source.indexOf('"/admin/*"');
    expect(assetsIdx).toBeGreaterThan(-1);
    expect(adminIdx).toBeGreaterThan(-1);
    expect(assetsIdx).toBeLessThan(adminIdx);
  });
});
