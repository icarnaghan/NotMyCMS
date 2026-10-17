# Infrastructure

AWS CDK app with two stacks:

- **`CarnaghanSite`** (`lib/site-stack.ts`) — the public static site: S3 +
  CloudFront + ACM + Route53, plus the `/admin/*` and `/api/*` CloudFront
  behaviors.
- **`CarnaghanAdmin`** (`lib/admin-stack.ts`) — the admin CMS backend: Cognito,
  API Gateway (HTTP API), Lambda functions, a DynamoDB audit table, a Secrets
  Manager entry for the GitLab token, a CloudFront-logs bucket, and two
  EventBridge schedules (daily analytics rollups + hourly scheduled publishing).

`SiteStack` consumes the admin API (`httpApi`) and logs bucket from `AdminStack`,
so `AdminStack` deploys first.

## Public Site Architecture

```
Route53 DNS (carnaghan.com + www.carnaghan.com)
    │  A records (alias) → CloudFront
    ▼
CloudFront Distribution
    │  - HTTPS only (HTTP redirected)
    │  - ACM certificate (auto-validated via Route53)
    │  - Security headers (HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy)
    │  - CloudFront Function (apex → www + legacy redirects; pretty-URL rewrite
    │    of extensionless routes to /<path>/index.html for prerendered meta pages)
    │  - SPA routing: 403/404 → index.html (200)
    │  - Origin Access Control (OAC)
    │  - Price Class 100 (US, EU, Canada)
    ▼
S3 Bucket (carnaghan.com)
    │  - Private, no public access
    │  - Bucket policy allows CloudFront OAC only
    └── Vite build output (dist/)
```

## Admin Stack Architecture

```
CloudFront /api/*  →  API Gateway (HTTP API, Cognito JWT authorizer)
                          │
   ┌──────────────────────┼───────────────────────────────────────┐
   ▼            ▼          ▼            ▼             ▼             ▼
Content      Media     Taxonomy    Analytics       Deploy        Audit
Lambda       Lambda    Lambda      Lambda          Lambda        Lambda
   │            │          │            │             │             │
   ├─ S3 content bucket (read/write) ───┘             │             │
   ├─ GitLab API (mirror to git; token in Secrets Manager)         │
   │                                    ▼             ▼             ▼
   │                            CloudFront-logs   S3 + CloudFront  DynamoDB
   │                            bucket (rollups)  (invalidation)   (audit table)
   └─ DynamoDB audit table (write) ─────────────────────────────────┘

Cognito User Pool (invite-only, PKCE) ── authorizes all /api/* calls
EventBridge (daily)  ── invokes the Analytics Lambda to pre-aggregate rollups
EventBridge (hourly) ── invokes the Deploy Lambda to publish scheduled content
```

Resources created by `CarnaghanAdmin`:

- **Cognito** user pool + app client (SPA, PKCE, no secret; callback
  `https://www.carnaghan.com/admin/`). Required TOTP MFA (authenticator app; SMS
  disabled) — the hosted UI handles enrollment on next sign-in.
- **API Gateway** HTTP API with a Cognito JWT authorizer and CORS for
  `https://www.carnaghan.com`.
- **Lambdas**: content, media, taxonomy, analytics, deploy, audit.
- **DynamoDB** audit table (on-demand, retained).
- **Secrets Manager** secret `carnaghan-admin/gitlab-token` (see setup below).
- **S3** site bucket with versioning (noncurrent versions expire after 30 days) —
  a quick undo for a bad bulk operation, since the admin writes to it directly.
- **S3** logs bucket for CloudFront access logs (+ analytics rollups).
- **CloudWatch** 8 alarms (per-function `Errors`, one aggregate `Throttles`, deploy
  duration) and one-month log retention on every function. Note CloudWatch's ten
  free alarms are counted **per account**, not per stack, so check
  `aws cloudwatch describe-alarms` account-wide before assuming headroom.
