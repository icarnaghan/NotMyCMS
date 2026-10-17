# NotMyCMS

A deliberately lightweight way to run a blog or knowledge base — the publishing niceties
of a CMS without the weight, the database, or the always-on server that usually comes with
one.

NotMyCMS is a React + TypeScript single-page app with an AWS serverless backend. Content
lives as plain Markdown in a git repository and is served as static files from S3 behind
CloudFront. There is an admin dashboard for writing and managing content, but nothing about
the running site depends on it being up: the site is static files, and the admin is just one
of the ways content gets into git.

> **This repository is the framework _and_ its reference deployment.**
> [carnaghan.com](https://www.carnaghan.com) runs on NotMyCMS and is built from this repo,
> so the deployment-specific values you'll see throughout — the domain, author, AWS
> resource names, the GitLab content repository — all live in one file,
> [`site.config.json`](site.config.json). A fork replaces that file; everything else is the
> framework. Where docs show a `carnaghan`-prefixed name, it is the reference deployment
> standing in for "your value here."

## Why it's different

- **Your content is just git.** Posts and articles are Markdown files in a dedicated
  content repository. That means full version history, diffs, blame, and one-command
  rollback come free — not as a bolted-on CMS feature, but because the content _is_ a git
  repo. You can edit in the admin UI or in your editor; both commit to the same place.
- **Nothing to keep running.** The public site is static files on S3/CloudFront. No
  database to back up, no app server to patch, no CMS to keep upgraded. The admin and its
  Lambdas are serverless and cost effectively nothing at rest.
- **The admin is optional, not load-bearing.** It writes content to git (the source of
  truth) and projects it to S3. If the admin is down, the site is unaffected and you can
  still publish by committing Markdown directly.
- **Config, not code, per deployment.** Site identity, author, social links, analytics,
  and more are a single `site.config.json`. Standing up your own instance is editing that
  file, not forking logic.
- **It stays light on purpose.** Features are added when they earn their place; where a
  documentation link solves a problem, that's preferred over another subsystem. (See the
  in-admin Help page and the `docsBaseUrl` config field.)

## Tech Stack

- React 19 + TypeScript
- Vite
- Cloudscape Design System
- React Router v7
- React Markdown + Cloudscape CodeView (dynamic syntax highlighting)
- Fuse.js full-text fuzzy search
- gray-matter for YAML frontmatter parsing (build-time)
- AWS CDK — public site (S3 + CloudFront + ACM + Route53) and admin backend
- Admin CMS: Cognito auth, API Gateway (HTTP API) + Lambda, DynamoDB (audit log)
- DNS via Route53

## Features

- Blog posts and knowledge-base articles as Markdown (the reference deployment runs 600+
  posts and 500+ articles)
- Composable landing pages, edited as data (the reference deployment has `/apps`,
  `/teaching`, and more)
- Full-text fuzzy search
- Clickable tag badges that filter the posts listing
- Pagination state preserved in URL (back button restores position)
- Dark mode and compact density settings
- RSS feed, XML sitemap, and robots.txt
- Prerendered per-page meta/Open Graph tags and per-page canonical URLs (build-time)
- Lazy-loaded content images
- Canonical URLs and RSS autodiscovery
- Settings menu: theme (Light/Dark/System, follows your OS by default), content
  density, and a "Don't track my visits" analytics opt-out
- Syntax-highlighted code blocks with copy-to-clipboard
- Auto-generated table of contents on content pages
- Related posts suggestions based on shared tags and categories
- Responsive layout (TOC panel hidden on mobile by default)
- Google Analytics (GA4) with SPA page view tracking
- Dynamic document titles per page
- CloudFront security headers (HSTS, X-Frame-Options, X-Content-Type-Options)
- Lazy-loaded routes with vendor chunk splitting
- Fuzzy 404 suggestions ("Did you mean?")

## Admin CMS

A Cognito-authenticated admin dashboard (served at `/admin`, code in `admin/`)
for managing the site without editing files by hand:

