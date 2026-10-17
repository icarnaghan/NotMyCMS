/**
 * Site config for the CDK app.
 *
 * Read with `readFileSync` rather than a JSON import: the file sits outside the infra
 * tsconfig's root, and a relative JSON import would either fail that constraint or need
 * `resolveJsonModule` plus a rootDir change. Reading it avoids both.
 */
import { readFileSync } from "fs";
import * as path from "path";

/** Mirrors the shape in the repository-root `site.config.d.ts`. */
export interface SiteConfig {
  resourcePrefix: string;
  storagePrefix: string;
  region: string;
  apexDomain: string;
  domain: string;
  hostedZone: string;
  hostedZoneId: string;
  siteUrl: string;
  siteName: string;
  siteTitle: string;
  tagline: string;
  siteDescription: string;
  locale: string;
  author: { name: string; email: string; avatar?: string };
  analytics?: { provider: "ga4"; measurementId: string };
  git: {
    provider: "gitlab" | "github";
    apiUrl: string;
    /** The Content_Repo, not the repository this file lives in. */
    contentProjectId: string;
    branch: string;
  };
  social: { id: string; label: string; href: string }[];
}

const CONFIG_PATH = path.join(__dirname, "../../site.config.json");

export const siteConfig: SiteConfig = JSON.parse(readFileSync(CONFIG_PATH, "utf-8"));

/**
 * Builds an AWS resource name from the configured prefix.
 *
 * **Renaming a resource replaces it.** A Cognito user pool, DynamoDB table or S3 bucket
 * that changes name is destroyed and recreated empty, so `cdk diff` must be checked for
 * replacements before deploying any change to `resourcePrefix`.
 */
export function resourceName(...parts: string[]): string {
  return [siteConfig.resourcePrefix, ...parts].join("-");
}
