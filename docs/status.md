# Status

Where the project stands and what comes next. The detail behind each item lives in the guides
linked here; [Future Improvements](future-improvements.md) holds the full backlog.

## Where things are (v0.2.0)

NotMyCMS is a git-backed CMS and static-site framework on AWS: a React single-page site on
S3 and CloudFront, a serverless admin (Cognito, API Gateway, Lambda), and content kept as
Markdown and JSON in a private Content_Repo.

| Area            | State                                                                                             |
| --------------- | ------------------------------------------------------------------------------------------------- |
| Public site     | Built. Posts, a knowledge base, categories, tags, search, landing pages, RSS and a sitemap.       |
| Admin           | Built. Content, media, taxonomy, deploys, an audit log, and a block-based landing-page editor.    |
| Site identity   | Complete. Everything site-specific is in `site.config.json` or the Content_Repo.                  |
| Content storage | Complete. Git is the source of truth; the admin commits to it.                                    |
| In-admin help   | Built. Settings hints and a Help page linking to these docs (`docsBaseUrl`).                      |
| Themes          | **New in v0.2.0.** Two themes behind one contract, chosen at build time. See [Themes](themes.md). |
| Text size       | **New in v0.2.0.** Visitors can choose Default, Large or Larger.                                  |

### What v0.2.0 added

- **A theme system.** The site's logic moved into a headless core (`src/core/`); each theme
  supplies the views. Cloudscape is the default and renders exactly as before, verified by
  accessibility-tree snapshots and build-output checksums recorded before the refactor.
  Tailwind is a lighter, blog-style alternative with larger article text. Set `"theme"` in
  `site.config.json`, or `THEME=tailwind` for a one-off build.
- **One test suite for every theme.** `src/conformance/` runs the same behavior tests against
  each theme, so a theme cannot drift without a test failing.
- **Site copy out of the source.** The home-page intro, category descriptions and the guide
  section are `site.config.json` fields (`homeIntro`, `categoryDescriptions`, `guideSection`).
- **"Color mode"** replaces "Theme" in the settings menus, since "theme" now means the design.
  The storage key is unchanged, so nobody's saved choice is lost.
- **Caching fixes.** HTML and `/content/*` are served `no-cache`; hashed assets are immutable.

## Next

Roughly in priority order. None is urgent.

1. **Decide whether to switch a live site to the Tailwind theme.** It is a one-line config
   change and a deploy. Before switching, check that the advisory `build-tailwind` and
   `a11y-tailwind` CI jobs have run green on the main branch.
2. **Apply the least-privilege deploy role.** The CI role still has `AdministratorAccess`.
   The policy is written; see the [runbook](runbook-scope-deploy-role.md).
3. **Make the guide-section content type self-describing.** The standalone guides under the
   configured `guideSection` are still listed by name in the build scripts, the deploy Lambda
   and the redirects file. Giving that content type a manifest would let all of those derive
   the list. Changing the Lambda needs a deploy. See [Framework decoupling](future-improvements.md#framework-decoupling).
4. **Fix keyboard access in the Cloudscape theme.** The categories and tags pages navigate
   through a click on a span with no role, and Lighthouse reports unnamed buttons on the posts
   list and articles. The Tailwind theme does not have these gaps.
5. **Widen the accessibility audit.** CI audits only the home page. Audit a list, an article
   and a landing page too, and serve them as `/path/`, never `/path/index.html`, which the app
   reads as a post named `index.html`.
6. **Replace test fixtures that carry a real site's content** with neutral ones, so the public
   repository ships none of it.
7. **Smoke-test the landing-page editor in a browser.** It is covered by tests but has not had
   a human click through it end to end.

Smaller items (image optimization, editorial workflow, audit-log filters, dependency
follow-ups) are in [Future Improvements](future-improvements.md).

## Known limits

- **No runtime theme switching, and no admin toggle.** The theme is build-time configuration
  in the source repository; the admin only writes to the Content_Repo. A toggle would mean
  giving the admin write access to source and triggering a build. Not planned.
- **Density is Cloudscape-only.** The Tailwind theme does not offer it, and a saved choice is
  kept, not erased, so it applies again if the site switches back.
- **The full test run is slow on a busy machine** (about 90 seconds). Lazy-loaded views load
  their module graph on first render, so timeouts are generous (20 s per test, 15 s for async
  queries). Passing tests do not wait longer.
- **The Cloudscape snapshot baseline is Cloudscape-specific.** `src/theme-baseline.test.tsx`
  records that theme's accessibility tree and runs only against it. Shared behavior is
  covered by the conformance suite.

## How releases are made

The public repository is a no-history snapshot of this one, plus placeholder values:

- `site.config.json` and `admin/.env.production` are replaced with placeholders.
- Planning documents (`.kiro/`) are left out.
- Before publishing, the snapshot is scanned for the real site's identifiers and for
  credentials, then type-checked, linted and tested with the placeholder config.