- Create/edit/delete posts and knowledge-base articles (markdown editor with live preview)
- Concurrent-edit protection, autosave/draft recovery, and SEO quality checks
- Drafts and scheduled publishing — future-dated posts go live automatically (hourly)
- Image upload and a per-post media library
- Taxonomy management (rename / merge / delete categories and tags)
- Revision history and one-click rollback per post
- Traffic analytics (from CloudFront access logs)
- One-click "Deploy Site" (regenerates manifests / search index / RSS / sitemap / prerendered heads), with deploy history
- Audit log of all admin activity

Content edits are written to S3 (live immediately) and **committed to a separate
private content repository** (the Content_Repo), which is the source of truth for
content. Access is protected by Cognito with required TOTP (authenticator-app) MFA.
See [Architecture](docs/architecture.md#admin-dashboard) for the full design.

## Getting Started

Content lives in a **separate private repository** (the Content_Repo), not in this
one, so the dev server needs a clone of it to have anything to serve. Clone it next to
this repo, then:

```bash
make install   # deps in all three workspaces
make dev       # symlinks the content clone into public/content, then starts Vite
```

`make dev` expects the clone at `~/<resourcePrefix>-content-repo` (override with
`CONTENT_REPO=<dir>`); without it, it stops with instructions rather than serving an
empty site. The full first-time path — cloning the Content_Repo, credentials, CI
variables — is in **[Setup](docs/setup.md)**. Run `make` to see every target.

Site identity and presentation (domain, titles, author, social links, analytics,
`docsBaseUrl` for the admin's Help links) all live in **`site.config.json`**; the full
field list and which are required are covered in [Setup](docs/setup.md).

## Build & Deploy

> **Note on CI/CD and hosting.** The pipeline (`.gitlab-ci.yml`, OIDC-based AWS auth, the
> manual deploy job) is written for **GitLab CI/CD** — that is where the reference
> deployment lives and where it is designed to run. This published copy is on GitHub as a
> source snapshot; the pipeline files will not run as-is on GitHub Actions. Porting the CI
> to another provider means re-expressing the lint/test/build/deploy stages in that
> provider's format (the AWS OIDC role and the `make` targets they call are
> provider-agnostic). The local `make` workflow below has no such dependency.

```bash
make build         # regenerate manifests, then build (order matters)
make verify-build  # assert the sitemap and prerendered heads are complete
make ci            # everything CI checks before deploy
```

**Deploys normally go through CI:** push to `main`, then click the manual `deploy`
job in GitLab. Run `make diff` first — it is read-only and shows exactly what would
change.

If you must deploy from your machine, use `make deploy-local ALERT_EMAIL=you@example.com`
rather than a bare `cdk deploy`. The SNS alert subscription is only created when the
`alertEmail` context value is present, so deploying without it makes CloudFormation
delete the existing subscription — silently disarming every alarm while they all keep
reporting `OK`. `make deploy-local` refuses to run without the address.

First-time setup of a new account also needs `cd infra && npx cdk bootstrap`.

## Documentation

- [Setup](docs/setup.md) — stand the whole thing up from scratch: both repos, all four credentials, CI variables, local dev
- [Architecture](docs/architecture.md) — system design, component architecture, data flow, routing
- [Developer Guide](docs/developer-guide.md) — day-to-day development, adding content, project conventions
- [Infrastructure](infra/README.md) — CDK deployment to S3 + CloudFront + Route53
- [CI/CD](docs/ci-cd.md) — GitLab pipeline, security scanning, deployment
- [Content_Repo CI](content-repo-ci/README.md) — the Reconcile_Job that syncs the Content_Repo to S3
- [Runbook: Scope the Deploy Role](docs/runbook-scope-deploy-role.md) — pending manual task: replace `AdministratorAccess` on the CI deploy role
- [Future Improvements](docs/future-improvements.md) — outstanding work only; anything built is documented in the guides above
