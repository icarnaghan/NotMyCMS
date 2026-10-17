import * as cdk from "aws-cdk-lib";
import * as cognito from "aws-cdk-lib/aws-cognito";
import * as lambda from "aws-cdk-lib/aws-lambda";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as apigwv2 from "aws-cdk-lib/aws-apigatewayv2";
import * as iam from "aws-cdk-lib/aws-iam";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import * as events from "aws-cdk-lib/aws-events";
import * as targets from "aws-cdk-lib/aws-events-targets";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as sns from "aws-cdk-lib/aws-sns";
import * as subscriptions from "aws-cdk-lib/aws-sns-subscriptions";
import * as logs from "aws-cdk-lib/aws-logs";
import * as cloudwatch from "aws-cdk-lib/aws-cloudwatch";
import * as cwActions from "aws-cdk-lib/aws-cloudwatch-actions";
import * as destinations from "aws-cdk-lib/aws-lambda-destinations";
import * as budgets from "aws-cdk-lib/aws-budgets";
import { HttpUserPoolAuthorizer } from "aws-cdk-lib/aws-apigatewayv2-authorizers";
import { HttpLambdaIntegration } from "aws-cdk-lib/aws-apigatewayv2-integrations";
import { Construct } from "constructs";
import * as path from "path";
import { nameFor, type DeploymentConfig } from "./deployment";
// Still imported, but only for content identity — the feed title, description and
// language, which are the same for every deployment of this site. Everything that
// distinguishes one deployment from another arrives through `props.deployment`.
import { siteConfig } from "./site-config";

export interface AdminStackProps extends cdk.StackProps {
  /** What distinguishes this deployment from any other. */
  deployment: DeploymentConfig;
}

export class AdminStack extends cdk.Stack {
  public readonly userPool: cognito.UserPool;
  public readonly userPoolClient: cognito.UserPoolClient;
  public readonly httpApi: apigwv2.HttpApi;
  public readonly logsBucket: s3.Bucket;

