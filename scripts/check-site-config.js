/**
 * CLI wrapper around the site config validator. Exits non-zero on any problem so it can
 * gate the build.
 */
import { readFileSync } from "fs";
import { validateSiteConfig } from "./validate-site-config.js";

const path = "site.config.json";

let config;
try {
  config = JSON.parse(readFileSync(path, "utf-8"));
} catch (err) {
  console.error(`FAIL: could not read ${path}: ${err.message}`);
  process.exit(1);
}

const problems = validateSiteConfig(config);

if (problems.length > 0) {
  console.error(`FAIL: ${path} has ${problems.length} problem(s):`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}

console.log(`OK: ${path} is valid`);
