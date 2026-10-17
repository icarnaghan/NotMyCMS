/**
 * Writes `admin/.env.production` from the deployed stack's CloudFormation exports.
 *
 * Replaces a hand-maintained file. The values are not secret — they ship in the bundle —
 * but they are deployment-specific, and a hand-edited copy can drift from the stack
 * without anything noticing until the admin fails to load.
 *
 * Reads exports by name rather than describing a named stack, so it does not need to
 * know the stack is called `CarnaghanAdmin`. Requires AWS credentials.
 *
 *   node scripts/generate-admin-env.js            write the file
 *   node scripts/generate-admin-env.js --check    compare without writing
 */
import { execFileSync } from "child_process";
import { existsSync, readFileSync, writeFileSync } from "fs";
import { siteConfig } from "./site-config.js";
import { ENV_LABEL, ENV_PATH, REQUIRED_VARS, parseEnv, renderEnv } from "./admin-env.js";

const checkOnly = process.argv.includes("--check");

/** Reads every CloudFormation export in the configured region as a name/value map. */
function readExports() {
  let raw;
  try {
    // The AWS CLI paginates this automatically, so a long export list is not truncated.
    raw = execFileSync(
      "aws",
      [
        "cloudformation",
        "list-exports",
        "--region",
        siteConfig.region,
        "--query",
        "Exports[].[Name,Value]",
        "--output",
        "json",
      ],
      { encoding: "utf-8", stdio: ["ignore", "pipe", "pipe"] }
    );
  } catch (error) {
    console.error("FAIL: could not read CloudFormation exports.");
    console.error(
      "This needs AWS credentials for the account hosting the stack. " +
        "Run `aws login` or check AWS_PROFILE."
    );
    const detail = error.stderr?.toString().trim();
    if (detail) console.error(`\n${detail}`);
    process.exit(1);
  }

  return Object.fromEntries(JSON.parse(raw));
}

const exports_ = readExports();

const values = {};
const missing = [];
for (const { name, export: exportName, description } of REQUIRED_VARS) {
  const value = exports_[exportName];
  if (!value) {
    missing.push(`${exportName} (would supply ${name} — ${description})`);
    continue;
  }
  values[name] = value;
}

if (missing.length > 0) {
  console.error(`FAIL: ${missing.length} export(s) not found in ${siteConfig.region}:`);
  for (const m of missing) console.error(`  - ${m}`);
  console.error("\nIs the admin stack deployed to this account and region?");
  process.exit(1);
}

// The hosted-UI domain used to live in this file and is now derived by
// admin/src/lib/site-config.ts from `resourcePrefix` and `region`. That derivation is
// only correct while it agrees with what Cognito actually serves, and nothing else
// checks it — so check it here, where the deployed value is in hand. Changing
// `resourcePrefix` without redeploying would otherwise send every login to a hostname
// that does not exist.
const deployedDomainPrefix = exports_.AdminUserPoolDomain;
const derivedDomainPrefix = `${siteConfig.resourcePrefix}-admin`;
if (deployedDomainPrefix && deployedDomainPrefix !== derivedDomainPrefix) {
  console.error("FAIL: the Cognito hosted-UI domain the admin derives does not exist.");
  console.error(`  derived from site.config.json: ${derivedDomainPrefix}`);
  console.error(`  deployed (AdminUserPoolDomain): ${deployedDomainPrefix}`);
  console.error(
    "\nEither restore `resourcePrefix`, or deploy the stack so Cognito uses the new prefix."
  );
  process.exit(1);
}

const generated = renderEnv(values);

if (checkOnly) {
  if (!existsSync(ENV_PATH)) {
    console.error(`FAIL: ${ENV_LABEL} does not exist. Run \`make admin-env\`.`);
    process.exit(1);
  }

  // Compare parsed values, not file text: a comment edit or reordering is harmless and
  // should not fail the check.
  const current = parseEnv(readFileSync(ENV_PATH, "utf-8"));
  const drifted = REQUIRED_VARS.filter(({ name }) => current[name] !== values[name]);

  if (drifted.length > 0) {
    console.error(`FAIL: ${ENV_LABEL} has drifted from the deployed stack:`);
    for (const { name } of drifted) {
      console.error(`  ${name}`);
      console.error(`    file:  ${current[name] ?? "(missing)"}`);
      console.error(`    stack: ${values[name]}`);
    }
    console.error("\nRun `make admin-env` to regenerate.");
    process.exit(1);
  }

  console.log(`OK: ${ENV_LABEL} matches the deployed stack`);
  process.exit(0);
}

const unchanged = existsSync(ENV_PATH) && readFileSync(ENV_PATH, "utf-8") === generated;
writeFileSync(ENV_PATH, generated);

console.log(
  `${unchanged ? "OK" : "Wrote"}: ${ENV_LABEL}` + (unchanged ? " (already up to date)" : "")
);
for (const { name } of REQUIRED_VARS) {
  console.log(`    ${name}=${values[name]}`);
}
