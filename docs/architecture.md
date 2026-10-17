# Architecture

## Overview

NotMyCMS — a lightweight, git-backed CMS for blogs and knowledge bases. This document
describes it as deployed for its reference instance, [carnaghan.com](https://www.carnaghan.com)
(a personal blog and portfolio); deployment-specific values live in `site.config.json`.

The **public site** is a fully static single-page application — content is pre-indexed at
build time and served from S3 via CloudFront with no server at request time.

A separate **admin dashboard** (see [Admin Dashboard](#admin-dashboard)) adds a
serverless backend (API Gateway + Lambda + Cognito, with a DynamoDB audit log)
for managing content. Admin edits are written to S3 and committed to a separate
private content repository, which is the source of truth for content; the public
site remains static.

**Stack (public site):**

- React 19 + TypeScript 5.9 + Vite 8
- Cloudscape Design System for all UI components
- React Router v7 for client-side routing
- React Markdown for content rendering
- `@cloudscape-design/code-view` for syntax-highlighted code blocks (dynamically loaded per language)
- gray-matter for YAML frontmatter parsing (build-time only)
- Fuse.js for client-side fuzzy search
- Build-time manifest, RSS, and sitemap generation via `scripts/generate-manifest.js`
  (excludes `draft: true` and future-dated posts, so drafts and scheduled posts
  stay off the live site; the admin deploy Lambda applies the same filter)
- Lazy-loaded routes with vendor chunk splitting via Vite

## Project Structure

Content is **not** in this repository — it lives in the private Content_Repo and is
cloned at build time (content-storage stage 7). The build reads it via `CONTENT_ROOT` and
writes the generated artifacts into `public/`:

```
/
├── public/
│   ├── content/
│   │   ├── posts/manifest.json       # Generated at build — the only thing left here
│   │   └── knowledge-base/manifest.json
│   ├── images/                  # Static assets (profile photo, etc.)
│   ├── robots.txt               # Generated — crawl directives
│   ├── search-index.json        # Generated — combined search index
│   ├── rss.xml                  # Generated — RSS 2.0 feed (20 most recent posts)
│   └── sitemap.xml              # Generated — XML sitemap
│   # The markdown + images are cloned to content-repo/ at build time, not committed here.
├── scripts/
│   ├── generate-manifest.js     # Indexes content, generates manifests/RSS/sitemap
│   ├── generate-meta-pages.js   # Post-build: per-page prerendered meta/OG HTML
│   └── rename-dirs.js           # Renames content dirs to match title slugs
├── src/
│   ├── App.tsx                  # Root: routing, navigation, settings
│   ├── main.tsx                 # Entry point
│   ├── components/
│   │   ├── page-layout.tsx      # AppLayout wrapper for static pages
│   │   ├── content-list.tsx     # Reusable data table (posts listing)
│   │   ├── content-renderer.tsx # Markdown renderer with TOC + code highlighting
│   │   ├── related-posts.tsx   # Related posts based on shared tags/categories
│   │   └── search.tsx           # Global fuzzy search modal
│   ├── lib/
│   │   ├── settings-preferences.ts # Theme/density/analytics prefs + safe storage
│   │   ├── settings-context.tsx    # Applies preferences via Cloudscape
│   │   ├── content.ts           # PostMeta type + fetchManifest() with error handling
│   │   ├── frontmatter.tsx      # Lightweight browser-side YAML frontmatter parser
│   │   ├── use-document-title.ts # Dynamic document title hook
│   │   ├── settings-context.tsx # Dark mode + density context (localStorage)
│   │   └── social-links.tsx     # Social media link data
│   ├── pages/
│   │   ├── landing/             # Generic renderer for every landing page
│   │   │   ├── landing-page.tsx # Walks a page's blocks
│   │   │   ├── block-registry.ts# Block type → component
│   │   │   ├── blocks/          # One component per block type
│   │   │   ├── prose.tsx        # Markdown for blocks (no raw HTML)
│   │   │   └── tone.ts          # Semantic values → Cloudscape values
│   │   ├── home/
│   │   ├── posts/
│   │   ├── knowledge-base/
│   │   ├── categories/
│   │   ├── tags/
│   │   └── not-found/
│   └── styles.css               # Global styles, incl. landing-page prose spacing
├── site/
│   └── pages/                   # Landing pages as data — the directory a
│       ├── index.js             # framework consumer owns
│       ├── about.json
│       ├── apps.json
│       ├── bitesize-javascript.json
│       ├── cmst388-tips.json
│       └── teaching.json
├── site.config.json             # Site identity: domain, titles, analytics, social
├── package.json
└── vite.config.ts

admin/                           # Admin CMS SPA (Cognito-authenticated, served at /admin)
├── src/
│   ├── api/                     # API client + typed calls (content, media, taxonomy,
│   │                            #   analytics, deploy, audit)
│   ├── auth/                    # Cognito PKCE auth provider + protected routes
│   ├── components/              # Content editor, media uploader, frontmatter form
│   └── pages/                   # dashboard, content, taxonomy, deploy, analytics, audit
└── vite.config.ts

infra/
├── bin/app.ts                   # CDK app entry point (SiteStack + AdminStack)
├── lib/
│   ├── site-stack.ts            # Public site (S3, CloudFront, ACM, Route53, /admin + /api behaviors)
│   └── admin-stack.ts           # Admin backend (Cognito, API Gateway, Lambdas, DynamoDB, EventBridge)
├── lambda/                      # Admin API Lambda handlers
│   ├── content/                 # CRUD + revisions/restore for posts & KB
│   ├── media/                   # Image upload / list / delete
│   ├── taxonomy/                # Category/tag rename / merge / delete
│   ├── analytics/               # CloudFront log parsing + daily rollups
│   ├── deploy/                  # Manifest regeneration + CloudFront invalidation
│   ├── audit/                   # Audit-log query endpoint
│   └── shared/
│       ├── git/                 # provider.ts (interface), index.ts (factory),
│       │                        #   providers/gitlab.ts (the one implementation)
│       ├── audit.ts             # audit writer
│       └── alerts.ts            # SNS failure alerts
├── cdk.json
├── package.json
└── tsconfig.json
```

## Content Pipeline

```
Content_Repo clone: content/{posts,knowledge-base}/{slug}/index.md   (CONTENT_ROOT)
                    │
                    ▼
        scripts/generate-manifest.js   (logic in build-artifacts.js)
                    │
        ┌───────────┼───────────────┐
        ▼           ▼               ▼
manifest.json  search-index.json  rss.xml + sitemap.xml
```

1. Each post/article lives in its own directory named after its URL slug, in the
   Content_Repo. The build reads it from a clone via `CONTENT_ROOT`; `public/content` no
   longer exists in this repository (content-storage stage 7).
2. `generate-manifest.js` reads all `index.md` files, parses YAML frontmatter with `gray-matter`, derives slugs from titles via `slugify()`, and writes manifests sorted by date descending. The shared logic is in `build-artifacts.js`, used by both the build and the Content_Repo's Reconcile_Job.
3. Apostrophes (straight and curly) are stripped during slugification, so
   "Don't" becomes `dont` and not `don-t`. **Six implementations of `slugify`
   exist and must stay identical** — `src/lib/slugify.ts`,
   `admin/src/components/slugify.ts`, `infra/lambda/content/index.ts`,
   `infra/lambda/deploy/index.ts`, `scripts/generate-manifest.js` and
   `scripts/rename-dirs.js`. They decide two different things: the **directory
   name** a new post is created under, and the **slug the manifest advertises**.
   If those disagree the published link 404s. Tests pin the expected output in
   each package; `generate-manifest.js` also warns when a directory name doesn't
   match its title slug, which is the signal that they have drifted.
4. A 150-character plain-text excerpt is extracted from the markdown body.
5. `search-index.json` combines posts and KB articles for client-side Fuse.js search.
6. `rss.xml` contains the 20 most recent posts. `sitemap.xml` covers all pages, posts, and KB articles.
7. `rename-dirs.js` can be run separately to rename content directories to match their title slugs.
8. After `vite build`, `generate-meta-pages.js` reads the built manifests and writes per-page `dist/<path>/index.html` shells with page-specific meta/OG tags (see [SEO](#seo)).

## SEO

- `robots.txt` in `public/` directs crawlers and references the sitemap.
- **Legacy URL redirects:** `infra/redirects.json` maps old paths to current ones
  and is inlined into the CloudFront viewer-request function, which answers with a 301. This covers pre-migration URLs and the 38 slugs renamed when the slugify
  implementations were aligned on stripping apostrophes. CloudFront Functions cap
  code at 10 KB, so the map has finite headroom (see
  [future-improvements.md](future-improvements.md)).
- **Prerendered per-page meta tags:** a post-build step (`scripts/generate-meta-pages.js`)
  writes `dist/<path>/index.html` for every post, KB article, and key static
  page, injecting a page-specific `<title>`, `<meta description>`, per-page
  `<link rel="canonical">`, and Open Graph / Twitter Card tags into a copy of the
  SPA shell. A CloudFront viewer-request function rewrites extensionless URLs to
  `/<path>/index.html` so crawlers and social scrapers get accurate metadata;
  the body is the unchanged SPA bundle, so the client app still renders normally.
  URLs without a generated page fall back to the root `index.html`.
- Dynamic document titles per page (`Page Title | Ian Carnaghan`) once the SPA hydrates.
- XML sitemap covers all static pages, posts, and KB articles.
- Content is rendered client-side (SPA); the prerendered `<head>` plus the
  sitemap cover crawler and social-preview discoverability.

  The admin "Deploy Site" (deploy Lambda) regenerates these too, writing only the
  pages whose head-relevant fields changed and deleting the page of anything that
  has left the manifest. It used to regenerate the manifests and not the meta
  pages, so a newly published post was listed and searchable while still serving
  the generic root `<head>`, and an un-published one kept advertising itself at
  its old URL. Static pages are not in the manifests and so are only written by
  the build; they do not go stale on a content edit.

## Analytics

- Google Analytics 4 (GA4) via gtag.js in `index.html`.
- SPA page view tracking fires on every route change via `useLocation()` in `App.tsx`.
- Measurement ID configured in `index.html`.
- **Visitor opt-out:** the Settings menu offers "Don't track my visits". Opting
  out sets GA4's `window['ga-disable-<MEASUREMENT_ID>']` flag, which suppresses
  all collection, and the route-change `page_view` event is skipped as well.
  Because the gtag snippet fires an initial page view before React mounts, a
  small inline script in `index.html` applies the flag from `localStorage`
  _before_ gtag loads — so an opted-out visitor isn't counted at all.
- The admin dashboard has no analytics.

## User Preferences

Theme, density, and the analytics opt-out are stored in `localStorage` and
managed by a settings context in each app:

| Preference        | Values                      | Storage key                   |
| ----------------- | --------------------------- | ----------------------------- |
| Theme             | `light` / `dark` / `system` | `carnaghan-theme`             |
| Density           | `comfortable` / `compact`   | `carnaghan-density`           |
| Analytics opt-out | `true` / `false`            | `carnaghan-analytics-opt-out` |

- **Theme defaults to `system`**, resolved against `prefers-color-scheme`. A
  `MediaQueryList` listener keeps it live, so switching the OS theme updates the
  page immediately without a reload.
- **Shared across both apps.** The public site and admin are separate builds but
  are served from the same origin (`www.carnaghan.com`), so they share
  `localStorage` and these keys — setting dark mode on the public site also
  themes the admin.
- **Legacy keys migrated.** The earlier boolean keys (`blog-dark-mode`,
  `blog-compact`) are read as a fallback, so existing visitors keep their choice.
- **Storage access is defensive.** All reads/writes go through helpers that
  swallow exceptions. `localStorage` can throw in Safari private browsing, with
  blocked third-party storage, or in some embedded webviews; since these run
  during initial render, an unguarded throw would blank the page.

Implementation: `src/lib/settings-preferences.ts` (pure helpers, unit tested) and
`src/lib/settings-context.tsx`, mirrored at `admin/src/lib/`. The admin module
omits the analytics helpers. **The two preference modules must be kept in sync.**

## Testing

Each package has its own Vitest suite, run with `npm test` from that directory,
and all three run together in the CI `test` stage:

| Package  | Scope                                            | Config                    |
| -------- | ------------------------------------------------ | ------------------------- |
| root     | `src/**/*.test.ts(x)`                            | `vite.config.ts`          |
| `admin/` | admin SPA units                                  | `admin/vite.config.ts`    |
| `infra/` | `lambda/**` (handlers) and `lib/**` (CDK stacks) | `infra/vitest.config.mts` |

The root and infra configs set an explicit `test.include`. Without it, Vitest run
from `infra/` walks up and inherits the root config's `src/`-only scope and finds
no tests.

Two things that were quietly broken and are worth not reintroducing:

- The root `check` script ran plain `tsc --noEmit`, which compiled **nothing** —
  the root `tsconfig.json` is `files: []` plus project references, so the whole
  typecheck was a no-op. It is `tsc -b --noEmit` now.
- `infra/tsconfig.json` excluded `**/*.test.ts`, so no infra test file was
  typechecked by anything: Vitest does not typecheck, and the root `tsc -b` only
  references the site and node projects. Tests are included now. Removing the
  exclusion surfaced 77 errors, all from handlers typed as
  `APIGatewayProxyResultV2` (which is `… | string`) while the tests read
  `.statusCode`; the handlers return the structured form and are now typed
  `APIGatewayProxyStructuredResultV2`.

CDK stack tests assert against a synthesised template. They exist because the
deploy Lambda's bucket access is a set of narrow explicit IAM statements rather
than `grantReadWrite`, and a missing grant is invisible to handler tests that mock
the SDK — the failure only appears in production as `AccessDenied`.

## Security

- HTTPS-only via CloudFront with ACM certificate.
- S3 bucket private with Origin Access Control (OAC).
- CloudFront response headers policy: HSTS, X-Frame-Options (DENY), X-Content-Type-Options (nosniff), Referrer-Policy, X-XSS-Protection.
- CloudFront Function redirects apex domain to `www`.
- External links use `rel="noopener"` via Cloudscape's `external` prop.
- Raw HTML rendering enabled via `rehype-raw` — required for embedded iframes in content.
- OIDC authentication in CI/CD — no static AWS credentials.
- Pre-commit hooks enforce linting and formatting.
- CI pipeline includes npm audit (blocking), ASH, SAST, and dependency scanning.

### Content-handling hardening

The admin origin holds auth tokens, so anything it renders or accepts is treated
as untrusted input:

- **Markdown URL sanitising:** react-markdown v10 dropped its built-in
  sanitizer, so a `javascript:` link or image would render as a live
  `href`/`src`. The admin preview passes `urlTransform={safeUrlTransform}`
  (`admin/src/lib/safe-url.ts`), which allows only `http`, `https`, `mailto`,
  `tel` and scheme-less (relative/anchor) URLs and rejects the rest. Whitespace
  and control characters are stripped first so `java\tscript:` can't slip past.
- **Media upload validation:** SVG uploads are rejected (they can carry script),
  and the declared MIME type must be consistent with the file extension, so a
  mismatched pair can't be used to smuggle an unexpected type into the bucket.
- **Frontmatter key guard:** the Content Lambda validates the slug and rejects
  prototype-polluting frontmatter keys (`__proto__`, `constructor`,
  `prototype`) before merging parsed YAML into an object.
- **Preview URL safety:** admin preview links are sanitised before use, and the
  OAuth callback scrubs the stale `?code=` from the URL so a failed exchange
  can't loop the login.

### Why there is no WAF

Assessed and deliberately skipped. The public site is static (CloudFront →
private S3 via OAC) with no server-side code, forms, or user input, so managed
rule sets would inspect for vulnerability classes this architecture doesn't have.
CloudFront already includes AWS Shield Standard for volumetric DDoS, and the
admin API is Cognito-authorised with required TOTP MFA — unauthenticated
`/api/*` calls are rejected by the JWT authorizer before reaching a Lambda.

At roughly $5/month per web ACL plus $1/rule plus $0.60/million requests, a
minimal config would likely cost more than the site's hosting. The real residual
risk is cost from a request flood, and WAF bills per request too, so it doesn't
cap spend; an AWS Budgets alert (free, and able to publish to the alert topic
above) addresses that better. Revisit if a form, comments, or any endpoint
accepting untrusted input is added.

## Accessibility

- Cloudscape Design System provides WCAG-compliant components with built-in keyboard navigation and ARIA attributes.
- Theme respects the OS `prefers-color-scheme` preference by default (see [User Preferences](#user-preferences)).
- Search modal announces result count to screen readers via `aria-live` region, moves focus into the search field on open, and (via Cloudscape's Modal) restores focus to the trigger on close.
- Code blocks are wrapped in a labelled group so screen readers announce the language (e.g. "JavaScript code block").
- Icon-only buttons have `ariaLabel` attributes.
- Theme (Light/Dark/System) and density (Comfortable/Compact) settings for user preferences.
- Responsive TOC panel auto-closes on mobile and responds to window resize.
- CI runs an advisory Lighthouse accessibility audit (see [CI/CD](ci-cd.md)); full validation still needs manual testing with assistive technologies.

## Performance

- Lazy-loaded routes via `React.lazy()` — each page is a separate chunk loaded on demand.
- Vendor chunk splitting: Cloudscape, React/Router, and Markdown each in separate cacheable chunks.
- Dynamic code highlighters loaded per language and cached.
- Search index loaded on demand (first search open only).
- Content images use `loading="lazy"` and `decoding="async"` to defer off-screen image work.
- CloudFront CDN with optimized caching policy.

## Routing

| Path                           | Component                      | Description                                             |
| ------------------------------ | ------------------------------ | ------------------------------------------------------- |
| `/`                            | `HomePage`                     | Landing page with profile, social links, recent posts   |
| `/posts`                       | `PostsPage`                    | Blog posts table with filtering/sorting/pagination      |
| `/posts?tag=X`                 | `PostsPage`                    | Posts filtered by tag (pre-filled text filter)          |
| `/posts?page=N`                | `PostsPage`                    | Posts at specific page (preserved on back navigation)   |
| `/:slug`                       | `ContentPage (posts)`          | Individual blog post                                    |
| `/knowledge-base`              | `KnowledgeBasePage`            | KB articles card grid                                   |
| `/knowledge-base?page=N`       | `KnowledgeBasePage`            | KB at specific page                                     |
| `/knowledge-base/:slug`        | `ContentPage (knowledge-base)` | Individual KB article                                   |
| `/about`                       | `RegistryPage`                 | Landing page from `site/pages/about.json`               |
| `/apps`                        | `RegistryPage`                 | Landing page from `site/pages/apps.json`                |
| `/teaching`                    | `RegistryPage`                 | Landing page from `site/pages/teaching.json`            |
| `/teaching/cmst388-tips`       | `RegistryPage`                 | Landing page from `site/pages/cmst388-tips.json`        |
| `/teaching/cmst388-tips/:slug` | `ContentPage (pages)`          | Individual CMST 388 project guide                       |
| `/bitesize-javascript`         | `RegistryPage`                 | Landing page from `site/pages/bitesize-javascript.json` |
| `/categories`, `/tags`         | `CategoriesPage`, `TagsPage`   | Taxonomy listings                                       |
| `/_preview/*`                  | `PreviewRoute`                 | Temporary; see Landing Pages below                      |
| `*`                            | `NotFoundPage`                 | 404 catch-all                                           |

Blog posts render at the root level (`/:slug`) to keep URLs clean.

**Route order is not load-bearing.** React Router ranks routes by specificity rather than
declaration order, so a literal segment beats a dynamic `:slug` wherever it is written.
An earlier version of this document and a comment in `App.tsx` both claimed otherwise.
Verified by moving `/:slug` above the other routes and re-running
`src/app-routes.test.tsx` — resolution does not change. Those tests exist because the
failure mode is close to invisible from outside: every post has a prerendered
`dist/<slug>/index.html`, so a shadowed route still returns 200 with correct markup and
only goes wrong once React hydrates.

## Landing Pages

The five landing pages — `/about`, `/apps`, `/bitesize-javascript`, `/teaching` and
`/teaching/cmst388-tips` — are JSON files in `site/pages/`, rendered by one generic
component. They used to be five bespoke React components.

A page is an envelope (`slug`, `nav`, `seo`, `header`, `breadcrumbs`) plus an ordered
list of blocks. Six block types exist: `prose`, `card-grid`, `columns`, `badge-list`,
`panel` and `social-links`. `src/lib/page-schema.d.ts` is the definition.

**This did not remove schemas, it decomposed them.** Six block types replace two page
shapes. The gain is composition — a new page arrangement needs no new code — not fewer
definitions. Worth being honest about, because "fewer schemas" was the original pitch
and it was wrong.

### Page data carries semantic values, not renderer values

Stored pages say `tone: "active"`, not `color: "green"`; `columns: 2`, not `cardsPerRow`.
Both of the rejected forms were Cloudscape's own vocabulary — `cardsPerRow` is literally
the name of a Cloudscape `Cards` prop.

`src/pages/landing/tone.ts` holds the entire mapping. That file plus `block-registry.ts`
is what a theme would replace: same JSON, different renderers. Baking a component
library's vocabulary into stored content would mean that changing renderer later requires
migrating content, and once pages are admin-edited and published, migrating stored
content is the expensive kind of change.

Two fields are versioned independently: `schemaVersion` on the envelope, `version` on
each block. Both are cheap now and effectively impossible to retrofit once pages are
stored and published.

### Validation is strict at build time and lenient at runtime

This asymmetry is deliberate. It is not an inconsistency to be tidied up later.

|                                                | Behaviour on an unknown block type or field                        |
| ---------------------------------------------- | ------------------------------------------------------------------ |
| `scripts/validate-page.js` (build)             | **Fails.** Named in the error: page slug, block id, field path.    |
| `src/pages/landing/landing-page.tsx` (runtime) | **Skips and warns.** A render error is contained to its own block. |

The build-time validator is strict so this repository's own content cannot be quietly
wrong — a typo in a block type should stop a deploy, not ship a page with a missing
section.

The runtime renderer is lenient for a different reason: once pages are admin-edited, a
page may be authored by a newer admin than the deployment rendering it. A block type that
build didn't know about should cost its own section, not the page. The same applies to a
block that throws, which is why each one is wrapped in an error boundary that renders
nothing rather than an error panel — a visitor cannot act on "block failed".

Link validation runs at build time for the same reason: `to` must start with `/` and
contain neither `//` nor `:`; `href` must be `http`, `https` or `mailto`. Rejecting a bad
value at validation time rather than sanitising it at render time makes it a build
failure now and an API 400 once the admin can edit pages — never a link that silently
disappears.

### Prose blocks do not render raw HTML

`prose`, `columns` and `panel` render markdown through `src/pages/landing/prose.tsx`,
which deliberately omits `rehype-raw`. `content-renderer.tsx` enables it, which is
defensible for post markdown — that only arrives through a reviewed git commit — but not
for block prose, which becomes untrusted input the moment the admin can edit it. A
`<script>` in a prose field renders as text.

Internal markdown links route client-side; external ones get `target="_blank"` with
`rel="noopener noreferrer"`.

### Spacing

`src/styles.css` gives markdown paragraphs inside a prose block the padding and margin
Cloudscape's `Box variant="p"` and `SpaceBetween` gave the markup they replaced: `4px`
vertical padding, and a `12px` gap between stacked paragraphs. Without those, every
landing page sits 8px high and stacked paragraphs drift 2px apart each.

Both numbers were measured in headless Chrome against the original components, not
derived from reading CSS. Two earlier attempts at this were wrong, and one made the
spacing worse. `scripts/verify-build.js` asserts both rules reach the built CSS, because
Vitest stubs CSS imports to an empty string and so cannot see them.

Three small differences from the originals remain, all deliberate, all because the five
pages were inconsistent with each other:

- `/bitesize-javascript` — its intro used an ad-hoc `padding={{ bottom: "l" }}` with no
  `SpaceBetween` at all; it now uses the standard gap and sits 8px lower.
- `/about` — used `SpaceBetween size="l"` between sections where the others used `"xl"`.
  Standardising costs 4px per gap. Expressing it in page data would mean storing a
  renderer value, which is what `tone` and `columns` exist to avoid.
- `/teaching/cmst388-tips` — its "Additional Resources" prose starts 14px higher. The old
  markup nested raw `<p>` elements inside a `Box variant="p"`, which is invalid, and the
  inner paragraphs' default margins supplied that gap.

### `/_preview/*`

A temporary route for comparing a converted page against the live one, kept while the
registry is wired into route, navigation, sitemap and meta-page generation. It renders
only pages already in the registry, so it exposes nothing new, and `robots.txt` excludes
it. Removed by task 3.9 of the configurable-site spec.

## Component Architecture

### ContentPage

Self-contained content renderer. Accepts `basePath` (`"posts"` or `"knowledge-base"`). Fetches `/content/{basePath}/{slug}/index.md`, parses frontmatter with a lightweight browser-side parser, extracts h2/h3 headings for the table of contents, and renders with ReactMarkdown. Code blocks use `DynamicCodeView` which lazy-loads the appropriate `@cloudscape-design/code-view` highlighter per language and caches it. Tag badges link to `/posts?tag=X` for filtering. Updates the document title dynamically. Returns the `NotFoundPage` with fuzzy suggestions if the content doesn't exist. Wrapped in `ContentErrorBoundary`.

### ContentList

Cloudscape `Table` with text search, category dropdown filter, sortable columns, pagination, and column visibility preferences. Reads `?tag=` and `?page=` query params from the URL to restore state on back navigation. Tag badges are clickable and update the filter inline.

### RelatedPosts

Displayed at the bottom of each post and KB article. Fetches the manifest, scores all other posts by shared tags (2 points) and categories (1 point), and shows the top 4 matches. Only renders if at least one related post is found. Tags are clickable and link to the filtered posts listing.

### SearchModal

Lazy-loads `search-index.json` on first open. Fuse.js fuzzy search (threshold 0.4) across title, excerpt, categories, and tags. Returns up to 20 results. Announces result count to screen readers via `aria-live` region.

### SettingsProvider

React Context for theme (Light/Dark/System), density (Comfortable/Compact), and
the analytics opt-out. Reads the stored preference on mount, applies Cloudscape's
`applyMode()` / `applyDensity()`, sets GA4's opt-out flag, and subscribes to
`prefers-color-scheme` so a `system` theme tracks the OS live. Exposes
`resolvedTheme` (with `system` resolved to a concrete value) for UI that needs to
know what is actually displayed. See [User Preferences](#user-preferences).

The admin has an equivalent provider at `admin/src/lib/settings-context.tsx`,
wired in `admin/src/main.tsx`, surfaced both in a Settings menu in the top
navigation and on the admin Settings page.

## Deployments

Both stacks take a `DeploymentConfig` (`infra/lib/deployment.ts`) describing everything
that differs between one deployment and another: the resource prefix, the bucket name, a
display name, the canonical origin, an optional custom domain, and whether to create the
Budgets alert. `infra/bin/app.ts` declares production from `site.config.json`.

Until this existed there was exactly one possible deployment. Every physical name came
from a single global prefix, and `site-stack.ts` hardcoded the domain and looked up its
hosted zone — so a second set of stacks would have collided on every name, and could not
have been declared without a second registered domain. Every change went straight at
production.

### Staging

```
make staging-diff      # read-only: what would be created
make staging-deploy    # create or update
make staging-destroy   # tear down
```

Staging is declared only under `--context staging=true`, which the Make targets pass. It
serves on its CloudFront hostname: **no custom domain, so no ACM certificate, no Route53
records, no `domainNames` on the distribution and no apex redirect.** Everything else is
a separate physical resource — its own bucket, Cognito pool, audit table and SNS topic,
all prefixed `carnaghan-staging-`.

Verified isolation: the staging templates contain zero certificates, zero record sets and
zero CloudFront aliases, no Budgets resource, and no reference to any production resource
name. Declaring staging also leaves both production templates byte-identical, so adding
it cannot perturb production.

No Budgets alert, deliberately. AWS Budgets measures total account spend, so a second
budget on the same account would report the same number and double every notification
rather than scoping to staging. The alert topic is separate and the production alert
address is not subscribed, so rehearsal noise stays out of production alerting.

Expect roughly **$1–3/month** if left running — mostly CloudFront and the Lambda
baseline. Tear it down when not in use. Note that the bucket, Cognito pool and audit
table are `RemovalPolicy.RETAIN`, so `staging-destroy` leaves them behind; delete those by
hand if you want them gone.

**First deploy is two-phase.** `siteUrl` feeds the Cognito callback URLs and the admin
API's CORS allow-list, but with no custom domain the real origin is the CloudFront
hostname, which does not exist until the distribution does. Deploy once, read
`StagingSite.DistributionDomain` from the outputs, then:

```
make staging-deploy STAGING_SITE_URL=https://d111111abcdef8.cloudfront.net
```

Until then the public site works but admin sign-in does not, and synth emits a warning
saying so. A cleaner fix is possible — the admin stack could take the distribution domain
as a late-resolved parameter — but the stacks already depend on each other in the other
direction, since the site stack consumes the admin API as a CloudFront origin, so
breaking that cycle is a larger change than it is worth today.

One other known limitation: the deploy Lambda finds which CloudFront distribution to
invalidate by matching its configured domain against distribution aliases. Staging has no
aliases, so it matches nothing, logs `Could not find CloudFront distribution; skipping
invalidation`, and carries on. Content is still written and the manifests regenerated;
only the cache purge is skipped. `SITE_ALIAS` is deployment-scoped precisely so that
staging cannot match — and therefore cannot purge — production's distribution.

### Recommended as the rehearsal target

Staging is the recommended place to rehearse the two hard gates in the
[content-storage spec](../.kiro/specs/content-storage/tasks.md): the pruning change and
the projection rebuild. Both touch published content in S3, and both are far cheaper to
get wrong against a throwaway bucket. It is a recommendation rather than a prerequisite —
that spec's stage 1a was deployed straight to production after a `cdk diff` showed a
single property change.

## Admin Dashboard

A separate Cloudscape SPA (in `admin/`, served at `/admin`) for managing content
without editing files by hand. It talks to a serverless backend defined in
`infra/lib/admin-stack.ts`.

### Request flow

```
Browser (/admin SPA)
    │  Authorization: Bearer <Cognito JWT>
    ▼
CloudFront  ──/api/*──►  API Gateway (HTTP API, Cognito JWT authorizer)
    │                        │
    │                        ├─ /api/content/*    → Content Lambda   (S3 + git)
    │                        ├─ /api/media/*      → Media Lambda     (S3 + git)
    │                        ├─ /api/taxonomy/*   → Taxonomy Lambda  (S3 + git)
    │                        ├─ /api/analytics    → Analytics Lambda (logs bucket)
    │                        ├─ /api/deploy(/*)   → Deploy Lambda    (S3 + CloudFront)
    │                        └─ /api/audit        → Audit Lambda     (DynamoDB)
    └──/admin/*──►  S3 (admin SPA build)
```

### Authentication

- Cognito User Pool, invite-only (no self sign-up), email sign-in, with
  **required TOTP MFA** (authenticator app; SMS disabled). The hosted UI walks
  the user through TOTP enrollment on next sign-in.
- SPA uses the Authorization Code + PKCE flow against the Cognito hosted UI (no
  client secret), so MFA enrollment/challenges are handled by Cognito with no
  SPA code. Tokens are stored client-side; the API client attaches the bearer
  token and refreshes on 401.
- API Gateway uses a Cognito JWT authorizer, so every `/api/*` call is
  authenticated; the Lambdas read the caller identity from the JWT claims.

### Content model & source of truth

Content lives in **three** places during the current migration, which is one more
than the end state and the thing to keep straight when reading this section:

- **Content_Repo `content/{type}/{slug}/index.md`** — a private repository holding
  only content, and the source of truth. Every admin mutation is committed here
  through the GitLab API (`lambda/shared/git/providers/gitlab.ts`). Which
  repository, host and branch come from the `git` block in `site.config.json`.
- **S3 `content/{type}/{slug}/index.md`** — what the live site serves (the public
  site fetches these plus `manifest.json` directly). A derived projection: the admin
  commits to git first and writes S3 second (see below), so S3 is downstream of the
  Content_Repo rather than written independently.
- **This repo's `public/content/{type}/{slug}/index.md`** — a leftover. Still what
  the build reads, and still what CI uploads, but **no longer written by admin
  edits**. Removing it is a later stage of the
  [`content-storage`](../.kiro/specs/content-storage/tasks.md) spec.

Note the path difference: the Content_Repo has no `public/` prefix, because
content there is not sitting in a Vite static directory. `s3KeyToRepoPath` in the
provider is the one place that mapping lives, and it is now identity.

Because the build still reads `public/content`, a post authored only through the
admin exists in the Content_Repo and in S3 but not in this repository. That is
survivable only because `BucketDeployment` has `prune: false` — with pruning on, a
deploy would build from a tree missing that post and delete it from S3. The
comment at `infra/lib/site-stack.ts` records this; the Reconcile_Job in a later
stage is what actually closes it.

Commits are tagged `[skip ci]`. That mattered when they landed in this repository;
now they land in another project, so it is vestigial rather than load-bearing. The
GitLab token is stored in Secrets Manager, needs the `api` scope (the multi-file
Commits API used for taxonomy and restore requires it; single-file writes use the
Repository Files API), and **must grant access to the Content_Repo** — a token
scoped only to this repository fails every commit.

**A save that did not reach git is not a save.** The write path commits to the
Content_Repo first and writes the S3 projection only if that commit succeeded. A
failed commit fails the whole operation — the handler returns 502
(`GIT_COMMIT_FAILED`), the user is told the change was not saved, and S3 is never
touched, so no half-written state results. This reverses the earlier best-effort
behaviour, where a failed commit was swallowed and left S3 holding content git did
not have.

One deliberate asymmetry: if the commit succeeds but the subsequent S3 write fails,
the save is _not_ failed. Git — the source of truth — already has the change, so
the site simply serves the previous body until the next reconcile. That is visible
staleness, never loss. For a taxonomy change (many files, one commit) the handler
reports a 207 with a count of projection writes left behind; for a single save it
surfaces as an error, but the committed change stands.

The one case that is _not_ a failure is git being unconfigured — no token secret.
Then every commit "skips", and the save proceeds and writes S3 as before. That is
what keeps a fresh framework install, and the test suite, working without a content
repo wired up. The gate lives in one place, `requireCommitted` in
`lambda/shared/git/index.ts`, so all three write Lambdas apply it identically.

The multi-file operations — taxonomy rename, merge, bulk delete — are still a
single atomic commit (`commitFiles`), which gives one revertible changeset and
means a partial write can't leave half a rename committed.

The audit log's old `gitMirrored` / `gitError` columns were retired with this
change: a failed mirror is now a failed save that never reaches the audit writer,
so there is no per-entry mirror status left to record. Records written under the
old regime keep rendering their status; new ones omit it.

#### Why edit times live in frontmatter

Content timestamps can't come from S3. `BucketDeployment` uploads all of `dist/`,
which includes the content markdown, so **every deploy rewrites every content object
and resets its `LastModified`** — all 1,100+ items then report the deploy time. The
admin dashboard showed exactly that before a `modified` frontmatter field was added.

`modified` is stamped server-side on each editor save, so it rides along in the file:
it survives the deploy rewrite, and the commit to the Content_Repo carries it, making
the value effectively the git modification timestamp without any GitLab lookup to read
it. The Deploy Lambda writes manifests, search index, RSS, sitemap and the prerendered
`<slug>/index.html` heads — never `index.md` — so regeneration cannot disturb it. See
[Developer Guide › `modified` vs `date`](developer-guide.md) for which write paths
deliberately don't stamp it.

S3's `LastModified` is still used, but only as the **optimistic-concurrency token**:
the client echoes back the value it loaded and the save is rejected if S3 has moved
on. Keep the two distinct — repointing the concurrency token at `modified` would
break stale-overwrite detection without raising an error. The same deploy-rewrite
behaviour also makes that check fire spuriously for an editor left open across a
deploy, which is noted in [Future Improvements](future-improvements.md).

### Lambda functions

| Lambda    | Routes                                                                        | Responsibility                                                                                                                                                                                                                                           |
| --------- | ----------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Content   | `GET/PUT/DELETE /api/content/{type}[/{slug}]`, `.../revisions`, `.../restore` | CRUD for markdown; optimistic-locking conflict check on save; revision history + rollback via git                                                                                                                                                        |
| Media     | `POST/GET /api/media/{type}/{slug}`, `DELETE .../{filename}`                  | Image upload, list, and delete (git-mirrored)                                                                                                                                                                                                            |
| Taxonomy  | `GET /api/taxonomy`, `PUT .../rename`, `.../merge`, `DELETE .../{name}`       | Bulk category/tag edits across all content (atomic multi-file git commit)                                                                                                                                                                                |
| Analytics | `GET /api/analytics`                                                          | Parses CloudFront logs into per-day rollups; merges a date range                                                                                                                                                                                         |
| Deploy    | `POST /api/deploy`, `GET /api/deploy/status`, `GET /api/deploy/history`       | Regenerates manifest / search index / RSS / sitemap / prerendered `<head>` pages from S3 (drafts + future-dated posts excluded) and invalidates CloudFront; records deploy history; also runs on an hourly schedule to publish content that has come due |
| Audit     | `GET /api/audit`                                                              | Returns recent admin activity from DynamoDB                                                                                                                                                                                                              |

### Deploy ("publish") flow

Saving a post writes its `index.md` and commits it to the Content_Repo, but does
**not** rebuild the site-wide indexes. The **Deploy Site** button triggers the
Deploy Lambda, which (via an async self-invocation so the request returns
immediately) reads all content from S3, regenerates `manifest.json` /
`search-index.json` / `rss.xml` / `sitemap.xml` and the prerendered
`<slug>/index.html` heads, writes them to the bucket root, and invalidates
CloudFront. Status is polled from `admin/deploy-status.json`.

Three details of that path are easy to get wrong and are each guarded by a test:

- **The sitemap's non-manifest entries come from the page registry**
  (`site/pages/index.js`), the same list the build script and the route table
  read. They used to be a hardcoded list here that had drifted: it named three
  landing pages by hand and omitted `apps`, `teaching/cmst388-tips` and the three
  standalone `cmst388-tips` children. So an admin deploy dropped five URLs and the
  next pipeline build put them back — the sitemap's contents depended on which
  path ran last. The five framework routes and three standalone paths are still
  written in both places, with `make verify-build`'s own independent list as the
  backstop.
- **Prerendered pages are diffed, not rewritten.** The new manifests are compared
  against the published ones on a fingerprint of the fields that reach the
  `<head>`, so a one-post edit writes one object rather than ~1,170. Pages for
  entries that have left the manifest are deleted. Tags and categories are
  deliberately not in the fingerprint — they render client-side.
- **Invalidation collapses past twenty paths.** A normal edit adds one or two; a
  taxonomy rename could add hundreds, and CloudFront bills per path beyond a free
  allowance, so a bulk change becomes a single `/*`.

The Lambda reads the deployed `index.html` as its shell and refuses to write
anything if it cannot find the title and canonical placeholders — emitting pages
that look fine and carry the generic head is the failure this is meant to prevent,
so it fails the deploy instead. By that point the manifests have published, so
content is live and only the per-page head is behind.

This Lambda duplicates `scripts/generate-manifest.js` and parts of
`scripts/generate-meta-pages.js`. The duplication is deliberate for now — Lambda
has no git binary and no build toolchain — but it is the standing source of
build-path-versus-admin-path divergence, and is tracked in
[`.kiro/specs/README.md`](../.kiro/specs/README.md).

Regeneration applies the same `isPublished()` filter as the build-time
generator: posts with `draft: true` or a `date` in the future are excluded from
the manifests (missing/unparseable dates stay published). Every completed deploy
is appended to `admin/deploy-history.json` (status, duration, post/KB counts, and
who triggered it, capped at 50 entries) and surfaced in the deploy page's Deploy
History table.

**Stale-deploy recovery.** A new deploy is refused while one is in progress, but
that status is written _before_ the async worker is invoked — so a lost or
throttled invocation used to wedge the status at `building` permanently, blocking
both manual deploys and the hourly scheduler. An in-progress status older than 15
minutes is therefore treated as stale and may be superseded, and the self-invoke
is wrapped so a failure resets the status instead of leaving it hanging.

### Alarms, failure destinations and cost guard

Three layers, because each catches what the others can't:

1. **In-handler SNS alerts** (below) report a caught error with useful context.
2. **Lambda failure destinations** (`onFailure` → the alert topic) on the deploy
   and analytics functions catch async invocations that fail _without_ the
   handler running — OOM kills, timeouts, or an invocation that never starts.
   Both are invoked asynchronously (the hourly scheduled publish, the self-invoked
   regeneration worker, the daily analytics rollup), and Lambda otherwise retries
   twice and discards the event silently.
3. **CloudWatch alarms** on the topic cover the functions with no in-handler
   alerting at all: one `Errors` alarm per function, a single aggregate `Throttles`
   alarm (no `FunctionName` dimension, so it spans every Lambda in the region),
   and a duration alarm at 80% of the deploy function's 300s timeout. Eight
   alarms total.

   The aggregate `Throttles` alarm replaced six per-function ones to keep this
   set small, on the reasoning that eight fits inside CloudWatch's ten free
   alarms. That reasoning was incomplete: **the free tier is ten per account, not
   per stack.** This account also runs three alarms for an unrelated application,
   so the real total is eleven and one alarm is billable — about $0.10/month.
   Accurate, trivial, and worth stating rather than repeating the wrong claim:
   check `aws cloudwatch describe-alarms` account-wide before assuming headroom.

**Log retention** is set to one month on every function — CloudWatch defaults to
never expiring, which accumulates cost indefinitely.

**Reserved concurrency** is set per function (3–10). Usage is single-user, so
these are far above real demand; they exist as a cost ceiling and a kill switch
(set to 0 to stop a function dead). The deploy function needs more than one
because the API invocation and its async worker overlap briefly.

**HTTP API throttling** is 10 rps sustained / 20 burst on the default stage. The
routes are Cognito-authorised, so this isn't the first line of defence — it's a
cost guard, since API Gateway and Lambda both bill per request.

**Budget alert.** An AWS Budgets monthly cost budget (default $30, override with
`--context monthlyBudgetUsd=50`) publishes to the same topic at 80% actual and
100% forecast. This is the real mitigation for denial-of-wallet, which a WAF would
not cap — see [Why there is no WAF](#why-there-is-no-waf). The topic policy grants
`SNS:Publish` to `budgets.amazonaws.com`, which Budgets requires.

The budget **excludes the `Amazon Registrar` service**, because domain renewals are
lumpy annual charges — in one observed month, $47 across 11 auto-renewing domains,
more than twice the entire infrastructure spend. Left in, the budget breached every
renewal month no matter how the infrastructure behaved, and an alert that always
fires is an alert nobody reads. A renewal is also a known fixed commitment that an
alert can't help with.

The exclusion uses `FilterExpression` + `Metrics` rather than the legacy
`CostFilters` map, which is include-only and so can't express "everything except
this". An allow-list of services would have silently missed any newly adopted
service. AWS requires `FilterExpression` and `Metrics` together and forbids
combining them with `CostFilters`/`CostTypes`.

The $30 limit is measured, not rounded: baseline spend with registrar excluded runs
$15–16/month, so a $20 limit put the 80% notification at $16 — on the line every
month. $30 warns at $24, which tolerates intermittent EC2 use while still catching a
genuine runaway, which for a static site would be hundreds rather than tens.

### Failure alerts

Deploy and scheduled-publish failures publish to an SNS topic
(`carnaghan-admin-alerts`) via `lambda/shared/alerts.ts`, so unattended runs don't
fail silently. Publishing is best-effort — a notification problem never masks the
underlying error — and is a no-op when `ALERT_TOPIC_ARN` is unset. Subscribe an
email at deploy time with `--context alertEmail=you@example.com`. The topic ARN is
a stack output so it can also carry an AWS Budgets alert.

**The subscription is conditional on that context value, which makes a bare deploy
destructive.** The email subscription is only synthesised when `alertEmail` is
present, so `cdk deploy` without it renders a template with no subscription and
CloudFormation deletes the existing one — every alarm then publishes to a topic with
no subscribers while continuing to report `OK`. CI is safe because it always passes
`ALERT_EMAIL`; `make deploy-local` refuses to run without it. Sourcing the address
from SSM instead, so a missing value fails the deploy loudly, is listed in
[Future Improvements](future-improvements.md).

Note also that an email subscription is not live until the confirmation link AWS
sends is clicked. Until then `aws sns list-subscriptions-by-topic` reports
`SubscriptionArn: PendingConfirmation` and nothing is delivered. `make alerts` shows
this — a real ARN means confirmed. The confirmation mail is easily filtered as spam
and its token expires after three days.

### Scheduled publishing

An hourly EventBridge rule invokes the Deploy Lambda with a `scheduled-publish`
action. It rebuilds the manifests as of "now", compares them to what is currently
published, and only deploys when something has come due — so a post given a
future `date` goes live within the hour of its date with no manual action, while
an hour with nothing pending is a no-op (no invalidation, no deploy-history
entry). Scheduler-triggered deploys appear in history as `triggeredBy: scheduler`.
In the editor a future date is surfaced as a "Scheduled" note, and the content
list shows a "Scheduled" badge.

### Editing safeguards

- **Preview image paths:** content markdown references images relatively
  (`images/diagram.png`), which the public renderer rewrites to
  `/content/{type}/{slug}/…`. The admin preview renders at `/admin/posts/{slug}`,
  so it applies the same rewrite (`resolveImageSrc`) — otherwise relative paths
  would resolve against the admin URL and 404. External and root-relative URLs
  are passed through untouched.
- **Optimistic locking:** the editor sends the last-known S3 `lastModified` on
  save; the Content Lambda rejects a stale write with `409 EDIT_CONFLICT` so two
  editors can't silently clobber each other.
- **Autosave / draft recovery:** the editor debounces edits into `localStorage`
  per post and offers to restore an unsaved local draft when a post is reopened.
- **Quality checks:** a non-blocking panel flags SEO/description/title/date/
  taxonomy and image-path issues before publishing.

### Analytics rollups

The Analytics Lambda reads CloudFront access logs from a dedicated logs bucket.
To avoid re-parsing raw logs on every request, completed days are aggregated into
`analytics/daily/YYYY-MM-DD.json` rollups (read from, and lazily written to, the
logs bucket); only the current day is parsed live. A daily EventBridge schedule
re-aggregates recent days to pre-warm rollups and catch late-arriving logs.

Known limitation: a range's `uniqueVisitors` is the sum of per-day unique counts,
so a visitor active on several days is counted more than once. Exact cross-day
de-duplication would mean storing per-day visitor sets (or a HyperLogLog sketch).

### Audit log

Every mutation Lambda writes a who/what/when record (from the JWT identity) to a
DynamoDB table (single partition, sorted by time). Each entry also records
whether the git mirror succeeded, so failed mirrors surface in the admin **Audit
Log** page rather than only in CloudWatch.

## Infrastructure

See [infra/README.md](../infra/README.md) for the full deployment architecture.

```
Route53 DNS (carnaghan.com + www)
    │  A records (alias) → CloudFront
    ▼
CloudFront Distribution
    │  - HTTPS redirect, ACM certificate, security headers
    │  - CloudFront Functions (apex → www + legacy redirects + pretty-URL
    │    rewrite to /<path>/index.html; separate /admin SPA rewrite)
    │  - SPA error handling (403/404 → index.html)
    │  - OAC (Origin Access Control)
    │
    ├── default (/*)  → S3 Bucket (private) — public site (dist/)
    ├── /admin/*      → S3 Bucket — admin SPA build
    └── /api/*        → API Gateway (admin backend; see admin-stack)
```

## Dependencies

| Package                            | Purpose                                    |
| ---------------------------------- | ------------------------------------------ |
| `react` + `react-dom`              | UI framework                               |
| `react-router-dom`                 | Client-side routing                        |
| `@cloudscape-design/components`    | UI component library                       |
| `@cloudscape-design/global-styles` | Theme/density utilities                    |
| `@cloudscape-design/code-view`     | Syntax-highlighted code blocks             |
| `react-markdown`                   | Markdown rendering                         |
| `fuse.js`                          | Client-side fuzzy search                   |
| `gray-matter`                      | YAML frontmatter parsing (build-time only) |
| `vite` + `@vitejs/plugin-react`    | Build tool + dev server                    |
| `typescript`                       | Type checking                              |
| `prettier`                         | Code formatting                            |
| `husky`                            | Git hooks (pre-commit)                     |
| `lint-staged`                      | Run linters on staged files only           |
