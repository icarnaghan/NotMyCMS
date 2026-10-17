# Content_Repo CI (the Reconcile_Job)

> This file covers only the Reconcile_Job that runs **inside** the Content_Repo. It does
> **not** cover creating the Content_Repo, seeding it with content, or the source repo's
> read token (`CONTENT_REPO_URL`) that lets the source build clone this repo. For the
> end-to-end, from-scratch path across both repositories and all four credentials, start
> at [docs/setup.md](../docs/setup.md).

These files belong in the **Content_Repo** (`carnaghan/carnaghan-content`), not in this
repository. They are kept here, under version control alongside the code that produces
them, and copied across with:

    make reconcile-sync CONTENT_REPO=~/carnaghan-content-repo

That target copies this directory's `.gitlab-ci.yml` and `scripts/` into the clone, plus
a fresh copy of `site.config.json`, then prints the git status so you can review before
committing in the Content_Repo.

## What the pipeline does

On a push to the Content_Repo's `main`, the single `reconcile` job:

1. assumes an AWS role via GitLab OIDC (same pattern as the source repo's deploy job);
2. runs `scripts/reconcile.js`, which reads `content/` and writes the manifests, search
   index, RSS, sitemap and robots into a staging directory alongside a copy of the
   content;
3. `aws s3 sync`s the staging directory to the bucket (`--delete`, so a removed article
   is removed from the projection too — safe now that git is the source of truth);
4. invalidates CloudFront.

The regeneration rule in `scripts/build-artifacts.js` is the same module the source
repo's build uses, copied verbatim, so the projection a push produces matches what a full
build would produce — with one documented exception.

## The one gap: landing-page sitemap entries

The sitemap's per-article entries are correct. Its _landing-page_ entries (`/about`,
`/apps`, `/teaching`, …) come from the source repo's page registry, which is code and so
is not in the Content_Repo. A reconcile therefore omits them, exactly as the admin deploy
Lambda does. They are refreshed on the next full source-repo build. This is a known,
bounded staleness in a handful of rarely-changing URLs, not content loss, and it is the
same divergence the roadmap already tracks.

## One-time setup: the OIDC deploy role

The pipeline authenticates to AWS with GitLab OIDC — no stored keys. It needs one IAM
role, created once. The GitLab OIDC **provider** already exists in the account (the
source repo uses it), so you do _not_ create a provider, only a role that trusts the
Content_Repo's subject.

Account `<ACCOUNT_ID>`, region `us-east-1`, bucket `carnaghan.com`. The two policy
documents are in this directory:

- `reconcile-role-trust.json` — who may assume the role (the Content_Repo's OIDC subject,
  `project_path:carnaghan/carnaghan-content:*`). Already filled in bar `<ACCOUNT_ID>`.
- `reconcile-role-policy.json` — what it may do: write/delete under `content/`, write the
  four derived index files, list the bucket for those prefixes, and invalidate
  CloudFront. Nothing else — notably no access to the SPA, the admin, or `cdk`.

Create the role (from a shell with admin-level AWS access, _not_ from CI):

```bash
ACCOUNT=123456789012   # your 12-digit AWS account id

# 1. Fill the account id into the trust policy.
sed "s/<ACCOUNT_ID>/${ACCOUNT}/" reconcile-role-trust.json > /tmp/trust.json

# 2. Create the role and attach the least-privilege policy inline.
aws iam create-role \
  --role-name carnaghan-content-reconcile \
  --assume-role-policy-document file:///tmp/trust.json \
  --description "GitLab OIDC role for the Content_Repo Reconcile_Job"

aws iam put-role-policy \
  --role-name carnaghan-content-reconcile \
  --policy-name reconcile \
  --policy-document file://reconcile-role-policy.json

# 3. Print the role ARN for the CI variable below.
aws iam get-role --role-name carnaghan-content-reconcile --query 'Role.Arn' --output text
```

## Required CI/CD variable (in the Content_Repo)

In the Content_Repo: **Settings → CI/CD → Variables**, add:

- `AWS_DEPLOY_ROLE_ARN` = the ARN printed by step 3
  (`arn:aws:iam::<ACCOUNT_ID>:role/carnaghan-content-reconcile`). Mark it **Protected**
  (the pipeline only runs on `main`, which is protected) and **not** masked (an ARN is
  not a secret and masking a non-random string can misbehave).

The bucket name and CloudFront alias are read from the committed `site.config.json`.

## First run

The first pipeline will re-upload every content object, because `aws s3 sync` compares
modified times and the staging files are freshly written each run. That is harmless — the
bytes are identical — and it settles to a near-no-op on later pushes. Watch that the
delete count is **zero**: the projection is at parity with the bucket today, so a first
run that wants to delete anything under `content/` is a signal to stop and look.

## Rebuilding the whole projection from scratch

The projection is derived, so it can be thrown away and rebuilt from the Content_Repo at
any time. This is the procedure requirement 4.3 asks to be proven once, and the thing
that makes pruning safe rather than merely disabled.

To rebuild everything (not just a push's changes):

1. From a Content_Repo clone, run the reconcile locally and inspect the staging dir:

   ```
   npm ci
   npm run reconcile          # writes dist-projection/
   ```

   Or, from the source repo, `make reconcile-local CONTENT_REPO=<clone>`.

2. Push an empty commit to `main` (`git commit --allow-empty -m "rebuild projection"`),
   which runs the pipeline against the full tree. The sync is idempotent: unchanged
   objects are skipped, changed ones replaced, and anything under `content/` that is no
   longer in the repo is deleted.

The rebuild touches only `content/` plus the four derived index files. The SPA shell,
assets and prerendered heads are the source repo's build output and are left untouched —
rebuilding the projection does not require, and must not trigger, a source-repo deploy.
