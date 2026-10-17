import * as cdk from "aws-cdk-lib";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as origins from "aws-cdk-lib/aws-cloudfront-origins";
import * as acm from "aws-cdk-lib/aws-certificatemanager";
import * as route53 from "aws-cdk-lib/aws-route53";
import * as targets from "aws-cdk-lib/aws-route53-targets";
import * as s3deploy from "aws-cdk-lib/aws-s3-deployment";
import * as apigwv2 from "aws-cdk-lib/aws-apigatewayv2";
import { Construct } from "constructs";
import * as path from "path";
import { readFileSync } from "fs";
import { join } from "path";
import { type DeploymentConfig } from "./deployment";

export interface SiteStackProps extends cdk.StackProps {
  /** What distinguishes this deployment from any other. */
  deployment: DeploymentConfig;
  httpApi?: apigwv2.HttpApi;
  logsBucket?: s3.IBucket;
}

export class SiteStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: SiteStackProps) {
    super(scope, id, props);

    const deployment = props.deployment;

    /**
     * The custom domain, or `undefined` for a deployment served on its CloudFront
     * hostname.
     *
     * When absent the stack skips the ACM certificate, the Route53 records, the
     * `domainNames` on the distribution and the apex redirect. That is what makes a
     * staging environment possible without registering a second domain — previously
     * the domain was a module-level constant and a hosted-zone lookup, so a second
     * deployment could not be declared at all.
     */
    const custom = deployment.customDomain;

    /**
     * Canonical host used in redirect targets. Only meaningful with a custom domain;
     * the no-domain variant of the redirect function emits relative locations instead.
     */
    const WWW_DOMAIN = custom?.domain ?? "";

    // The hosted zone, taken from config rather than looked up.
    //
    // `fromLookup` would be the obvious choice, but it calls Route53 at synth time and
    // caches the answer in `cdk.context.json` — which was the only tracked file
    // containing the AWS account id, since the cache key embeds it. It also means synth
    // needs credentials, and that a failed lookup can substitute a dummy zone id and
    // deploy DNS records pointing nowhere.
    //
    // Reading the id from config removes all three: no account id in the repository, no
    // credentials needed to synth, and no lookup to fail. A framework consumer sets
    // their own id instead of inheriting a cache entry for someone else's zone.
    //
    // The zone name is configured separately from the apex domain because the zone can
    // be a parent of it — `blog.example.com` served from the `example.com` zone.
    const zone = custom
      ? route53.HostedZone.fromHostedZoneAttributes(this, "Zone", {
          hostedZoneId: custom.hostedZoneId,
          zoneName: custom.hostedZone,
        })
      : undefined;