  constructor(scope: Construct, id: string, props: AdminStackProps) {
    super(scope, id, props);

    const deployment = props.deployment;
    /** Physical resource names, scoped to this deployment. */
    const name = (...parts: string[]) => nameFor(deployment, ...parts);

    // Cognito User Pool — invite-only, no self-sign-up
    this.userPool = new cognito.UserPool(this, "AdminUserPool", {
      userPoolName: name("admin-pool"),
      selfSignUpEnabled: false,
      signInAliases: { email: true },
      autoVerify: { email: true },
      passwordPolicy: {
        minLength: 12,
        requireUppercase: true,
        requireLowercase: true,
        requireDigits: true,
        requireSymbols: true,
      },
      // Require TOTP (authenticator app) MFA. SMS is disabled to avoid an SNS
      // dependency/cost. The Cognito hosted UI walks the user through TOTP
      // enrollment on next sign-in, so no SPA changes are needed. If the
      // authenticator is lost, reset MFA for the user from the Cognito console.
      mfa: cognito.Mfa.REQUIRED,
      mfaSecondFactor: { sms: false, otp: true },
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    // Cognito domain (default prefix)
    const userPoolDomain = this.userPool.addDomain("AdminUserPoolDomain", {
      cognitoDomain: {
        domainPrefix: name("admin"),
      },
    });

    // App Client — SPA with PKCE flow, no client secret
    this.userPoolClient = this.userPool.addClient("AdminClient", {
      userPoolClientName: name("admin-spa"),
      generateSecret: false,
      authFlows: {
        userSrp: true,
      },
      oAuth: {
        flows: {
          authorizationCodeGrant: true,
        },
        scopes: [cognito.OAuthScope.OPENID, cognito.OAuthScope.EMAIL, cognito.OAuthScope.PROFILE],
        callbackUrls: [`${deployment.siteUrl}/admin/`],
        logoutUrls: [`${deployment.siteUrl}/admin/`],
      },
      accessTokenValidity: cdk.Duration.hours(1),
      refreshTokenValidity: cdk.Duration.days(30),
      idTokenValidity: cdk.Duration.hours(1),
      preventUserExistenceErrors: true,
      supportedIdentityProviders: [cognito.UserPoolClientIdentityProvider.COGNITO],
    });

    // Cognito JWT authorizer for the HTTP API
    const cognitoAuthorizer = new HttpUserPoolAuthorizer("CognitoAuthorizer", this.userPool, {
      userPoolClients: [this.userPoolClient],
    });

    // API Gateway HTTP API with CORS and default Cognito authorizer
    this.httpApi = new apigwv2.HttpApi(this, "AdminApi", {
      apiName: name("admin-api"),
      description: `Admin API for ${deployment.displayName} dashboard`,
      corsPreflight: {
        allowOrigins: [deployment.siteUrl],
        allowMethods: [
          apigwv2.CorsHttpMethod.GET,
          apigwv2.CorsHttpMethod.POST,
          apigwv2.CorsHttpMethod.PUT,
          apigwv2.CorsHttpMethod.DELETE,
          apigwv2.CorsHttpMethod.OPTIONS,
        ],
        allowHeaders: ["Authorization", "Content-Type"],
        maxAge: cdk.Duration.hours(1),
      },
      defaultAuthorizer: cognitoAuthorizer,
    });

    // --- Content Lambda ---

    // Reference the existing S3 content bucket by name
    const contentBucket = s3.Bucket.fromBucketName(this, "ContentBucket", deployment.bucketName);

    // Secret holding the GitLab token used to mirror admin content edits back
    // into the git repository. Created with a placeholder value — populate it
    // after deploy with a token that has write_repository scope, e.g.:
    //   aws secretsmanager put-secret-value \
    //     --secret-id <resourcePrefix>-admin/gitlab-token --secret-string '<token>'
    const gitlabTokenSecret = new secretsmanager.Secret(this, "GitLabToken", {
      secretName: `${name("admin")}/gitlab-token`,
      description: "GitLab token (write_repository) for mirroring admin content edits into git",
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    // Shared env for the Lambdas that commit content changes to git.
    //
    // These three were hardcoded here, and the `git` block in site.config.json was
    // validated and typed but read by nothing — so the config was decorative and the
    // real values lived in this file. They come from config now, which is what makes the
    // repository location an installation choice rather than a code edit.
    //
    // GITLAB_PROJECT_ID is the **Content_Repo**, not the repository this file lives in.
    // The token in the secret below must therefore have write_repository on *that*
    // project; a project access token scoped to the source repository will fail every
    // commit. While commits are best-effort the symptom is a logged error behind a
    // successful save, which is easy to miss — check the Audit Log after repointing.
    const gitProvider = siteConfig.git;
    const gitlabEnv: Record<string, string> = {
      GIT_PROVIDER: gitProvider.provider,
      GITLAB_API_URL: gitProvider.apiUrl,
      GITLAB_PROJECT_ID: gitProvider.contentProjectId,
      GITLAB_BRANCH: gitProvider.branch,
      GITLAB_TOKEN_SECRET_ARN: gitlabTokenSecret.secretArn,
    };

    // --- Failure alerts ---

    // SNS topic for operational failures. The scheduled publisher runs hourly
    // with nobody watching, so without an alert the only signal that it broke is
    // the admin Deploy page or CloudWatch.
    //
    // Subscribe an email address by setting the `alertEmail` context value:
    //   cdk deploy --context alertEmail=you@example.com
    // In CI the deploy job passes this through from the ALERT_EMAIL variable. An
    // empty or malformed value is ignored (no subscription) so deploys still work.
    // AWS sends a confirmation link that must be clicked before delivery starts.
    // The topic is also a convenient target for an AWS Budgets alert later.
    const alertTopic = new sns.Topic(this, "AlertTopic", {
      topicName: name("admin-alerts"),
      displayName: `${deployment.displayName} admin alerts`,
    });

    const alertEmail = this.node.tryGetContext("alertEmail");
    if (typeof alertEmail === "string" && alertEmail.includes("@")) {
      alertTopic.addSubscription(new subscriptions.EmailSubscription(alertEmail));
    }

    // Audit log table — records who/what/when for admin mutations, including
    // whether each change was mirrored to git. Single partition keyed by time.
    const auditTable = new dynamodb.Table(this, "AuditTable", {
      tableName: name("admin-audit"),
      partitionKey: { name: "pk", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "sk", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      // The audit log is the only record of who changed what and when, and
      // RETAIN alone does not protect against a bad write or an accidental
      // item deletion. PITR gives 35 days of second-granularity recovery for a
      // few cents at this table's size.
      //
      // Note this is a 35-day window, not an archive. Longer retention needs a
      // scheduled table export.
      //
      // `pointInTimeRecovery` (the boolean) is deprecated in favour of this
      // property.
      pointInTimeRecoverySpecification: {
        pointInTimeRecoveryEnabled: true,
      },
    });

    // Content Lambda function — handles CRUD for /api/content/{type} and /api/content/{type}/{slug}
    const contentFn = new NodejsFunction(this, "ContentFn", {
      functionName: name("admin-content"),
      // CloudWatch log groups never expire by default, so retention is set
      // explicitly on every function. Reserved concurrency is a cost ceiling and
      // an emergency kill switch (set it to 0 to stop a function dead) — this is
      // a single-user admin, so these limits are far above real usage.
      logRetention: logs.RetentionDays.ONE_MONTH,
      reservedConcurrentExecutions: 10,
      runtime: lambda.Runtime.NODEJS_22_X,
      entry: path.join(__dirname, "../lambda/content/index.ts"),
      handler: "handler",
      // Higher memory also raises CPU + network throughput, which speeds up the
      // many parallel S3 reads used to list content (dominant cost for ~600 files).
      memorySize: 1024,
      timeout: cdk.Duration.seconds(60),
      environment: {
        CONTENT_BUCKET: contentBucket.bucketName,
        AUDIT_TABLE: auditTable.tableName,
        ...gitlabEnv,
      },
    });

    // Grant S3 read/write permissions to the content bucket
    contentBucket.grantReadWrite(contentFn);

    // Allow the content Lambda to read the GitLab token
    gitlabTokenSecret.grantRead(contentFn);

    // Allow writing audit entries
    auditTable.grantWriteData(contentFn);

    // API Gateway integration for ContentLambda
    const contentIntegration = new HttpLambdaIntegration("ContentIntegration", contentFn);

    // Routes: GET/PUT/DELETE /api/content/{type}
    this.httpApi.addRoutes({
      path: "/api/content/{type}",
      methods: [apigwv2.HttpMethod.GET],
      integration: contentIntegration,
    });

    this.httpApi.addRoutes({
      path: "/api/content/{type}",
      methods: [apigwv2.HttpMethod.PUT],
      integration: contentIntegration,
    });

    // Routes: GET/PUT/DELETE /api/content/{type}/{slug}
    this.httpApi.addRoutes({
      path: "/api/content/{type}/{slug}",
      methods: [apigwv2.HttpMethod.GET],
      integration: contentIntegration,
    });

    this.httpApi.addRoutes({
      path: "/api/content/{type}/{slug}",
      methods: [apigwv2.HttpMethod.PUT],
      integration: contentIntegration,
    });

    this.httpApi.addRoutes({
      path: "/api/content/{type}/{slug}",
      methods: [apigwv2.HttpMethod.DELETE],
      integration: contentIntegration,
    });

    // Revision history + rollback
    this.httpApi.addRoutes({
      path: "/api/content/{type}/{slug}/revisions",
      methods: [apigwv2.HttpMethod.GET],
      integration: contentIntegration,
    });

    this.httpApi.addRoutes({
      path: "/api/content/{type}/{slug}/restore",
      methods: [apigwv2.HttpMethod.POST],
      integration: contentIntegration,
    });

    // --- Pages Lambda (landing-page editor) ---

    // Landing pages are JSON documents, not markdown, so they get their own Lambda and
    // route namespace rather than a `type` branch of /api/content — keeping a post-shaped
    // assumption from leaking into pages. Same commit-then-write contract and git wiring.
    const pagesFn = new NodejsFunction(this, "PagesFn", {
      functionName: name("admin-pages"),
      logRetention: logs.RetentionDays.ONE_MONTH,
      reservedConcurrentExecutions: 10,
      runtime: lambda.Runtime.NODEJS_22_X,
      entry: path.join(__dirname, "../lambda/pages/index.ts"),
      handler: "handler",
      memorySize: 1024,
      timeout: cdk.Duration.seconds(60),
      environment: {
        CONTENT_BUCKET: contentBucket.bucketName,
        AUDIT_TABLE: auditTable.tableName,
        ...gitlabEnv,
      },
    });

    contentBucket.grantReadWrite(pagesFn);
    gitlabTokenSecret.grantRead(pagesFn);
    auditTable.grantWriteData(pagesFn);

    const pagesIntegration = new HttpLambdaIntegration("PagesIntegration", pagesFn);

    // GET /api/pages (list)
    this.httpApi.addRoutes({
      path: "/api/pages",
      methods: [apigwv2.HttpMethod.GET],
      integration: pagesIntegration,
    });

    // GET/PUT /api/pages (PUT with slug in the body is create)
    this.httpApi.addRoutes({
      path: "/api/pages",
      methods: [apigwv2.HttpMethod.PUT],
      integration: pagesIntegration,
    });

    // GET/PUT/DELETE /api/pages/{slug+} — greedy, because a landing-page slug may contain
    // slashes (teaching/cmst388-tips). The handler reads it from pathParameters.proxy.
    this.httpApi.addRoutes({
      path: "/api/pages/{slug+}",
      methods: [apigwv2.HttpMethod.GET, apigwv2.HttpMethod.PUT, apigwv2.HttpMethod.DELETE],
      integration: pagesIntegration,
    });

    // --- Media Lambda ---

    // Media Lambda function — handles image uploads for POST /api/media/{type}/{slug}
    const mediaFn = new NodejsFunction(this, "MediaFn", {
      functionName: name("admin-media"),
      logRetention: logs.RetentionDays.ONE_MONTH,
      reservedConcurrentExecutions: 5,
      runtime: lambda.Runtime.NODEJS_22_X,
      entry: path.join(__dirname, "../lambda/media/index.ts"),
      handler: "handler",
      memorySize: 256,
      timeout: cdk.Duration.seconds(30),
      environment: {
        CONTENT_BUCKET: contentBucket.bucketName,
        AUDIT_TABLE: auditTable.tableName,
        ...gitlabEnv,
      },
      bundling: {
        nodeModules: ["busboy"],
      },
    });

    // Grant S3 read/write permissions (upload, list, and delete images)
    contentBucket.grantReadWrite(mediaFn);

    // Allow the media Lambda to read the GitLab token
    gitlabTokenSecret.grantRead(mediaFn);

    // Allow writing audit entries
    auditTable.grantWriteData(mediaFn);

    // API Gateway integration for MediaLambda
    const mediaIntegration = new HttpLambdaIntegration("MediaIntegration", mediaFn);

    // Route: POST /api/media/{type}/{slug} (upload), GET (list)
    this.httpApi.addRoutes({
      path: "/api/media/{type}/{slug}",
      methods: [apigwv2.HttpMethod.POST],
      integration: mediaIntegration,
    });

    this.httpApi.addRoutes({
      path: "/api/media/{type}/{slug}",
      methods: [apigwv2.HttpMethod.GET],
      integration: mediaIntegration,
    });

    // Route: DELETE /api/media/{type}/{slug}/{filename}
    this.httpApi.addRoutes({
      path: "/api/media/{type}/{slug}/{filename}",
      methods: [apigwv2.HttpMethod.DELETE],
      integration: mediaIntegration,
    });

    // --- Taxonomy Lambda ---

    // Taxonomy Lambda function — handles GET /api/taxonomy, PUT /api/taxonomy/rename,
    // PUT /api/taxonomy/merge, DELETE /api/taxonomy/{name}
    const taxonomyFn = new NodejsFunction(this, "TaxonomyFn", {
      functionName: name("admin-taxonomy"),
      logRetention: logs.RetentionDays.ONE_MONTH,
      reservedConcurrentExecutions: 3,
      runtime: lambda.Runtime.NODEJS_22_X,
      entry: path.join(__dirname, "../lambda/taxonomy/index.ts"),
      handler: "handler",
      memorySize: 256,
      timeout: cdk.Duration.seconds(60),
      environment: {
        CONTENT_BUCKET: contentBucket.bucketName,
        AUDIT_TABLE: auditTable.tableName,
        ...gitlabEnv,
      },
    });

    // Grant S3 read/write permissions to the content bucket
    contentBucket.grantReadWrite(taxonomyFn);

    // Allow the taxonomy Lambda to read the GitLab token (mirrors bulk
    // rename/merge/delete edits back to git)
    gitlabTokenSecret.grantRead(taxonomyFn);

    // Allow writing audit entries
    auditTable.grantWriteData(taxonomyFn);

    // API Gateway integration for TaxonomyLambda
    const taxonomyIntegration = new HttpLambdaIntegration("TaxonomyIntegration", taxonomyFn);

    // Route: GET /api/taxonomy
    this.httpApi.addRoutes({
      path: "/api/taxonomy",
      methods: [apigwv2.HttpMethod.GET],
      integration: taxonomyIntegration,
    });

    // Route: PUT /api/taxonomy/rename
    this.httpApi.addRoutes({
      path: "/api/taxonomy/rename",
      methods: [apigwv2.HttpMethod.PUT],
      integration: taxonomyIntegration,
    });

    // Route: PUT /api/taxonomy/merge
    this.httpApi.addRoutes({
      path: "/api/taxonomy/merge",
      methods: [apigwv2.HttpMethod.PUT],
      integration: taxonomyIntegration,
    });

    // Route: DELETE /api/taxonomy/{name}
    this.httpApi.addRoutes({
      path: "/api/taxonomy/{name}",
      methods: [apigwv2.HttpMethod.DELETE],
      integration: taxonomyIntegration,
    });

    // --- Analytics Lambda ---

    // S3 logs bucket for CloudFront access logs
    this.logsBucket = new s3.Bucket(this, "LogsBucket", {
      bucketName: undefined, // Let CDK auto-name
      objectOwnership: s3.ObjectOwnership.BUCKET_OWNER_PREFERRED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      lifecycleRules: [
        {
          expiration: cdk.Duration.days(90),
        },
      ],
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    // Analytics Lambda function — parses CloudFront access logs
    const analyticsFn = new NodejsFunction(this, "AnalyticsFn", {
      functionName: name("admin-analytics"),
      logRetention: logs.RetentionDays.ONE_MONTH,
      reservedConcurrentExecutions: 3,
      // Invoked asynchronously by the daily EventBridge rule. Without a failure
      // destination, Lambda retries twice and then discards the event silently.
      onFailure: new destinations.SnsDestination(alertTopic),
      runtime: lambda.Runtime.NODEJS_22_X,
      entry: path.join(__dirname, "../lambda/analytics/index.ts"),
      handler: "handler",
      // Downloading + gunzipping + parsing CloudFront logs is CPU/IO heavy;
      // more memory raises CPU and network throughput to speed it up.
      memorySize: 1024,
      timeout: cdk.Duration.seconds(60),
      environment: {
        LOGS_BUCKET: this.logsBucket.bucketName,
      },
    });

    // Grant Lambda read permissions to the logs bucket (raw logs + rollups)
    this.logsBucket.grantRead(analyticsFn);

    // Allow writing the per-day rollups back to the logs bucket
    analyticsFn.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["s3:PutObject"],
        resources: [this.logsBucket.arnForObjects("analytics/daily/*")],
      })
    );

    // Daily schedule to pre-aggregate recent days so the admin's default
    // ranges load from cached rollups instead of re-parsing raw logs.
    new events.Rule(this, "AnalyticsAggregationSchedule", {
      description: "Pre-aggregate CloudFront analytics rollups daily",
      schedule: events.Schedule.cron({ minute: "0", hour: "2" }),
      targets: [new targets.LambdaFunction(analyticsFn)],
    });

    // API Gateway integration for AnalyticsLambda
    const analyticsIntegration = new HttpLambdaIntegration("AnalyticsIntegration", analyticsFn);

    // Route: GET /api/analytics
    this.httpApi.addRoutes({
      path: "/api/analytics",
      methods: [apigwv2.HttpMethod.GET],
      integration: analyticsIntegration,
    });

    // --- Deploy Lambda ---

    // Deploy Lambda function — regenerates the site manifests, search index,
    // RSS, and sitemap from the S3 content/ prefix and invalidates CloudFront.
    // The heavy work runs via an async self-invocation so the API request
    // returns immediately and the frontend polls for completion.
    const deployFn = new NodejsFunction(this, "DeployFn", {
      functionName: name("admin-deploy"),
      logRetention: logs.RetentionDays.ONE_MONTH,
      // Needs >1 because the API invocation self-invokes the async worker, so two
      // executions overlap briefly.
      reservedConcurrentExecutions: 3,
      // Covers BOTH async paths into this function: the hourly scheduled-publish
      // rule and the self-invoked regeneration worker. The in-handler SNS alert
      // only fires when the handler catches an error — it cannot fire if the
      // function is OOM-killed, times out, or never starts. This destination
      // catches exactly those cases.
      onFailure: new destinations.SnsDestination(alertTopic),
      runtime: lambda.Runtime.NODEJS_22_X,
      entry: path.join(__dirname, "../lambda/deploy/index.ts"),
      handler: "handler",
      memorySize: 512,
      timeout: cdk.Duration.seconds(300),
      environment: {
        CONTENT_BUCKET: contentBucket.bucketName,
        AUDIT_TABLE: auditTable.tableName,
        ALERT_TOPIC_ARN: alertTopic.topicArn,
        // Site identity for the RSS/sitemap regeneration this Lambda performs.
        // It duplicates scripts/generate-manifest.js, so both must see the same
        // values — these come from site.config.json, same as the build script.
        // SITE_ALIAS is matched against CloudFront distribution aliases to find
        // the distribution to invalidate.
        SITE_URL: deployment.siteUrl,
        // Matched against CloudFront distribution aliases to find which distribution
        // to invalidate, so it must be this deployment's own domain. Inheriting the
        // site config value would mean a staging deploy purging production's cache.
        //
        // Empty for a deployment with no custom domain: the Lambda then matches no
        // distribution, logs "Could not find CloudFront distribution; skipping
        // invalidation", and carries on. Content is still written and the manifests
        // regenerated; only the cache purge is skipped.
        SITE_ALIAS: deployment.customDomain?.domain ?? "",
        // Content identity rather than deployment identity: a staging copy publishes
        // the same feed title and description, so these stay with the site config.
        SITE_NAME: siteConfig.siteName,
        SITE_DESCRIPTION: siteConfig.siteDescription,
        SITE_LOCALE: siteConfig.locale,
      },
    });

    // Allow writing audit entries
    auditTable.grantWriteData(deployFn);

    // Allow publishing failure alerts
    alertTopic.grantPublish(deployFn);

    // Read content + deploy status from S3
    deployFn.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["s3:GetObject"],
        resources: [
          contentBucket.arnForObjects("content/*"),
          contentBucket.arnForObjects("admin/deploy-status.json"),
          contentBucket.arnForObjects("admin/deploy-history.json"),
          // The SPA shell, which every prerendered page is built from. Read-only: this
          // Lambda injects a per-page head into a copy, it never rewrites the shell.
          contentBucket.arnForObjects("index.html"),
        ],
      })
    );

    // List the content/ prefix
    deployFn.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["s3:ListBucket"],
        resources: [contentBucket.bucketArn],
      })
    );

    // Write regenerated artifacts + deploy status back to S3
    deployFn.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["s3:PutObject"],
        resources: [
          contentBucket.arnForObjects("content/posts/manifest.json"),
          contentBucket.arnForObjects("content/knowledge-base/manifest.json"),
          contentBucket.arnForObjects("search-index.json"),
          contentBucket.arnForObjects("rss.xml"),
          contentBucket.arnForObjects("sitemap.xml"),
          contentBucket.arnForObjects("admin/deploy-status.json"),
          contentBucket.arnForObjects("admin/deploy-history.json"),
        ],
      })
    );

    // Prerendered per-page heads: `<slug>/index.html` for posts and
    // `knowledge-base/<slug>/index.html` for articles. Delete as well as put, because a
    // post that is deleted or flipped back to draft has to lose its page — otherwise the
    // URL keeps advertising a post the site no longer lists.
    //
    // Enumerating ~1,170 slugs is not possible in a policy, so this is a wildcard. It is
    // wider than the Lambda's behaviour: `*/index.html` also matches the prerendered
    // pages of static routes, which only the build writes. Overwriting one of those is
    // recoverable by a rebuild.
    //
    // `admin/index.html` is the exception that is not recoverable that way — it is the
    // admin application itself, and `*/index.html` covers it. The explicit deny below
    // removes it, and an explicit deny beats any allow.
    //
    // Scoped to that one key rather than `admin/*` on purpose: the statement above
    // grants PutObject on `admin/deploy-status.json` and `admin/deploy-history.json`,
    // and a deny across the whole prefix would override it and break every deploy. The
    // wildcard only reaches one object under `admin/`, so only that one is denied.
    deployFn.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["s3:PutObject", "s3:DeleteObject"],
        resources: [contentBucket.arnForObjects("*/index.html")],
      })
    );

    deployFn.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.DENY,
        actions: ["s3:PutObject", "s3:DeleteObject"],
        resources: [contentBucket.arnForObjects("admin/index.html")],
      })
    );

    // Look up the CloudFront distribution and create invalidations
    deployFn.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["cloudfront:ListDistributions", "cloudfront:CreateInvalidation"],
        resources: ["*"],
      })
    );

    // Allow the Lambda to invoke itself for async regeneration work.
    // Use a constructed ARN (not deployFn.functionArn) to avoid a circular
    // dependency between the function and its own role policy.
    deployFn.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["lambda:InvokeFunction"],
        resources: [
          `arn:aws:lambda:${this.region}:${this.account}:function:${name("admin-deploy")}`,
        ],
      })
    );

    // API Gateway integration for DeployLambda
    const deployIntegration = new HttpLambdaIntegration("DeployIntegration", deployFn);

    // Route: POST /api/deploy
    this.httpApi.addRoutes({
      path: "/api/deploy",
      methods: [apigwv2.HttpMethod.POST],
      integration: deployIntegration,
    });

    // Route: GET /api/deploy/status
    this.httpApi.addRoutes({
      path: "/api/deploy/status",
      methods: [apigwv2.HttpMethod.GET],
      integration: deployIntegration,
    });

    // Route: GET /api/deploy/history
    this.httpApi.addRoutes({
      path: "/api/deploy/history",
      methods: [apigwv2.HttpMethod.GET],
      integration: deployIntegration,
    });

    // Scheduled publisher — hourly EventBridge trigger that publishes any
    // content whose scheduled date has arrived (future-dated posts go live
    // within the hour without a manual deploy). The Lambda no-ops when nothing
    // is due, so this is cheap and doesn't pollute deploy history.
    new events.Rule(this, "ScheduledPublishSchedule", {
      description: "Publish scheduled (future-dated) content when it comes due",
      schedule: events.Schedule.rate(cdk.Duration.hours(1)),
      targets: [
        new targets.LambdaFunction(deployFn, {
          event: events.RuleTargetInput.fromObject({ action: "scheduled-publish" }),
        }),
      ],
    });

    // --- Audit Lambda ---

    // Serves GET /api/audit — returns recent admin activity from the table.
    const auditFn = new NodejsFunction(this, "AuditFn", {
      functionName: name("admin-audit"),
      logRetention: logs.RetentionDays.ONE_MONTH,
      reservedConcurrentExecutions: 5,
      runtime: lambda.Runtime.NODEJS_22_X,
      entry: path.join(__dirname, "../lambda/audit/index.ts"),
      handler: "handler",
      memorySize: 256,
      timeout: cdk.Duration.seconds(30),
      environment: {
        AUDIT_TABLE: auditTable.tableName,
      },
    });

    auditTable.grantReadData(auditFn);

    const auditIntegration = new HttpLambdaIntegration("AuditIntegration", auditFn);

    this.httpApi.addRoutes({
      path: "/api/audit",
      methods: [apigwv2.HttpMethod.GET],
      integration: auditIntegration,
    });

    // --- Throttling ---

    // Put a rate ceiling on the HTTP API. Routes are Cognito-authorised, so this
    // isn't the first line of defence — it's a cost guard against a runaway
    // client or a loop, since API Gateway and Lambda both bill per request.
    // Generous for a single user (10 rps sustained, 20 burst).
    const defaultStage = this.httpApi.defaultStage?.node.defaultChild as
      apigwv2.CfnStage | undefined;
    if (defaultStage) {
      defaultStage.defaultRouteSettings = {
        throttlingRateLimit: 10,
        throttlingBurstLimit: 20,
      };
    }

    // --- Alarms ---

    // Deliberately kept at or below the CloudWatch free tier of 10 standard
    // alarms: one Errors alarm per function, ONE aggregate Throttles alarm across
    // all Lambdas in the region, and a duration alarm on the only long-running
    // function. Together that's 8.
    const alarmAction = new cwActions.SnsAction(alertTopic);

    const errorAlarmFunctions: Array<{ id: string; fn: lambda.IFunction }> = [
      { id: "Content", fn: contentFn },
      { id: "Pages", fn: pagesFn },
      { id: "Media", fn: mediaFn },
      { id: "Taxonomy", fn: taxonomyFn },
      { id: "Analytics", fn: analyticsFn },
      { id: "Deploy", fn: deployFn },
      { id: "Audit", fn: auditFn },
    ];

    for (const { id, fn } of errorAlarmFunctions) {
      const alarm = new cloudwatch.Alarm(this, `${id}FnErrorAlarm`, {
        alarmName: name("admin", id.toLowerCase(), "errors"),
        alarmDescription: `Errors invoking the ${id} Lambda`,
        metric: fn.metricErrors({ period: cdk.Duration.minutes(5) }),
        threshold: 1,
        evaluationPeriods: 1,
        comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
        // A period with no invocations reports no data; that isn't a problem.
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      });
      alarm.addAlarmAction(alarmAction);
    }

    // No FunctionName dimension, so this covers every Lambda in the region in a
    // single alarm rather than one per function.
    const throttleAlarm = new cloudwatch.Alarm(this, "LambdaThrottleAlarm", {
      alarmName: name("admin-lambda-throttles"),
      alarmDescription:
        "A Lambda was throttled — reserved concurrency may be too low, or something is looping",
      metric: new cloudwatch.Metric({
        namespace: "AWS/Lambda",
        metricName: "Throttles",
        statistic: "Sum",
        period: cdk.Duration.minutes(5),
      }),
      threshold: 1,
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });
    throttleAlarm.addAlarmAction(alarmAction);

    // The deploy worker has a 300s timeout and does the heavy regeneration. Warn
    // before it starts hitting that ceiling (80% of timeout).
    const deployDurationAlarm = new cloudwatch.Alarm(this, "DeployFnDurationAlarm", {
      alarmName: name("admin-deploy-duration"),
      alarmDescription: "Deploy Lambda approaching its timeout",
      metric: deployFn.metricDuration({ period: cdk.Duration.minutes(5), statistic: "Maximum" }),
      threshold: cdk.Duration.seconds(240).toMilliseconds(),
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });
    deployDurationAlarm.addAlarmAction(alarmAction);

    // --- Cost guard ---

    // A request flood is the realistic cost risk for a static site (WAF wouldn't
    // cap spend — it bills per request too), so a budget alert is the actual
    // mitigation. Free. Override the threshold with:
    //   cdk deploy --context monthlyBudgetUsd=50
    //
    // $30 rather than a rounder $20: measured baseline (registrar excluded, see
    // the filterExpression below) runs $15–16/month, and the 80% actual
    // notification would fire at $16 — on the line every month. $30 warns at $24,
    // which leaves room for intermittent EC2 use without crying wolf while still
    // catching a genuine runaway, which here would be hundreds rather than tens.
    //
    // Note CI does not pass this context value, so this default is what actually
    // deploys. A --context override applies only to the deploy that sets it.
    const monthlyBudgetUsd = Number(this.node.tryGetContext("monthlyBudgetUsd") ?? 30);

    // AWS Budgets publishes as a service principal, so the topic policy has to
    // allow it explicitly.
    alertTopic.addToResourcePolicy(
      new iam.PolicyStatement({
        actions: ["SNS:Publish"],
        principals: [new iam.ServicePrincipal("budgets.amazonaws.com")],
        resources: [alertTopic.topicArn],
      })
    );

    // Production only. AWS Budgets measures total account spend, so a second budget
    // on the same account would double every notification rather than scope to this
    // deployment.
    if (deployment.costGuard) {
      new budgets.CfnBudget(this, "MonthlyCostBudget", {
        budget: {
          budgetName: name("monthly-cost"),
          budgetType: "COST",
          timeUnit: "MONTHLY",
          budgetLimit: { amount: monthlyBudgetUsd, unit: "USD" },

          // Track infrastructure only, excluding domain registration.
          //
          // Domain renewals bill through the "Amazon Registrar" service as lumpy
          // annual charges — ~$47 in a single month across 11 auto-renewing
          // domains, which is more than twice the entire infrastructure spend. Left
          // unfiltered, this budget breaches in every renewal month no matter how
          // the infrastructure is behaving, and an alert that always fires is an
          // alert you learn to ignore. Renewals are also not something an alert can
          // help with: they're a known, fixed, deliberate commitment.
          //
          // FilterExpression is the newer Budgets filtering API and the only one
          // that can express exclusion — the legacy CostFilters map is include-only,
          // so an allow-list would silently miss any new service. AWS requires
          // FilterExpression and Metrics together and they cannot be combined with
          // CostFilters/CostTypes:
          // https://docs.aws.amazon.com/cli/latest/reference/budgets/create-budget.html
          //
          // matchOptions is omitted deliberately; it defaults to EQUALS, and the
          // docs allow only one value in that array.
          metrics: ["UnblendedCost"],
          filterExpression: {
            not: {
              dimensions: {
                key: "SERVICE",
                values: ["Amazon Registrar"],
              },
            },
          },
        },
        notificationsWithSubscribers: [
          {
            // Fires on forecast, so it warns before the money is actually spent.
            notification: {
              notificationType: "FORECASTED",
              comparisonOperator: "GREATER_THAN",
              threshold: 100,
              thresholdType: "PERCENTAGE",
            },
            subscribers: [{ subscriptionType: "SNS", address: alertTopic.topicArn }],
          },
          {
            notification: {
              notificationType: "ACTUAL",
              comparisonOperator: "GREATER_THAN",
              threshold: 80,
              thresholdType: "PERCENTAGE",
            },
            subscribers: [{ subscriptionType: "SNS", address: alertTopic.topicArn }],
          },
        ],
      });
    }

    // Stack outputs
    new cdk.CfnOutput(this, "UserPoolId", {
      value: this.userPool.userPoolId,
      description: "Cognito User Pool ID",
      exportName: "AdminUserPoolId",
    });

    new cdk.CfnOutput(this, "UserPoolClientId", {
      value: this.userPoolClient.userPoolClientId,
      description: "Cognito User Pool Client ID",
      exportName: "AdminUserPoolClientId",
    });

    new cdk.CfnOutput(this, "UserPoolDomain", {
      value: userPoolDomain.domainName,
      description: "Cognito User Pool Domain Prefix",
      exportName: "AdminUserPoolDomain",
    });

    new cdk.CfnOutput(this, "ApiEndpoint", {
      value: this.httpApi.apiEndpoint,
      description: "Admin API Gateway endpoint URL",
      exportName: "AdminApiEndpoint",
    });

    new cdk.CfnOutput(this, "AlertTopicArn", {
      value: alertTopic.topicArn,
      description: "SNS topic for deploy/scheduled-publish failure alerts",
      exportName: "AdminAlertTopicArn",
    });

    new cdk.CfnOutput(this, "LogsBucketName", {
      value: this.logsBucket.bucketName,
      description: "S3 bucket for CloudFront access logs",
      exportName: "AdminLogsBucketName",
    });
  }
}