- **AWS Budgets** monthly cost budget publishing to the alert topic
  (`--context monthlyBudgetUsd=50` to change the $30 default). Excludes the
  `Amazon Registrar` service so annual domain renewals don't breach it every
  renewal month — see
  [Architecture › Alarms, failure destinations and cost guard](../docs/architecture.md#alarms-failure-destinations-and-cost-guard).
- **EventBridge** daily rule to pre-aggregate analytics rollups, and an hourly
  rule that invokes the Deploy Lambda to publish scheduled (future-dated) content
  once its date has passed.
- **SNS** topic `carnaghan-admin-alerts` for deploy / scheduled-publish failure
  alerts. Subscribe an email address at deploy time:

  ```bash
  npx cdk deploy CarnaghanAdmin --context alertEmail=you@example.com
  ```

  AWS sends a confirmation link that must be clicked before delivery starts. Until
  it is, `aws sns list-subscriptions-by-topic` shows
  `SubscriptionArn: PendingConfirmation` and nothing is delivered — `make alerts`
  surfaces this. The mail is easily filtered as spam and its token expires after
  three days. The topic ARN is exported as a stack output, so it can also be used
  as the target for an AWS Budgets alert.

  **Omitting `alertEmail` deletes the subscription.** It is only synthesised when
  the context value is present, so a deploy without it renders a template with no
  subscription and CloudFormation removes the existing one — every alarm then
  publishes to a topic with no subscribers while still reporting `OK`. CI always
  passes `ALERT_EMAIL`; from a laptop use `make deploy-local`, which refuses to run
  without it, rather than a bare `cdk deploy`.

## Prerequisites

- Node.js LTS
- AWS CLI configured with appropriate credentials
- CDK CLI: `npm install -g aws-cdk`
- Domain registered in AWS with a Route53 hosted zone

## First-Time Setup

```bash
cd infra
npm install
npx cdk bootstrap  # one-time per account/region
```

## Deploying

Deploys normally go through CI: push to `main`, then click the manual `deploy` job in
GitLab. From a laptop, use `make deploy-local ALERT_EMAIL=you@example.com` from the
project root — it builds first and mirrors all three CI deploy steps (`cdk deploy`, the
admin SPA `s3 sync`, and the CloudFront invalidation), and refuses to run without
`ALERT_EMAIL`.

The stacks themselves are pure infrastructure and need no content to deploy. If you want
to run `cdk deploy` directly:

```bash
cd infra
npx cdk deploy --all   # admin deploys first; site consumes its outputs
```

Note this deploys the stacks but does **not** build or publish the site/admin bundles the
way the CI job and `make deploy-local` do. See [CI/CD › deploy](../docs/ci-cd.md#deploy)
for the full job, and [Setup](../docs/setup.md) for first-time account setup.

The first deploy takes 15-25 minutes (ACM validation + CloudFront creation). Subsequent deploys are 2-5 minutes.

## Post-deploy: GitLab token

The admin commits content edits to the **Content_Repo** — a private repository
holding only content, separate from this one. That requires a GitLab Personal
Access Token with **both the `api` and `write_repository` scopes**. `api` alone
authenticates but cannot push commits, so every save would log a commit failure
behind an otherwise-successful save. After the first deploy, store the token in the
secret the stack created:

```bash
aws secretsmanager put-secret-value \
  --secret-id carnaghan-admin/gitlab-token \
  --secret-string 'glpat-...' --region us-east-1
```

**The token must grant access to the Content_Repo, not to this repository.** A
project access token scoped to the source repository will fail every commit. While
commits are best-effort the symptom is a logged error behind a save that still
reports success, so check the admin Audit Log after changing either the token or
the configured project.

Without a token, admin saves still work and go live via S3 but are not committed
(the failure is logged and shown in the Audit Log).

Which repository, which host and which branch come from the `git` block in
`site.config.json`:

```json
"git": {
  "provider": "gitlab",
  "apiUrl": "https://gitlab.com/api/v4",
  "contentProjectId": "<numeric id of the Content_Repo>",
  "branch": "main"
}
```

These were previously hardcoded in `admin-stack.ts` while the `git` block sat
unread. `contentProjectId` is deliberately not called `projectId`: confusing the
Content_Repo with the source repository is the one mistake here that silently
writes content to the wrong place, so the validator rejects the old key rather
than ignoring it.

The stack turns that block into four environment variables on the content, media
and taxonomy functions: `GIT_PROVIDER`, `GITLAB_API_URL`, `GITLAB_PROJECT_ID`
(the Content_Repo) and `GITLAB_BRANCH`, plus `GITLAB_TOKEN_SECRET_ARN`. The
handlers depend on the `GitProvider` interface in `lambda/shared/git/provider.ts`
and get an instance from `createGitProvider()`, which reads `GIT_PROVIDER` and
defaults to `gitlab`. An unrecognised value throws rather than falling back —
silently committing to the wrong host, or nowhere, is worse than failing to start.
`GIT_PROVIDER=github` is accepted by the config schema but not yet implemented;
it exists for the framework extraction, not for this site.

A stack test asserts all three functions carry the configured project id, because
getting it wrong fails no deploy and no save — it just commits content to the
wrong repository.

## What Gets Deployed

**Public site (`CarnaghanSite`):**

- S3 bucket with the contents of `dist/` (and the admin SPA under `/admin/`)
- CloudFront distribution with OAC, security headers, apex→www redirect, and
  `/admin/*` + `/api/*` behaviors
- ACM certificate validated automatically via Route53
- Route53 A records for `carnaghan.com` and `www.carnaghan.com` aliased to CloudFront
- CloudFront access logging to the admin logs bucket

**Admin backend (`CarnaghanAdmin`):**

- Cognito user pool + app client
- API Gateway HTTP API + six Lambdas (content, media, taxonomy, analytics, deploy, audit)
- DynamoDB audit table, Secrets Manager token, logs bucket, and two EventBridge
  rules (daily analytics rollups + hourly scheduled publishing)

## Useful CDK Commands

| Command                         | Description                                       |
| ------------------------------- | ------------------------------------------------- |
| `npx cdk deploy --all`          | Deploy both stacks                                |
| `npx cdk deploy CarnaghanAdmin` | Deploy just the admin backend                     |
| `npx cdk diff --all`            | Show pending changes before deploying             |
| `npx cdk synth CarnaghanAdmin`  | Synthesize a stack's CloudFormation template      |
| `npx cdk destroy`               | Tear down (S3 buckets, user pool, table retained) |

## Notes

- Retained on destroy (`RemovalPolicy.RETAIN`): the S3 buckets, the Cognito user
  pool, the GitLab-token secret, and the DynamoDB audit table.
- `PRICE_CLASS_100` covers US, EU, Canada. Change to `PRICE_CLASS_ALL` for global edge coverage.
- AWS Shield Standard is included free for basic DDoS protection.
- No WAF on the admin API yet — it's Cognito-authenticated and single-user; WAF +
  rate limiting is tracked in [future improvements](../docs/future-improvements.md).
- `BucketDeployment` creates a Lambda behind the scenes (1GB memory) to upload files to S3.
- Admin API Lambdas bundle with esbuild via `NodejsFunction`. `@aws-sdk/*` is
  provided by the Node 22 runtime and left external (not bundled); `js-yaml` is
  bundled and is declared here in `infra/package.json`.

### Lambda dependencies

The handlers under `lambda/` are **not** separate npm packages. There is one
`package.json` for all of infra, and everything the handlers import is declared
in it:

- `js-yaml` as a dependency — esbuild bundles it into the function
- `@aws-sdk/client-{s3,cloudfront,lambda,dynamodb,secrets-manager}` and
  `@types/{aws-lambda,js-yaml}` as devDependencies — needed only for tests and
  typechecking, since the Node 22 runtime supplies the SDK at runtime and
  `NodejsFunction` leaves `@aws-sdk/*` external

Add new handler dependencies here, and **don't run `npm install` inside a
`lambda/<name>/` directory.** That creates a `lambda/<name>/node_modules/` which
sits closer in Node's resolution path than `infra/node_modules/` and silently
shadows the declared dependencies — everything passes locally while CI (which
only installs at the `infra/` level) fails to resolve them. Each handler
directory used to carry its own `package.json`, lockfile, `tsconfig.json`, and
`vitest.config.ts`; those were removed as vestigial, since a single infra-level
install, typecheck, and test run covers them all.

Everything under `bin`, `lib` and `lambda` is typechecked by `npx tsc --noEmit`
here, **including test files**. They were excluded on the grounds that they relied
on loose casts around the `APIGatewayProxyResultV2` union, which meant no infra
test file was typechecked by anything — Vitest doesn't typecheck, and the
repo-root `tsc -b` only references the site and node projects.

Removing the exclusion surfaced 77 errors, every one the same cause: the union is
`APIGatewayProxyStructuredResultV2 | string`, and the tests read `.statusCode`
without narrowing. The handlers only ever return the structured form, so they are
typed that way now and the tests needed no casts at all.

Tests also run for the CDK stacks under `lib/`, not just the handlers —
`vitest.config.mts` includes both. Stack tests assert against a synthesised
template, which is the only way to catch a missing IAM grant: the handler tests
mock the AWS SDK and so never see `AccessDenied`.

- The GitLab CI deploy role currently uses `AdministratorAccess`. A
  least-privilege replacement is ready at
  [`deploy-role-policy.json`](./deploy-role-policy.json) (assumes default CDK
  bootstrap) but is **not yet applied** — to apply it, follow
  [docs/runbook-scope-deploy-role.md](../docs/runbook-scope-deploy-role.md).
