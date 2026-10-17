# Setup: standing the whole thing up from scratch

This is the end-to-end runbook. It assumes nothing beyond an AWS account, a GitLab
account, and a registered domain, and it ends with a deployed site, a working admin, and
both content-authoring loops live.

The system is **two repositories**:

| Repository                     | Holds                             | CI does                                |
| ------------------------------ | --------------------------------- | -------------------------------------- |
| **source** (`carnaghan.com`)   | code; no content                  | lint, test, build, deploy infra + site |
| **Content_Repo** (`…-content`) | content only, the source of truth | the Reconcile_Job — sync content to S3 |

Content reaches the live site two ways, both landing in the same S3 bucket: the admin
writes it (committing to the Content_Repo first), and a push to the Content_Repo runs the
Reconcile_Job. The source build never carries content — it clones the Content_Repo at
build time only to generate manifests, the sitemap, and the prerendered `<head>` pages.

If you are joining an already-running deployment and just want the site on your laptop,
skip to [Local development](#local-development) — most of this runbook is one-time
infrastructure setup you do not need to repeat.

---

## Credentials at a glance

Four distinct credentials, easy to confuse. Getting any one wrong fails silently or at an
unobvious step, so they are called out up front:

| Credential              | Lives where                                               | Scope / role                                           | Used by                            |
| ----------------------- | --------------------------------------------------------- | ------------------------------------------------------ | ---------------------------------- |
| Source deploy OIDC role | AWS IAM; ARN in source CI `AWS_DEPLOY_ROLE_ARN`           | currently `AdministratorAccess` (see runbook)          | source `deploy` job (`cdk deploy`) |
| Reconcile OIDC role     | AWS IAM; ARN in **Content_Repo** CI `AWS_DEPLOY_ROLE_ARN` | write `content/*` + 4 index files, invalidate CF       | Content_Repo Reconcile_Job         |
| Admin git PAT           | Secrets Manager `…-admin/gitlab-token`                    | **`api` + `write_repository`** on the Content_Repo     | admin Lambdas (commit content)     |
| Source build read token | source CI `CONTENT_REPO_URL` (embedded in a clone URL)    | **`read_repository`** deploy token on the Content_Repo | source `build` job (clone content) |

The two OIDC roles both trust GitLab's OIDC provider, which is created once per AWS
account — the second role reuses it. The two GitLab tokens are different kinds (a Personal
Access Token for the admin, a repo Deploy Token for the build) with different scopes;
neither can do the other's job.

---

## Part A — source infrastructure (one-time)

Prerequisites: Node.js LTS, the AWS CLI configured, `npm i -g aws-cdk`, and a domain in a
Route53 hosted zone.

1. **Install and bootstrap.**

   ```bash
   make install                       # deps in all three workspaces
   cd infra && npx cdk bootstrap      # one-time per account/region
   ```

2. **Set `site.config.json`.** Copy the template and fill in your values:

   ```bash
   cp site.config.example.json site.config.json
   ```

   Everything that identifies this deployment — domain, titles, hosted zone id, and the
   `git` block — lives here. The `git` block points the admin at the Content_Repo:

   ```json
   "git": {
     "provider": "gitlab",
     "apiUrl": "https://gitlab.com/api/v4",
     "contentProjectId": "<numeric id of the Content_Repo>",
     "branch": "main"
   }
   ```

   `contentProjectId` is the **Content_Repo's** numeric project id, not the source repo's.
   You will not have it until Part B creates that repo — come back and fill it in, then
   redeploy the admin. See [infra/README.md](../infra/README.md) for the full field list.

   **Optional: `docsBaseUrl`.** The admin's Help page and its inline "how do I change
   this?" hints link to this project's rendered documentation. Set `docsBaseUrl` to the
   base of your repository's docs, with **no trailing slash** — the admin appends
   `/<path>` (e.g. `/docs/setup.md`):

   ```json
   "docsBaseUrl": "https://gitlab.com/<group>/<repo>/-/blob/main"
   ```

   Omit it and the Help page still lists the guides but without outbound links. It must be
   an `https` URL. (This is the one setting a fork should point at its _own_ repository.)

3. **Deploy the stacks.** Content is not needed for this — the stacks are infrastructure,
   not content.

   ```bash
   cd infra && npx cdk deploy --all   # admin first, then site; 15–25 min on a cold account
   ```

4. **Source-repo CI (GitLab OIDC → AWS).** Create the OIDC provider and deploy role, and
   set the CI variables, per [CI/CD › Setup](ci-cd.md#setup):

   - OIDC provider for `gitlab.com` (once per account).
   - A deploy role trusting `project_path:<group>/carnaghan.com:*`.
   - CI/CD variable `AWS_DEPLOY_ROLE_ARN` = that role's ARN.
   - CI/CD variable `ALERT_EMAIL` = where failure alarms go. **Required** — a deploy
     without it deletes the SNS subscription and silently disarms every alarm.

   The role starts as `AdministratorAccess`; scoping it down is the deferred task in
   [runbook-scope-deploy-role.md](runbook-scope-deploy-role.md).

---

## Part B — the Content_Repo (one-time)

5. **Create the repository.** A new **private** GitLab project, e.g.
   `carnaghan/carnaghan-content`. Empty — no README, no initial commit. Note its numeric
   project id (Settings → General) and put it in `site.config.json`'s `git.contentProjectId`
   (step 2), then redeploy the admin so the Lambdas pick it up.

6. **Seed it with the current content.** From the source repo:

   ```bash
   make seed-content-repo             # builds + verifies ~/<prefix>-content-repo
   ```

   This builds the first commit from the content tree (dropping the `public/` prefix),
   verifies it by hash against the content and the pre-migration snapshot, and prints the
   remote-add/push commands. Then, in the clone:

   ```bash
   git remote add origin git@gitlab.com:carnaghan/carnaghan-content.git
   git push -u origin main
   ```

   (On a fresh framework install with no existing content, skip the seed and just commit a
   `content/posts/` and `content/knowledge-base/` tree yourself.)

7. **Install the Reconcile_Job CI into the clone.** From the source repo:

   ```bash
   make reconcile-sync                # copies .gitlab-ci.yml, scripts, policies, config
   ```

   Review and commit the copied files in the clone, then push. The full procedure,
   including the OIDC role creation commands and the first-run checklist, is in
   [content-repo-ci/README.md](../content-repo-ci/README.md) (it lands in the clone as
   `CI.md`). In short:

   - Create the **Reconcile OIDC role** with the committed `reconcile-role-*.json` policies.
   - Set the Content_Repo CI/CD variable `AWS_DEPLOY_ROLE_ARN` to that role's ARN.
   - Push to `main`; watch the first reconcile upload everything with **zero deletes**.

8. **Give the admin a git token.** Mint a GitLab **Personal Access Token** with
   **`api` + `write_repository`** scope that can reach the Content_Repo, and store it in
   the secret the admin stack created:

   ```bash
   aws secretsmanager put-secret-value \
     --secret-id carnaghan-admin/gitlab-token \
     --secret-string 'glpat-...' --region us-east-1
   ```

   `api` alone is not enough — commits need `write_repository`. See
   [infra/README.md › Post-deploy: GitLab token](../infra/README.md).

9. **Give the source build a read token.** Mint a repo **Deploy Token** on the
   Content_Repo (Settings → Repository → Deploy tokens) with **`read_repository`** scope,
   and set it on the **source** repo as the CI/CD variable `CONTENT_REPO_URL`, embedded in
   the clone URL:

   ```
   https://<deploy-token-username>:<deploy-token>@gitlab.com/carnaghan/carnaghan-content.git
   ```

   Use the username GitLab displays for the token (often `gitlab+deploy-token-NNNN`), not
   the label you typed. Mark it **protected**, not masked (GitLab often refuses to mask a
   value with `/` or `@`). Without this, the source `build` job dies at the `git clone`
   step. Verify the exact string before saving:

   ```bash
   git clone --depth 1 https://<user>:<token>@gitlab.com/carnaghan/carnaghan-content.git /tmp/ct && rm -rf /tmp/ct && echo OK
   ```

---

## Local development

To run the full site on your machine you need the content, which lives in the
Content_Repo. Clone it next to the source repo:

```bash
git clone git@gitlab.com:carnaghan/carnaghan-content.git ~/carnaghan-content-repo
```

The default clone location is `~/<resourcePrefix>-content-repo`
(`~/carnaghan-content-repo`); override any content target with `CONTENT_REPO=<dir>`.

```bash
make install        # deps in all three workspaces
make dev            # symlinks the clone into public/content, then starts the dev server
```

`make dev` depends on `make link-content`, which symlinks the clone's `content/` into
`public/content` (gitignored) and generates the manifests, so the SPA's runtime content
fetches resolve locally. Without a clone, `make dev` stops with instructions rather than
serving an empty site.

`make build` reads content from the same clone via `CONTENT_ROOT`. The admin SPA
(`make dev-admin`) needs no content.

> **Why this is needed:** the dev server serves `public/`, and content is no longer in
> this repository — it was removed in the content-storage migration. The symlink is the
> local stand-in for what CI does by cloning the Content_Repo at build time.

---

## Authoring content (day to day)

Two loops, both writing the Content_Repo:

- **Admin** (`/admin`): edit in the browser; the save commits to the Content_Repo and
  writes S3. A failed commit fails the save.
- **Clone, edit, commit, push**: the Reconcile_Job publishes it. No bespoke tooling.

`make content-drift` compares the Content_Repo clone against S3 if a count ever looks off.
See [Developer Guide › Managing Content](developer-guide.md#managing-content).

---

## When something is set up wrong

| Symptom                                                       | Likely cause                                                              |
| ------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Source `build` job fails at `git clone`                       | `CONTENT_REPO_URL` missing, or its deploy token lapsed / wrong scope      |
| Reconcile_Job fails at assume-role                            | Content_Repo `AWS_DEPLOY_ROLE_ARN` missing, or trust policy subject wrong |
| Admin save succeeds but no commit appears in the Content_Repo | admin token missing `write_repository`, or pointed at the wrong repo      |
| Admin commits land in the **source** repo                     | `git.contentProjectId` is the source repo's id, not the Content_Repo's    |
| Alarms report `OK` but never alert                            | deployed without `ALERT_EMAIL`; the SNS subscription was removed          |
| `make dev` serves an empty site                               | no content clone — run `make link-content` / clone the Content_Repo       |