    const bucket = new s3.Bucket(this, "SiteBucket", {
      bucketName: deployment.bucketName,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      // This bucket holds all published content, written by two paths that both make
      // sweeping changes: the admin (a taxonomy rename/merge rewrites hundreds of files
      // in one go) and the Reconcile_Job (which syncs `content/` with `--delete`, so a
      // bad push could remove objects). Versioning is the fast undo for either — the
      // Content_Repo is the authoritative history, but restoring an object version is
      // quicker than reconstructing from commits and re-reconciling.
      versioned: true,
      lifecycleRules: [
        {
          // Bound the cost of versioning: old versions are a short safety net,
          // not an archive. Git is the long-term history.
          noncurrentVersionExpiration: cdk.Duration.days(30),
          // Clean up incomplete multipart uploads (images) so they don't linger.
          abortIncompleteMultipartUploadAfter: cdk.Duration.days(7),
        },
      ],
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    // ACM certificate — validated automatically via Route53 DNS.
    // Skipped without a custom domain: CloudFront's default *.cloudfront.net
    // certificate already covers its own hostname.
    const certificate =
      custom && zone
        ? new acm.Certificate(this, "Certificate", {
            domainName: custom.apexDomain,
            subjectAlternativeNames: [custom.domain],
            validation: acm.CertificateValidation.fromDns(zone),
          })
        : undefined;

    // Redirect apex to www + handle legacy URL redirects
    const redirects = JSON.parse(readFileSync(join(__dirname, "../redirects.json"), "utf-8"));
    const redirectMap = JSON.stringify(redirects);

    /**
     * Viewer-request function: apex-to-canonical redirect, legacy URL redirects, and
     * the pretty-URL rewrite.
     *
     * Two variants rather than one parameterised body. With a custom domain the
     * redirect targets are absolute, which is what production has always emitted and
     * what keeps its template byte-identical. Without one there is no apex to redirect
     * from and no hostname to build an absolute URL with, so the redirects emit
     * relative locations — valid per RFC 7231 and resolved by the browser against the
     * request.
     *
     * Writing one body that handled both would have meant changing production's
     * emitted redirects to the relative form. That is a live change to 44 published
     * 301s for no benefit to production.
     */
    const redirectFunction = new cloudfront.Function(this, "RedirectToWww", {
      code: cloudfront.FunctionCode.fromInline(
        custom
          ? `
        var redirects = ${redirectMap};
        function handler(event) {
          var request = event.request;
          var host = request.headers.host.value;
          var uri = request.uri.replace(/\\/$/, '');
          if (host === '${custom.apexDomain}') {
            return {
              statusCode: 301,
              statusDescription: 'Moved Permanently',
              headers: { location: { value: 'https://${WWW_DOMAIN}' + uri } },
            };
          }
          if (uri === '/admin') {
            return {
              statusCode: 301,
              statusDescription: 'Moved Permanently',
              headers: { location: { value: 'https://${WWW_DOMAIN}/admin/' } },
            };
          }
          if (redirects[uri]) {
            return {
              statusCode: 301,
              statusDescription: 'Moved Permanently',
              headers: { location: { value: 'https://${WWW_DOMAIN}' + redirects[uri] } },
            };
          }
          // Pretty-URL rewrite: serve the prerendered per-page HTML for
          // extensionless routes (e.g. /my-post -> /my-post/index.html). Routes
          // without a generated page 403 and fall back to the root index.html
          // (SPA), so client-side routing still works.
          var reqUri = request.uri;
          if (reqUri !== '/' && !reqUri.match(/\\.[a-zA-Z0-9]+$/)) {
            request.uri = reqUri.replace(/\\/$/, '') + '/index.html';
          }
          return request;
        }
      `
          : `
        var redirects = ${redirectMap};
        function handler(event) {
          var request = event.request;
          var uri = request.uri.replace(/\\/$/, '');
          // Relative locations: there is no configured hostname to build an absolute
          // URL from, and the browser resolves these against the request.
          if (uri === '/admin') {
            return {
              statusCode: 301,
              statusDescription: 'Moved Permanently',
              headers: { location: { value: '/admin/' } },
            };
          }
          if (redirects[uri]) {
            return {
              statusCode: 301,
              statusDescription: 'Moved Permanently',
              headers: { location: { value: redirects[uri] } },
            };
          }
          var reqUri = request.uri;
          if (reqUri !== '/' && !reqUri.match(/\\.[a-zA-Z0-9]+$/)) {
            request.uri = reqUri.replace(/\\/$/, '') + '/index.html';
          }
          return request;
        }
      `
      ),
    });

    // Security headers applied to all responses
    const responseHeadersPolicy = new cloudfront.ResponseHeadersPolicy(this, "SecurityHeaders", {
      securityHeadersBehavior: {
        contentTypeOptions: { override: true },
        frameOptions: { frameOption: cloudfront.HeadersFrameOption.DENY, override: true },
        referrerPolicy: {
          referrerPolicy: cloudfront.HeadersReferrerPolicy.STRICT_ORIGIN_WHEN_CROSS_ORIGIN,
          override: true,
        },
        strictTransportSecurity: {
          accessControlMaxAge: cdk.Duration.days(365),
          includeSubdomains: true,
          override: true,
        },
        xssProtection: { protection: true, modeBlock: true, override: true },
      },
    });

    // The admin SPA's HTML entry point must never be cached long-term. It names the
    // current hashed bundle (e.g. assets/index-<hash>.js), and every admin deploy ships
    // a new hash and prunes the old asset. If a visitor keeps a cached index.html, it
    // asks for a bundle that no longer exists — the "Both UserPoolId and ClientId are
    // required" white screen we hit when the Cognito config first shipped. Force a
    // revalidation on every load so the browser always learns the new bundle hash.
    //
    // S3 objects carry no Cache-Control of their own, so without this CloudFront's
    // CACHING_OPTIMIZED policy caches the HTML for its default TTL. `override: true`
    // makes CloudFront stamp the header regardless of (absent) origin value.
    const noCacheHtmlPolicy = new cloudfront.ResponseHeadersPolicy(this, "AdminHtmlHeaders", {
      securityHeadersBehavior: {
        contentTypeOptions: { override: true },
        frameOptions: { frameOption: cloudfront.HeadersFrameOption.DENY, override: true },
        referrerPolicy: {
          referrerPolicy: cloudfront.HeadersReferrerPolicy.STRICT_ORIGIN_WHEN_CROSS_ORIGIN,
          override: true,
        },
        strictTransportSecurity: {
          accessControlMaxAge: cdk.Duration.days(365),
          includeSubdomains: true,
          override: true,
        },
        xssProtection: { protection: true, modeBlock: true, override: true },
      },
      customHeadersBehavior: {
        customHeaders: [
          {
            header: "cache-control",
            value: "no-cache, must-revalidate",
            override: true,
          },
        ],
      },
    });

    const distribution = new cloudfront.Distribution(this, "Distribution", {
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(bucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        responseHeadersPolicy,
        functionAssociations: [
          {
            function: redirectFunction,
            eventType: cloudfront.FunctionEventType.VIEWER_REQUEST,
          },
        ],
      },
      // Both omitted without a custom domain, so the distribution serves on its
      // own *.cloudfront.net hostname under CloudFront's default certificate.
      ...(custom ? { domainNames: [custom.apexDomain, custom.domain], certificate } : {}),
      defaultRootObject: "index.html",
      logBucket: props.logsBucket,
      logFilePrefix: "cf-logs/",
      errorResponses: [
        {
          httpStatus: 403,
          responseHttpStatus: 200,
          responsePagePath: "/index.html",
          ttl: cdk.Duration.seconds(0),
        },
        {
          httpStatus: 404,
          responseHttpStatus: 200,
          responsePagePath: "/index.html",
          ttl: cdk.Duration.seconds(0),
        },
      ],
      priceClass: cloudfront.PriceClass.PRICE_CLASS_100,
    });

    // A records for apex and canonical host pointing to CloudFront. Without a custom
    // domain there is no zone to write into — the CloudFront hostname resolves already.
    if (custom && zone) {
      new route53.ARecord(this, "ApexRecord", {
        zone,
        target: route53.RecordTarget.fromAlias(new targets.CloudFrontTarget(distribution)),
      });

      new route53.ARecord(this, "WwwRecord", {
        zone,
        recordName: custom.domain,
        target: route53.RecordTarget.fromAlias(new targets.CloudFrontTarget(distribution)),
      });
    }

    // --- Admin Dashboard CloudFront Behaviors ---

    // CloudFront Function to rewrite /admin/* SPA routes to /admin/index.html
    // This ensures client-side routing works by serving index.html for paths
    // that don't match a static file (no file extension).
    const adminSpaRewriteFunction = new cloudfront.Function(this, "AdminSpaRewrite", {
      code: cloudfront.FunctionCode.fromInline(`
        function handler(event) {
          var request = event.request;
          var uri = request.uri;
          // If the URI has a file extension, serve it as-is (static asset)
          if (uri.match(/\\.[a-zA-Z0-9]+$/)) {
            return request;
          }
          // Otherwise rewrite to /admin/index.html for SPA routing
          request.uri = '/admin/index.html';
          return request;
        }
      `),
    });

    // /admin/assets/* behavior — the hashed, content-addressed bundles. The filename
    // changes whenever the bytes change, so these are safe to cache forever. Declared
    // before /admin/* because CloudFront evaluates behaviors most-specific-first, so
    // asset requests take this immutable policy rather than the no-cache HTML one below.
    // No SPA-rewrite function here: asset paths always have an extension and should 404
    // honestly if missing, never fall back to index.html.
    distribution.addBehavior(
      "/admin/assets/*",
      origins.S3BucketOrigin.withOriginAccessControl(bucket),
      {
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        responseHeadersPolicy,
      }
    );

    // /admin/* behavior — serves admin SPA static files from S3 /admin/ prefix. In
    // practice this is the HTML entry point: the SPA-rewrite function sends every
    // extensionless path to /admin/index.html, and hashed assets are handled by the
    // more specific /admin/assets/* behavior above. It therefore gets the no-cache
    // header policy so a redeploy's new bundle hash is picked up on the next load.
    distribution.addBehavior("/admin/*", origins.S3BucketOrigin.withOriginAccessControl(bucket), {
      viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
      cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
      responseHeadersPolicy: noCacheHtmlPolicy,
      functionAssociations: [
        {
          function: adminSpaRewriteFunction,
          eventType: cloudfront.FunctionEventType.VIEWER_REQUEST,
        },
      ],
    });

    // /api/* behavior — routes to API Gateway HTTP API origin
    if (props.httpApi) {
      // Extract the API Gateway domain from the endpoint URL
      const apiEndpointUrl = props.httpApi.apiEndpoint;
      const apiDomain = cdk.Fn.select(2, cdk.Fn.split("/", apiEndpointUrl));

      const apiOrigin = new origins.HttpOrigin(apiDomain, {
        protocolPolicy: cloudfront.OriginProtocolPolicy.HTTPS_ONLY,
      });

      distribution.addBehavior("/api/*", apiOrigin, {
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
        originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
        allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
        responseHeadersPolicy,
      });
    }

    // Deploy built site to S3 and invalidate CloudFront cache
    new s3deploy.BucketDeployment(this, "Deploy", {
      sources: [s3deploy.Source.asset(path.join(__dirname, "../../dist"))],
      destinationBucket: bucket,
      distribution,
      distributionPaths: ["/*"],
      memoryLimit: 1024,
      ephemeralStorageSize: cdk.Size.mebibytes(1024),

      // `content/*` is excluded and `admin/*` is excluded, so this deploy owns only the
      // build's own output — the SPA shell, hashed assets, favicon and the ~1,180
      // prerendered heads. It no longer touches content at all.
      //
      // Content reaches S3 by a different path now: the admin writes it directly, and the
      // Content_Repo's Reconcile_Job syncs it on push (content-storage stage 5). This
      // deploy excluding content is therefore correct rather than a workaround — the two
      // writers own disjoint prefixes.
      //
      // That disjointness is also what lets `prune` go back on. Stage 1a disabled it to
      // close a data-loss path: with pruning on and content *included*, a deploy built
      // from a git tree missing an admin-only post would delete that post from S3. Now
      // that content is excluded, pruning can only remove stale build artifacts —
      // superseded hashed bundles, orphaned prerendered pages — which is exactly what it
      // is for. The data-loss path is gone because the thing it endangered is no longer
      // in this deploy's scope.
      //
      // Side effects of no longer rewriting content objects (requirement 8): the spurious
      // EDIT_CONFLICT from an editor left open across a deploy disappears, because the
      // `lastModified` concurrency token stops moving; and the deploy-churn version noise
      // in `content/posts/` stops accumulating.
      exclude: ["admin/*", "content/*"],
      prune: true,
    });

    new cdk.CfnOutput(this, "DistributionDomain", {
      value: distribution.distributionDomainName,
    });
  }
}
