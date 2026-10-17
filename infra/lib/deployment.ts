/**
 * Everything that differs between one deployment of this site and another.
 *
 * Both stacks previously read `site.config.json` directly and named their resources from
 * its `resourcePrefix`, which meant exactly one deployment could exist: a second set of
 * stacks would collide on every physical name. `site-stack.ts` also hardcoded the domain
 * and looked up its hosted zone, so there was no way to stand up a copy without a
 * registered domain and a certificate.
 *
 * Passing this in instead makes a staging environment a declaration in `bin/app.ts`
 * rather than a code change — which is the point. Until now every change went straight
 * at production.
 */

/** A custom domain. Omitted for a deployment served on its CloudFront hostname. */
export interface CustomDomain {
  /** Apex domain, also used as the content bucket name. */
  apexDomain: string;
  /** Canonical host, e.g. `www.example.com`. */
  domain: string;
  /** Route53 zone name. May be a parent of the apex. */
  hostedZone: string;
  /** Route53 zone id. Configured rather than looked up — see `site-stack.ts`. */
  hostedZoneId: string;
}

export interface DeploymentConfig {
  /**
   * Prefix for every physical resource name.
   *
   * **Changing this on an existing deployment replaces its resources.** The Cognito
   * pool, the audit table and the content bucket would all be recreated empty. It
   * exists to separate deployments from each other, not to rename them.
   */
  resourcePrefix: string;

  /** Name of the content bucket. */
  bucketName: string;

  /**
   * Human-readable label for this deployment, used in the admin API description and the
   * SNS topic display name.
   *
   * Separate from `resourcePrefix` because that is a naming token. Reusing it here
   * turned the API description from the site's title into the bare prefix, which reads
   * like a typo. It also has to tell a staging alert from a production one at a glance,
   * since both arrive by email.
   */
  displayName: string;

  /**
   * Canonical origin, used for the Cognito callback URLs and the admin API's CORS
   * allow-list.
   *
   * For a deployment with no custom domain this is the CloudFront hostname, which is
   * not known until the distribution exists — see the note in `bin/app.ts`.
   */
  siteUrl: string;

  /** Omit to skip the certificate, the Route53 records and the apex redirect. */
  customDomain?: CustomDomain;

  /**
   * Whether to create the AWS Budgets alert.
   *
   * False for anything but production: a second budget on the same account measures the
   * same total spend and would double every notification.
   */
  costGuard: boolean;
}

/** Builds an AWS resource name from a deployment's prefix. */
export function nameFor(deployment: DeploymentConfig, ...parts: string[]): string {
  return [deployment.resourcePrefix, ...parts].join("-");
}
