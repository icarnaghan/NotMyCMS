#!/usr/bin/env node
import "source-map-support/register";
import * as cdk from "aws-cdk-lib";
import { SiteStack } from "../lib/site-stack";
import { AdminStack } from "../lib/admin-stack";
import { siteConfig } from "../lib/site-config";
import type { DeploymentConfig } from "../lib/deployment";

const app = new cdk.App();

const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: siteConfig.region,
};

/**
 * Production, described by `site.config.json`.
 *
 * Stack ids are derived from the prefix so a second deployment gets its own, but the
 * capitalisation here must keep producing `CarnaghanAdmin` and `CarnaghanSite` —
 * renaming a stack means CloudFormation creating a new one and orphaning everything in
 * the old.
 */
const production: DeploymentConfig = {
  resourcePrefix: siteConfig.resourcePrefix,
  bucketName: siteConfig.apexDomain,
  displayName: siteConfig.siteTitle,
  siteUrl: siteConfig.siteUrl,
  customDomain: {
    apexDomain: siteConfig.apexDomain,
    domain: siteConfig.domain,
    hostedZone: siteConfig.hostedZone,
    hostedZoneId: siteConfig.hostedZoneId,
  },
  costGuard: true,
};

/** `Carnaghan` from `carnaghan`. Stack ids are PascalCase; prefixes are lowercase. */
function stackPrefix(resourcePrefix: string): string {
  return resourcePrefix
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
}

function declare(deployment: DeploymentConfig) {
  const prefix = stackPrefix(deployment.resourcePrefix);

  const adminStack = new AdminStack(app, `${prefix}Admin`, { env, deployment });

  new SiteStack(app, `${prefix}Site`, {
    env,
    deployment,
    httpApi: adminStack.httpApi,
    logsBucket: adminStack.logsBucket,
  });
}

declare(production);

/**
 * Staging, declared only with `--context staging=true`.
 *
 * Served on its CloudFront hostname: no second domain, no certificate, no Route53
 * records. Everything else is a separate physical resource — its own bucket, Cognito
 * pool, audit table and SNS topic — so nothing is shared with production.
 *
 * **Two-phase on first deploy.** `siteUrl` feeds the Cognito callback URLs and the
 * admin API's CORS allow-list, but with no custom domain the real origin is the
 * CloudFront hostname, which does not exist until the distribution does. Deploy once to
 * create it, read `StagingSite.DistributionDomain` from the outputs, then redeploy with
 * `--context stagingSiteUrl=https://<that hostname>`. Until then the placeholder below
 * means the public site works but admin sign-in does not.
 *
 * A cleaner fix is possible — the admin stack could take the distribution domain as a
 * parameter resolved after the fact — but the two stacks already have a dependency in
 * the other direction (the site stack consumes the admin API as an origin), so breaking
 * the cycle properly is more than this task needs.
 */
if (app.node.tryGetContext("staging") === "true") {
  const stagingSiteUrl = app.node.tryGetContext("stagingSiteUrl");

  declare({
    resourcePrefix: `${siteConfig.resourcePrefix}-staging`,
    // S3 bucket names are globally unique and need not be a domain when nothing
    // resolves to them.
    bucketName: `${siteConfig.resourcePrefix}-staging-site`,
    // Says "staging" in the alert email subject and the API description, so a
    // rehearsal alarm is not mistaken for a production one.
    displayName: `${siteConfig.siteTitle} (staging)`,
    siteUrl: stagingSiteUrl ?? "https://example.invalid",
    // No customDomain: skips the certificate, the DNS records and the apex redirect.
    costGuard: false,
  });

  if (!stagingSiteUrl) {
    cdk.Annotations.of(app).addWarning(
      "staging: no --context stagingSiteUrl given, so Cognito callbacks point at a " +
        "placeholder and admin sign-in will fail. Deploy once, then redeploy with the " +
        "StagingSite.DistributionDomain output."
    );
  }
}
