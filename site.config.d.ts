/**
 * Shape of `site.config.json` — everything that identifies one deployment.
 *
 * JSON rather than TypeScript on purpose: four consumers read it (the public site, the
 * admin SPA, the build scripts, and the CDK app), and the scripts are plain ESM while
 * CDK compiles under its own tsconfig. A `.ts` config would need a loader in two places
 * for no functional gain, and JSON is the format an admin editor would need anyway.
 *
 * These declarations describe the file but cannot enforce it — a `.d.ts` does not check
 * JSON contents. `scripts/validate-site-config.js` is the actual guarantee and runs in
 * the build and in tests.
 */

/** A social profile. Icon artwork lives in `src/lib/social-icons.tsx`, keyed by `id`. */
export interface SocialLink {
  /** Stable key, also used to look up the icon. */
  id: string;
  /** Accessible label, shown as link text. */
  label: string;
  href: string;
}

export interface SiteConfig {
  /**
   * Prefix for AWS resource names. Changing this renames resources, and renaming a
   * Cognito pool, DynamoDB table or S3 bucket **replaces** it and destroys its contents.
   */
  resourcePrefix: string;

  /**
   * Prefix for browser storage keys. Deliberately separate from `resourcePrefix`:
   * changing it silently resets every visitor's saved theme and density, so it must be
   * possible to rename AWS resources without doing that.
   */
  storagePrefix: string;

  region: string;

  /** Apex domain, e.g. `example.com`. */
  apexDomain: string;
  /** Canonical host the site is served from, e.g. `www.example.com`. */
  domain: string;
  /** Route53 hosted zone name. Usually the apex. */
  hostedZone: string;
  /**
   * Route53 hosted zone id, e.g. `Z0123456789ABCDEFGHIJ`.
   *
   * Configured rather than discovered. `HostedZone.fromLookup` would call Route53 at
   * synth time and cache the result in `cdk.context.json`, whose cache key embeds the
   * AWS account id — that file was the only tracked one containing it. Looking it up
   * also makes synth require credentials, and a failed lookup can substitute a dummy id
   * and deploy DNS records pointing nowhere.
   *
   * Find it with: `aws route53 list-hosted-zones-by-name --dns-name <hostedZone>`
   */
  hostedZoneId: string;
  /** Canonical origin including scheme, used for canonical URLs, the sitemap and RSS. */
  siteUrl: string;

  /** Display name used in document titles, e.g. `Page | Ian Carnaghan`. */
  siteName: string;
  /** Fallback `<title>` for the app shell before a route sets its own. */
  siteTitle: string;
  /**
   * Title shown in the admin dashboard (top navigation, sidebar, document title).
   * Optional — defaults to `NotMyCMS` (the framework name) when unset. Set it to brand
   * the admin for a specific deployment.
   */
  adminTitle?: string;
  /** Short descriptor shown in page headers. */
  tagline: string;
  /**
   * Feed and meta description. Separate from `tagline` because the two currently differ
   * and both are visitor-facing — the tagline appears in headings, this appears in the
   * RSS channel and in feed readers.
   */
  siteDescription: string;
  /** BCP 47 language tag for `<html lang>` and the RSS `<language>` element. */
  locale: string;

  author: {
    name: string;
    /** Also the default target for operational alerts. */
    email: string;
    /** Site-relative path to a portrait. Omit to render the home page without one. */
    avatar?: string;
  };

  /** Omit entirely to build without any analytics snippet. */
  analytics?: {
    provider: "ga4";
    measurementId: string;
  };

  /**
   * Base URL for the admin's Help links — the repository's rendered documentation. The
   * admin appends `/<path>` (e.g. `/docs/setup.md`), so no trailing slash. Optional:
   * omit it and the Help page carries no outbound links. A framework consumer points
   * this at its own repository's docs.
   */
  docsBaseUrl?: string;

  /** Where content is committed. Provider is abstracted; see the content-storage spec. */
  git: {
    provider: "gitlab" | "github";
    apiUrl: string;
    /**
     * The Content_Repo — the private repository holding only content — as a numeric id
     * or URL-encoded path, depending on provider.
     *
     * Not the repository this file lives in. Named `contentProjectId` rather than
     * `projectId` because confusing the two silently commits content to the wrong place;
     * the validator rejects the old key rather than ignoring it.
     */
    contentProjectId: string;
    branch: string;
  };

  social: SocialLink[];
}

declare const config: SiteConfig;
export default config;
