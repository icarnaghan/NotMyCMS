/**
 * Site config for the build scripts.
 *
 * Read with `readFileSync` rather than a JSON import so there is no dependency on
 * import-attribute syntax or a particular Node version — these scripts run in CI as well
 * as locally.
 *
 * Validated on load. A build that would publish a site with a missing canonical origin
 * or an empty title should fail loudly at the start, not produce broken output.
 */
import { readFileSync } from "fs";
import { validateSiteConfig } from "./validate-site-config.js";

const path = "site.config.json";
export const siteConfig = JSON.parse(readFileSync(path, "utf-8"));

const problems = validateSiteConfig(siteConfig);
if (problems.length > 0) {
  console.error(`FAIL: ${path} has ${problems.length} problem(s):`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}

/** Absolute canonical URL for a site-relative path. */
export function absoluteUrl(p) {
  const clean = p.startsWith("/") ? p : `/${p}`;
  return `${siteConfig.siteUrl}${clean === "/" ? "" : clean}`;
}
