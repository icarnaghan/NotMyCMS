import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { DOCS } from "./docs";

/**
 * Keeps the admin's help links honest.
 *
 * The Help page and the inline config hints link to docs in the repository and reference
 * config fields by name. Both can rot: a doc gets renamed, or a config field the hint
 * names gets removed. These assertions turn that rot into a failed test rather than a
 * dead link or a hint that lies.
 *
 * Pure (node env), like every admin test — no DOM, so it reads the real files from disk.
 * The repo root is two levels up from admin/src/lib.
 */
const REPO_ROOT = join(__dirname, "..", "..", "..");

describe("docs registry", () => {
  it("points every doc link at a file that exists in the repository", () => {
    for (const doc of Object.values(DOCS)) {
      const abs = join(REPO_ROOT, doc.path);
      expect(existsSync(abs), `${doc.label} → ${doc.path} does not exist`).toBe(true);
    }
  });
});

/**
 * The config fields the admin's hints tell users to edit must actually exist in
 * site.config.json. If a field is renamed or removed, this fails so the hint is fixed
 * rather than sending someone to edit a key that isn't there.
 *
 * Listed explicitly (not scraped from component source) so the assertion is a deliberate,
 * reviewable statement of "these are the config fields the UI references".
 */
describe("config fields referenced by the admin UI", () => {
  const config = JSON.parse(readFileSync(join(REPO_ROOT, "site.config.json"), "utf-8"));

  // Fields named in a ConfigHint / the Help page. Keep in step with the hints.
  const REFERENCED_FIELDS = ["social", "author", "siteDescription", "analytics"];

  it("every referenced field exists in site.config.json", () => {
    for (const field of REFERENCED_FIELDS) {
      expect(field in config, `site.config.json has no "${field}" field`).toBe(true);
    }
  });

  it("social is an array (the hint tells users to add/remove/reorder entries)", () => {
    expect(Array.isArray(config.social)).toBe(true);
  });
});
