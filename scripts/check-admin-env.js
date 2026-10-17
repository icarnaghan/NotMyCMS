/**
 * Fails the admin build when its environment file is unusable.
 *
 * Runs as admin's `prebuild`, and needs no AWS credentials — which is the point. The CI
 * job that builds the admin SPA has none: only the deploy job assumes a role. So the
 * build cannot look the values up itself, and the only thing it can do is refuse to
 * produce a bundle that is guaranteed to fail on load.
 *
 * Without this, a missing value produces a successful build and an admin SPA that
 * throws "Both UserPoolId and ClientId are required" in the browser. That is a white
 * screen with the cause buried in a minified stack trace, and it has already happened
 * once here.
 *
 * `generate-admin-env.js --check` is the stronger version of this and verifies the
 * values against the live stack, but it needs credentials, so it belongs where those
 * exist rather than in the build.
 */
import { existsSync, readFileSync } from "fs";
import { ENV_LABEL, ENV_PATH, validateEnv, parseEnv } from "./admin-env.js";

if (!existsSync(ENV_PATH)) {
  console.error(`FAIL: ${ENV_LABEL} is missing.`);
  console.error("Run `make admin-env` with AWS credentials to generate it.");
  process.exit(1);
}

const problems = validateEnv(parseEnv(readFileSync(ENV_PATH, "utf-8")));

if (problems.length > 0) {
  console.error(`FAIL: ${ENV_LABEL} has ${problems.length} problem(s):`);
  for (const p of problems) console.error(`  - ${p}`);
  console.error("\nThe admin SPA would build successfully and then fail to load.");
  console.error("Run `make admin-env` with AWS credentials to regenerate.");
  process.exit(1);
}

console.log(`OK: ${ENV_LABEL} has the values the admin build needs`);
