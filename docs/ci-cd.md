# CI/CD Pipeline

GitLab CI/CD pipeline defined in `.gitlab-ci.yml`.

## Stages

```
lint → test → security → build → deploy
```

### lint

Runs in parallel. Fails fast on any issue.

| Job         | Command                  | Description                                     |
| ----------- | ------------------------ | ----------------------------------------------- |
| `eslint`    | `npm run lint`           | ESLint checks for code quality issues           |
| `prettier`  | `npx prettier --check .` | Enforces consistent code formatting             |
| `typecheck` | `npx tsc --noEmit`       | TypeScript type checking without emitting files |

### security

`npm-audit` is **blocking**; the rest use `allow_failure: true` and report
findings without stopping the build.

| Job                   | Tool                                                            | Description                                                                              |
| --------------------- | --------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `npm-audit`           | npm audit                                                       | **Blocking.** Fails on any `high`+ advisory. Audits the repo root only                   |
| `ash-scan`            | [AWS ASH](https://awslabs.github.io/automated-security-helper/) | Scans source and IaC code for security issues (secrets, misconfigs, vulnerable patterns) |
| `sast`                | GitLab SAST                                                     | Static analysis for common JS/TS vulnerability patterns                                  |
| `dependency_scanning` | GitLab Dependency Scanning                                      | Scans `package-lock.json` for vulnerable packages                                        |

ASH (Automated Security Helper) runs in local mode using Python. Results are saved as artifacts in `.ash/ash_output/` and retained for 1 week. The `--no-fail-on-findings` flag ensures results appear in the GitLab Security Dashboard even if other jobs fail.

### Why the blocking audit excludes dev dependencies

`npm-audit` runs `--omit=dev` and is blocking. `npm-audit-dev` audits everything
across all three packages and is advisory.

The split is deliberate. Production dependencies are what reach a browser or run
in a Lambda, so a high advisory there is real exposure worth stopping the line
for. Build tooling — `vitest`, `eslint`, `gray-matter` and the `js-yaml` beneath
it — cannot be reached by an attacker through the deployed site: it runs on a CI
runner against our own content, then exits.

Blocking on dev advisories sounds stricter but behaves worse in practice: new
advisories land in build tooling regularly, so the pipeline fails on findings that
usually have no exploitable path here, which trains you to bypass it. Scoping the
gate to what ships keeps the signal meaningful.

When the blocking job does fail, `npm audit fix` then commit the updated lockfile.
If the fix bumps a parser (`js-yaml` sits under `gray-matter`, which parses every
post's frontmatter), regenerate the manifests and confirm they are unchanged
before committing.

`infra/` is excluded from the blocking job because `aws-cdk-lib` carries a
transitive `brace-expansion` advisory that can't be resolved from here. Note that
`infra/`'s own `js-yaml` **is** bundled into the content, taxonomy and deploy
Lambdas, so it genuinely ships — keep an eye on the advisory job for it.

### test

Runs the Vitest suites for all three packages in one job — the public site
(`src/`), the admin SPA, and infra (`infra/lambda/` handlers plus `infra/lib/`
CDK stack tests). Each is invoked as `npm test` from its own directory. Blocking:
a failing test fails the pipeline.

### build

`main`-only jobs producing artifacts for the deploy stage, plus an advisory
accessibility audit:

| Job           | Command                                             | Artifact         |
| ------------- | --------------------------------------------------- | ---------------- |
| `build`       | clone Content_Repo → `generate-manifest.js` → build | `dist/`          |
| `build-admin` | `cd admin && npm ci && npm run build`               | `admin/dist/`    |
| `a11y`        | `npx @lhci/cli autorun` (needs `build`)             | `.lighthouseci/` |

`npm run build` runs `vite build` followed by `generate-meta-pages.js`, so the
`dist/` artifact includes the per-page prerendered meta/OG HTML.

**The build clones the Content_Repo first.** Content lives in its own private repository
(content-storage stage 7), not in this one, so the `build` job shallow-clones it into
`content-repo/` and sets `CONTENT_ROOT=content-repo/content` for `generate-manifest.js`.
The clone is build input only — the running site fetches content from S3 at runtime, and
the deploy excludes `content/*`. The clone URL, with a read-only deploy token embedded,
is the protected CI/CD variable **`CONTENT_REPO_URL`**
(`https://<token-name>:<token>@gitlab.com/carnaghan/carnaghan-content.git`). A build will
fail at the clone step if that variable is missing or its token has lapsed.

`generate-manifest.js` excludes `draft: true` and future-dated posts, so drafts
and not-yet-due scheduled content never ship in the build. Scheduled posts go
live via the admin's hourly EventBridge publisher once their date passes (see
[Architecture › Scheduled publishing](architecture.md#scheduled-publishing)).

The `a11y` job reuses the `build` artifact and runs Lighthouse's accessibility
audit against the homepage (config in `lighthouserc.json`). It installs headless
Chromium and is `allow_failure: true` — advisory, like the security scans. Full
accessibility validation still requires manual testing with assistive
technologies.

The config sets `chromeFlags: "--no-sandbox --disable-gpu --disable-dev-shm-usage"`.
The `--no-sandbox` flag is required because the CI container runs as **root**, and
Chrome refuses to start as root with the sandbox enabled — without it the job
fails at browser launch before producing a score. That's acceptable here since
Chrome only loads our own freshly-built static output in an ephemeral container.

### deploy

`main`-only and manually triggered. Assumes the AWS role via OIDC, then:

1. `npx cdk deploy --all` — deploys both stacks (`CarnaghanAdmin` then `CarnaghanSite`).
2. `aws s3 sync ../admin/dist/ s3://carnaghan.com/admin/ --delete` — publishes the admin SPA.
3. CloudFront invalidation for `/admin/*`.

The AWS CLI installer is pinned via `AWS_CLI_VERSION` to an immutable, versioned
URL rather than the mutable "latest" endpoint, so the download that runs with
deploy credentials is reproducible and tamper-evident. Bump it deliberately, and
confirm the pinned URL resolves first — a non-existent version breaks the deploy.

The deploy job passes `--context alertEmail="${ALERT_EMAIL}"`, sourced from the
`ALERT_EMAIL` CI variable (Settings → CI/CD → Variables). It subscribes an address to
the failure-alert SNS topic; AWS then sends a confirmation link that must be clicked
before delivery starts. Until it is clicked,
`aws sns list-subscriptions-by-topic` reports `SubscriptionArn: PendingConfirmation`
and nothing is delivered — `make alerts` surfaces this. The confirmation mail is
readily filtered as spam, and its token expires after three days.

Because the subscription is conditional on that context value, **a deploy that omits
it deletes the subscription** rather than leaving it alone: the synthesised template
has no subscription resource, and CloudFormation removes the existing one. Every
alarm then publishes to a topic with no subscribers while continuing to report `OK`.
CI always passes the variable, so pipeline deploys are safe. Deploys from a laptop
are the hazard, which is why `make deploy-local` refuses to run without
`ALERT_EMAIL`. Prefer it over a raw `cdk deploy`.

## Reproducing the pipeline locally

`make ci` runs the same gates as the pipeline — `check`, `test`, `audit`, `build`,
and `verify-build` — so pipeline failures can usually be caught before pushing. The
Makefile deliberately mirrors CI's command list; if you change a CI job's script,
update the corresponding target.

Two things `make ci` does **not** cover: the GitLab SAST and dependency-scanning
templates, and the Lighthouse accessibility audit (`make scan` covers the AWS
security-helper scan separately, and needs `ash` installed).

Note: the admin's git token is **not** managed by CI — it's stored once in
Secrets Manager (see [infra/README.md](../infra/README.md)). Content edits made
through the admin commit to the **separate private content repository**, not to
this project, so they cannot trigger this pipeline at all. They still carry
`[skip ci]`, which is now vestigial rather than load-bearing.

## Commit messages can silently skip the pipeline

GitLab suppresses the entire pipeline when a commit message contains `[skip ci]`
or `[ci skip]` — and it scans the **whole message, body included**, not just the
subject line.

This bites in a non-obvious way: a commit that merely _mentions_ the token in its
body, even to explain that it is deliberately not being used, still skips the
pipeline. The push appears to succeed, no jobs run, and nothing is built or
deployed. It's easy to misread as a rules problem or as content commits being
treated differently.

When referring to skip tokens in a commit message, avoid the literal bracketed
form — write "CI-skip token" or "skip-ci" instead.

**Intentional use.** The admin's own content commits _do_ include the token. That
was load-bearing when they landed in this project: the edits are already written
to S3 and served live, so a rebuild added nothing. They now land in the content
repository, so this pipeline was never reachable from them and the token is
belt-and-braces. A content file committed by hand here is different — it exists
only in git until a build regenerates the manifests, so it must **not** skip CI.

**Recovering from an accidental skip.** No commit is needed — use
**Build → Pipelines → Run pipeline** against `main`. That builds the current commit
and gives you the manual `deploy` job. Amending would mean force-pushing published
history for no benefit.

## Setup

### AWS OIDC Authentication

The deploy job uses GitLab OIDC (OpenID Connect) to authenticate with AWS — no long-lived credentials stored in CI variables. GitLab issues a short-lived JWT that AWS exchanges for temporary credentials via `sts:AssumeRoleWithWebIdentity`.

> There are **two** OIDC roles in this system: the source repo's deploy role (below) and
> the Content_Repo's Reconcile role. Both trust the same OIDC provider — created once per
> account — but each is a distinct IAM role with its own trust subject, and both expose a
> CI/CD variable named `AWS_DEPLOY_ROLE_ARN` in their respective repositories. This section
> covers the source repo's role; the Reconcile role is in
> [content-repo-ci/README.md](../content-repo-ci/README.md), and both are summarised in
> [Setup › Credentials](setup.md#credentials-at-a-glance).

To set this up:

1. In AWS IAM, create an OIDC Identity Provider:
   - Provider URL: `https://gitlab.com`
   - Audience: `https://gitlab.com`

2. Create an IAM Role with a trust policy:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Federated": "arn:aws:iam::<ACCOUNT_ID>:oidc-provider/gitlab.com"
      },
      "Action": "sts:AssumeRoleWithWebIdentity",
      "Condition": {
        "StringEquals": {
          "gitlab.com:aud": "https://gitlab.com"
        },
        "StringLike": {
          "gitlab.com:sub": "project_path:<YOUR_GITLAB_GROUP>/<YOUR_PROJECT>:*"
        }
      }
    }
  ]
}
```

3. Attach a permissions policy.

   **Current state:** the role uses `AdministratorAccess`.

   A least-privilege replacement is written and committed at
   [`infra/deploy-role-policy.json`](../infra/deploy-role-policy.json) but is
   **not yet applied**. Because `cdk deploy` does its real work by assuming the
   CDK bootstrap roles, the CI principal needs very little: `sts:AssumeRole` on
   the `cdk-hnb659fds-*` roles, read on the bootstrap version SSM parameter, and
   S3 + CloudFront permissions for the deploy job's two direct CLI steps (the
   `admin/` sync and its invalidation).

   To apply it, follow
   [Runbook: Scope the GitLab Deploy Role](./runbook-scope-deploy-role.md) — it
   covers the bootstrap-qualifier prerequisite check, the exact CLI commands,
   verification, rollback, and troubleshooting. Optional; the pipeline works
   as-is.

4. In GitLab, add a CI/CD variable:
   - `AWS_DEPLOY_ROLE_ARN`: the ARN of the role (e.g. `arn:aws:iam::123456789012:role/gitlab-deploy`)

No `AWS_ACCESS_KEY_ID` or `AWS_SECRET_ACCESS_KEY` needed — credentials are temporary and scoped to each pipeline run.

### Prettier

Prettier is configured in `.prettierrc`. To auto-fix formatting locally before pushing:

```bash
npx prettier --write .
```

The `.prettierignore` file excludes `node_modules`, `dist`, `infra/dist`, and
`infra/cdk.out`. (It also lists `public/content`, now vestigial: content was moved to the
Content_Repo and `public/content` only exists locally as a gitignored symlink; the entry
is harmless and left as belt-and-braces.) ESLint's config ignores `**/dist/**` and
`**/cdk.out/**` for the same reason (generated CDK synth output shouldn't be linted).

### ASH

ASH scans the entire repository including the `infra/` CDK code. To run locally:

```bash
pip install git+https://github.com/awslabs/automated-security-helper.git@v3.2.4
ash --mode local
```

Results are written to `.ash/ash_output/`. Add this to your `.gitignore` if running locally.

## Branch Strategy

- All branches: lint + security jobs run on every push
- `main` only: build and deploy jobs run
- Deploy is manual — trigger from the GitLab pipeline UI after reviewing the build

## Local Pre-Commit Hooks

Husky + lint-staged run ESLint and Prettier on staged files before each commit. This catches issues before they reach the CI pipeline. See the [Developer Guide](developer-guide.md) for details.
