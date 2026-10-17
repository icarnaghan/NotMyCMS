# Developer Guide

## Prerequisites

- Node.js LTS
- npm
- AWS CLI configured (for deployment)
- AWS CDK CLI: `npm install -g aws-cdk`

## Local Development

Content lives in a **separate private repository** (the Content_Repo), not in this one,
so the dev server needs a clone of it. See [Setup › Local development](setup.md#local-development)
for the one-time clone, then:

```bash
make install   # deps in all three workspaces
make dev       # symlinks the content clone into public/content, then starts Vite
```

`make dev` depends on `make link-content`, which symlinks the clone's `content/` into
`public/content` (gitignored) and regenerates the manifests, so the SPA's runtime content
fetches resolve locally. The default clone location is `~/<resourcePrefix>-content-repo`;
override with `CONTENT_REPO=<dir>`. Without a clone, `make dev` stops with instructions
rather than serving an empty site. Re-run `make link-content` (or `make dev`) after adding
or editing content in the clone to refresh the manifests.

## Make Targets

A `Makefile` at the repo root wraps the routine chores and mirrors what CI runs.
`make` with no arguments prints the full list.

```bash
make install       # deps in all three workspaces
make dev           # site dev server
make check         # lint + format + typecheck the site (matches CI)
make check-all     # also typecheck admin and infra
make test          # all three test suites (matches CI)
make build         # regenerate manifests, then build — in that order
make verify-build  # assert sitemap and prerendered heads are complete
make ci            # everything CI checks before deploy
make diff          # what a deploy would change (read-only)
make content-drift # compare content in git against content in S3
make cost          # month-to-date spend by service, registrar excluded
make budget        # budget limits vs actual and forecast
make alerts        # alarm states + whether the alert topic has a confirmed subscriber
```

Two targets exist to prevent specific mistakes rather than to save typing:

- **`make build` runs `generate-manifest.js` before `vite build`.** The manifest
  script writes `public/sitemap.xml`, which vite then copies into `dist/`. Run them
  the other way round — or run `npm run build` alone, which does **not** regenerate
  manifests — and you ship a stale sitemap missing any newly added page.
- **`make deploy-local` refuses to run without `ALERT_EMAIL`** (checked before any
  build work, so it fails immediately rather than after several minutes). A deploy
  without it deletes the SNS alert subscription and silently disarms every alarm.
  Normal deploys go through CI, which passes it automatically.

`make deploy-local` also mirrors all three steps of the CI deploy job rather than
just `cdk deploy`, and builds first. Both matter: the site bucket deployment uploads
whatever `dist/` currently contains, so deploying without building publishes a stale
or half-written site; and the admin SPA ships via an `s3 sync`, not via CDK, so a
cdk-only deploy leaves the admin frontend untouched and new admin behaviour silently
fails to appear.

Prefer `make deploy-local` over a raw `cdk deploy`. Better still, push to `main` and
click the manual deploy job.

`make scan` needs `ash` installed (`pip install git+https://github.com/awslabs/automated-security-helper.git@v3.2.4`).
The `cost`, `budget`, `alerts`, `content-drift` and `check-admin-env` targets need AWS
credentials, and `make cost` uses BSD `date -v`, so it is macOS-only as written.

### Content repository migration targets

Two targets exist for the move of content into its own repository. Both are local
and read-only with respect to this repository; neither talks to a remote.

```bash
make seed-content-repo     # build and verify the content repo's first commit
make verify-content-seed   # re-run the checks against an existing directory
```

`scripts/seed-content-repo.js` builds the tree from `git ls-files`, not from
walking the directory — the working tree holds `.DS_Store` files and generated
`manifest.json` files that git does not track, and a filesystem walk would carry
them into the repository that is about to become authoritative. It drops the
`public/` prefix, then verifies three ways: the seed holds exactly the tracked set
byte for byte, nothing untracked crept in, and every markdown file in the
pre-migration snapshot is present and identical apart from a known set of
deliberate deletions.

`OUT=<dir>` overrides the destination, and `--verify-only` (via
`make verify-content-seed`) re-runs every check without writing, which is how to
check a fresh clone.

## Available Scripts

| Script                                | Description                                                                       |
| ------------------------------------- | --------------------------------------------------------------------------------- |
| `npm run dev`                         | Start Vite dev server                                                             |
| `npm run build`                       | Type check + production build to `dist/`                                          |
| `npm run check`                       | Run TypeScript, ESLint, and Prettier across the whole codebase                    |
| `npm run fix`                         | Auto-fix ESLint and Prettier issues across the whole codebase                     |
| `npm run preview`                     | Preview production build locally                                                  |
| `npm run lint`                        | Run ESLint                                                                        |
| `npm test`                            | Run the public site's Vitest suite (`src/`)                                       |
| `npx prettier --write .`              | Auto-fix code formatting                                                          |
| `npx lint-staged`                     | Run linters on staged files only                                                  |
| `node scripts/generate-manifest.js`   | Regenerate manifests, search index, RSS, sitemap                                  |
| `node scripts/generate-meta-pages.js` | Post-build: write per-page prerendered meta/OG HTML (runs inside `npm run build`) |
| `node scripts/rename-dirs.js`         | Rename content dirs to match title slugs                                          |

## Pre-Commit Hooks

The project uses Husky + lint-staged to run checks before each commit:

- TypeScript/React files (`.ts`, `.tsx`): ESLint auto-fix + Prettier auto-format
- Other files (`.js`, `.json`, `.md`, `.yaml`, `.yml`): Prettier auto-format

Fixable issues are corrected automatically and staged. If ESLint errors remain that can't be auto-fixed, the commit is blocked.

To bypass in emergencies: `git commit --no-verify`.

To run the same checks manually:

```bash
npm run check     # report issues without fixing (full codebase)
npm run fix       # auto-fix ESLint + Prettier (full codebase)
npx lint-staged   # auto-fix staged files only
```

## Managing Content

Content lives in a **separate private repository** (the Content_Repo), not in this one.
This repository holds the code; `public/content` was removed in content-storage stage 7.
There are two ways to author:

1. **The admin dashboard** at `/admin` — a Cognito-authenticated CMS (code in `admin/`,
   backend in `infra/`). A save writes the markdown to S3 (live after cache invalidation)
   and **commits it to the Content_Repo first** — a failed commit fails the save (see
   [Architecture › Content model](architecture.md)). The **Deploy Site** button
   regenerates the manifests / search index / RSS / sitemap and the prerendered `<head>`
   pages.
2. **Clone the Content_Repo, edit, commit, push.** Its CI (the Reconcile_Job) regenerates
   the projection and syncs it to S3 on every push — no bespoke tooling, no access to
   this repository needed. This is the intended loop for anyone who prefers an editor to
   the admin UI, and the one the content model is built around.

Both write the Content_Repo; they cannot diverge from each other the way the old
`public/content` path could. `make content-drift` compares the Content_Repo clone against
S3 if a count ever looks wrong.

### Adding a blog post or KB article

Through the admin, or in a Content_Repo clone: create `content/posts/{slug}/index.md`
(or `content/knowledge-base/{slug}/`) with YAML frontmatter:

```markdown
---
title: "Your Post Title"
date: "2026-03-26"
description: "Brief description for listings"
categories: ["Coding"]
tags: ["React", "TypeScript"]
author: "Your Name"
---

Content here...
```

- Slug: lowercase, alphanumeric and hyphens, apostrophes stripped — "What's New" →
  `whats-new`. The directory name must match the slugified title; the admin handles this,
  and in a clone `scripts/rename-dirs.js` (pointed at the clone's `content/`) fixes a
  mismatch.
- Tags and categories use slug-style values; display labels are generated at render time.
- Images go in the same directory, referenced relatively: `![alt](image.png)`.

### Building locally against the content

The build reads content from `CONTENT_ROOT` (default `public/content`, which no longer
exists here). `make build` points it at the Content_Repo clone — `CONTENT_REPO`, default
`~/<prefix>-content-repo` — so a clone must be present. The CI build job clones the
Content_Repo itself; see [CI/CD](ci-cd.md).

See [Architecture › Content model & source of truth](architecture.md) for the full
picture.

### Working on the admin app

- Build/lint/test from the `admin/` folder: `npm run build`, `npm run test`.
- Infra + Lambda code lives in `infra/`; tests run with the repo's Vitest.
- Running the admin fully locally is non-trivial (it needs Cognito auth and the
  live `/api` backend), so admin changes are normally verified via build/tests
  and validated after deploy. Avoid pointing a local dev server at the
  production API/auth.
- Git mirroring needs a GitLab token with **`api` + `write_repository`** scope in
  Secrets Manager (see [infra/README.md](../infra/README.md) and
  [Setup › Credentials](setup.md#credentials-at-a-glance)).

## Frontmatter Fields

| Field         | Type                | Required | Description                                                                                                            |
| ------------- | ------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------- |
| `title`       | string              | Yes      | Title — determines the URL slug                                                                                        |
| `date`        | string (YYYY-MM-DD) | Yes      | Publication date. A future date keeps the post off the live site until it passes (see Drafts and scheduled publishing) |
| `description` | string              | No       | Shown in listings and content header                                                                                   |
| `categories`  | string or string[]  | No       | Display labels (e.g. "Coding")                                                                                         |
| `tags`        | string[]            | No       | Display labels (e.g. "React", "AWS")                                                                                   |
| `author`      | string              | No       | Displayed as "By {author}"                                                                                             |
| `draft`       | boolean             | No       | When `true`, the post is unlisted — see Drafts below. **Not** private                                                  |
| `modified`    | string (ISO)        | No       | Server-managed. Last edit time, stamped by the admin on save — don't set it by hand                                    |

### `modified` vs `date`

`date` is the publication date and never moves. `modified` is when the item was last
edited, and exists because S3's own `LastModified` is useless for this: a site deploy
rewrites every content object, so all 1,100+ items report the deploy time. Keeping the
stamp in frontmatter means it survives deploys, and the admin's git mirror commits it,
so the value is effectively the git modification timestamp with no GitLab lookup
needed to read it.

The admin dashboard's "Recently Modified" panel uses `modified`, falling back to `date`
for items never edited through the admin.

Three things deliberately do **not** stamp it:

- **Taxonomy rename/merge** rewrites hundreds of files mechanically; bumping them all
  would bury real edits under a wall of identical timestamps.
- **Revision restore** writes the historical bytes back verbatim so the git diff is an
  exact revert, which means a restored item keeps the `modified` from that revision.
  The audit log is the record of who restored what and when.
- **Direct git edits** — update the field by hand or accept the `date` fallback.

Note `lastModified` in the admin API is a different thing again: it is S3's timestamp,
used as the optimistic-concurrency token on save. Don't display it, and don't repoint
it at `modified` — concurrent-edit detection depends on it.

### Slugs

The URL slug is derived from `title`, lowercased, with apostrophes removed and
every other run of non-alphanumerics collapsed to a single hyphen — so
"Don't Do This" becomes `dont-do-this`. **The directory name must equal that
slug**, because the manifest advertises the title-derived slug while the site
fetches content by directory name; a mismatch means a 404.

`node scripts/generate-manifest.js` warns when a directory doesn't match its
title slug. If you rename a post's title after publishing, either keep the
directory as-is (accepting the mismatch warning) or rename the directory _and_
add a redirect in `infra/redirects.json` so the old URL keeps working.

## Tests

Each package has its own Vitest suite; run `npm test` from that directory:

```bash
npm test              # public site (src/)
cd admin && npm test  # admin SPA
cd infra && npm test  # Lambda handlers (lambda/) and CDK stacks (lib/)
```

All three run in the CI `test` stage, and `make test` runs all three locally. The
root and `infra/` Vitest configs set an explicit `test.include` — without it, a
run from `infra/` inherits the root config's `src/`-only scope and finds no tests.
The infra config is `vitest.config.mts`.

`make check-all` typechecks all three packages. Note that infra typechecks its
**test** files too: they were excluded, which meant nothing typechecked them at
all, since Vitest doesn't and the root `tsc -b` only references the site and node
projects.

## User Preferences

Theme (Light/Dark/System), density, and the analytics opt-out live in
`src/lib/settings-preferences.ts` (pure, unit-tested helpers) and are applied by
`src/lib/settings-context.tsx`. The admin mirrors these at `admin/src/lib/`.

Two things to know when changing them:

- **Keep the two modules in sync.** Both apps are served from the same origin, so
  they share `localStorage` keys (`carnaghan-theme`, `carnaghan-density`,
  `carnaghan-analytics-opt-out`) and preferences carry across the site and admin.
- **Never let storage access throw.** Reads and writes go through
  `readStoredValue` / `writeStoredValue`, which swallow exceptions. These run
  during initial render, and `localStorage` can throw (Safari private browsing,
  blocked storage, embedded webviews) — an unguarded throw blanks the page.

The analytics opt-out key is also hardcoded in the inline bootstrap script in
`index.html`, which sets GA4's disable flag before gtag loads so the initial page
view isn't counted either. If you rename that key, update `index.html` too (a
unit test asserts the key name to catch drift).

## Drafts and Scheduled Publishing

The publish state of a post is controlled entirely by frontmatter, and both the
build-time generator (`scripts/generate-manifest.js`) and the admin deploy Lambda
apply the same rule (`isPublished`):

- **Draft:** set `draft: true` to keep a post out of the manifests, and therefore
  out of the listings, home page, search index, RSS, sitemap, category and tag
  pages, and the 404 page's suggestions. It also gets no prerendered `<head>`, so
  scrapers that don't run JavaScript see the generic site shell.

  **A draft is unlisted, not private.** The content route fetches
  `/content/{type}/{slug}/index.md` directly and never consults a manifest or
  checks the flag, so a draft — and its raw markdown — is readable by anyone with
  the URL from the moment it is saved. Nothing links to it and it won't be
  crawled, which is enough for work in progress, but don't treat it as access
  control. Real privacy would need drafts staged under a non-public prefix; the
  manifest cannot provide it, because nothing on the read path looks at one.

- **Scheduled:** set `date` to a future timestamp (and leave `draft` off). The
  post stays off the live site until that date passes. A missing or unparseable
  date is treated as published, so existing content is never hidden by accident.

When editing in git, republish by re-running `generate-manifest.js` (or the CI
build). When editing in the admin, the hourly scheduled-publish job automatically
regenerates the site once a scheduled post's date has passed — no manual deploy
needed. In the admin editor a future date shows a "Scheduled" note, and the
content list shows a "Scheduled" badge.

## Adding a New Page

Landing pages are **data**, not components. Add a JSON file to `site/pages/` and
register it in the `PAGES` array in `site/pages/index.js`. The registry is the one
list; routes, navigation, sitemap entries, and prerendered `<head>` are all derived
from it — by `src/App.tsx`, `scripts/generate-manifest.js`,
`scripts/generate-meta-pages.js`, and the deploy Lambda.

Then add the route to `STATIC_ROUTES` in the `Makefile` and run:

```bash
make build && make verify-build
```

`verify-build` asserts every listed route appears in the generated sitemap **and**
has a prerendered `<head>`.

The `Makefile` list is a deliberate **fourth** list, kept by hand on purpose.
Deriving it from the registry would make the assertion vacuous: a page dropped from
the registry would vanish from a derived list too, and two lists agreeing on an
omission is not agreement.

This used to be five places, with the sitemap and the meta-page lists maintained
independently. They drifted twice — `/apps` on creation, and `/categories` and
`/tags` for an extended period, both serving crawlers the generic root `<head>`.
Deriving them from the registry removed that class of bug; the deploy Lambda was
the last holdout and now derives from it as well.

For a page that needs real behaviour rather than composed blocks, a component in
`src/pages/` with a route in `App.tsx` is still the escape hatch — but it then
needs its own sitemap and meta-page entries, so prefer the registry.

### Curated landing pages

Landing pages are now JSON in `site/pages/`, composed from block types
(`prose`, `card-grid`, `columns`, `badge-list`, `panel`, `social-links`) and
rendered by `src/pages/landing/`. `/about`, `/apps`, `/bitesize-javascript`,
`/teaching` and `/teaching/cmst388-tips` have all been converted, and the
`src/data/` modules they used to read were removed with them.

Page data carries **semantic** values, not renderer values — `tone: "active"`
rather than `badgeColor: "green"`, `columns` rather than `cardsPerRow`. The
mapping from semantics to Cloudscape lives entirely in
`src/pages/landing/tone.ts`, which with `block-registry.ts` is the seam to change
if the component library ever does.

`node scripts/validate-page.js` (run by `make check`) validates every page file
and **fails** on an unknown block type or field. The runtime renderer instead
skips and warns — deliberately asymmetric, so a bad page can't ship but a
deployed page can't blank the site either.

## Code Conventions

- File naming: `kebab-case`
- Components: `PascalCase`, named exports (no default exports)
- Page files: `src/pages/{name}/{name}-page.tsx`
- No custom CSS — all UI via Cloudscape components
- No state management library — React Context + `useState` only
- Code formatting enforced by Prettier (`.prettierrc`)
- Frontmatter parsing uses `gray-matter` at build time and a lightweight parser client-side

## Error Handling

- `fetchManifest()` catches network errors, logs to console, returns empty array
- Posts and KB listing pages show a user-facing error message if the manifest fails to load
- `ContentPage` shows 404 with fuzzy "Did you mean?" suggestions if the markdown file can't be fetched
- `ContentErrorBoundary` catches rendering errors and shows a fallback message

## Build Output

Production build outputs to `dist/`. Static assets from `public/` are copied as-is, including content markdown files, generated manifests, `robots.txt`, and `favicon.ico`. The build also runs `generate-meta-pages.js`, which writes a prerendered `dist/<path>/index.html` per post/article/static page with page-specific meta and Open Graph tags (served via a CloudFront pretty-URL rewrite).

## Known Limitations

- **No full SSR/SSG** — the page body is rendered client-side (SPA). Only the `<head>` is prerendered per page (`generate-meta-pages.js`) for accurate crawler/social metadata; the sitemap and `robots.txt` help with crawlability.
- **Full search index loaded on demand** — fetched in full on first search open. Acceptable for current content volume.
- **Drafts are unlisted, not private** — a draft's URL serves its content to
  anyone who has it. See [Drafts and Scheduled Publishing](#drafts-and-scheduled-publishing).
- **Redirect map has a size ceiling** — `infra/redirects.json` is inlined into a
  CloudFront Function, which is capped at 10 KB of code. The current map leaves
  roughly 3.5 KB of headroom (about 25 more entries of typical length); beyond
  that it needs to move to a CloudFront KeyValueStore.
- **Analytics over-counts unique visitors across a range** — see
  [Architecture › Analytics rollups](architecture.md#analytics-rollups).
