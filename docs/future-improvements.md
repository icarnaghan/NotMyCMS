# Future Improvements

Outstanding work only. Anything already built is documented in
[Architecture](architecture.md), the [Developer Guide](developer-guide.md),
[CI/CD](ci-cd.md) or [Infrastructure](../infra/README.md) rather than here.

Nothing below is urgent — the site and admin are functional as-is.

## Do next

**Apply the least-privilege deploy role.** The GitLab OIDC role still uses
`AdministratorAccess`. The replacement policy is written and committed at
[`infra/deploy-role-policy.json`](../infra/deploy-role-policy.json); applying it
is manual because it's the role CI assumes. Step-by-step instructions, including
verification and rollback, are in
[Runbook: Scope the GitLab Deploy Role](./runbook-scope-deploy-role.md).

**Source the alert email from SSM instead of deploy context.** Today the SNS email
subscription is only synthesised when the `alertEmail` context value is present
([`admin-stack.ts`](../infra/lib/admin-stack.ts)), so a deploy that omits it deletes
the confirmed subscription and silently disarms every alarm while they keep reporting
`OK`. That is graceful degradation pointed at the wrong failure: it buys a successful
deploy by destroying the alerting.

CI always passes `ALERT_EMAIL` and `make deploy-local` refuses to run without it, so
the hazard is currently fenced off rather than removed. Reading the address from an
SSM parameter would remove it: the value no longer depends on who deploys or from
where, a missing parameter fails the deploy loudly, and the address stays out of
source. One-time setup, then the local-vs-CI divergence is gone for good.

**Migrate `logRetention` to `logGroup`.** Every `cdk synth` now prints
`aws_lambda.FunctionOptions#logRetention is deprecated ... will be removed in the
next major release`. Not a find-and-replace: the current property provisions log
groups through a custom resource, so switching to explicit `LogGroup` constructs
will try to create groups that already exist and fail the deploy unless they're
imported or given a matching removal policy. Needs doing before CDK v3.

## Image optimization

- Convert content images to WebP at build time and emit responsive `srcset`
  attributes. The largest remaining user-facing performance win given 1,100+
  image-heavy articles, and also the largest job: it needs an image pipeline
  (likely `sharp`), a `<picture>` change in the renderer, and a decision about
  where converted files live. Images are already lazy-loaded, which took the
  cheap part of this win.

## Performance

- Evaluate splitting the search index by content type — it's ~486 KB, though only
  fetched on first search open, so the payoff is modest.
- Monitor Core Web Vitals via Google Search Console.

## Testing

- React Testing Library component tests (`ContentList`, `SearchModal`,
  `RelatedPosts`). Pure utilities and the Lambda handlers are already covered.

## Accessibility

- Broaden the Lighthouse audit beyond the homepage and tighten the score
  threshold once a real baseline exists (the job only started producing scores
  after the `--no-sandbox` fix).
- Ongoing manual testing with assistive technologies — the automated audit can't
  substitute for it.

## Admin — editorial workflow

- Draft → review → approve → publish states with transitions and gates. Today
  it's a single `draft` boolean, which is adequate for one author.
- Preview/staging: view unpublished content on a private URL. The editor preview
  covers markdown rendering but not the real page.
- Deploy rollback: one-click re-publish of a prior snapshot. Deferred because a
  true rollback needs per-deploy snapshots of the generated artifacts, which the
  regenerate-from-source model doesn't keep. Git plus revision-restore already
  covers content recovery.

## Admin-managed landing pages

Curated landing pages — `/apps` and `/teaching` — are the only content on the
site that still requires a code change and a CI build to edit. Posts and
knowledge-base articles have been manageable from the admin for a while; these
haven't, because their content is structured (tiles, badges, groups of links)
rather than a markdown body, and the content pipeline only understands
markdown-with-frontmatter.

**Half of this is now done.** All five landing pages — `/about`, `/apps`,
`/bitesize-javascript`, `/teaching`, `/teaching/cmst388-tips` — are JSON in
`site/pages/`, composed from six block types and rendered by
`src/pages/landing/`. The components and the `src/data/` modules they read are
gone, and the registry drives routes, navigation, sitemap and prerendered heads.
So the _data_ half is finished; the _editing_ half is not.

What remains is the admin UI, and there is one real design question in the way.

Landing pages are build-time data: `site/pages/*.json` is imported by
`site/pages/index.js` and bundled into the main chunk. Posts are different —
they're fetched from S3 at runtime, which is why the admin can edit one and have
it live after an invalidation. An editor for landing pages therefore needs one of:

- **A pipeline run per edit.** Simple, honest, and slow — minutes per change, and
  it makes the admin dependent on CI being green.
- **Moving page JSON to S3** so it is fetched at runtime like content. That makes
  routes and navigation runtime-derived, which partly undoes the build-time
  registry that the sitemap and meta-page generators depend on. They would need
  to read from S3 too, or accept being a build behind.

Neither is obviously right, which is why it is not specified yet. Worth deciding
after `content-storage` lands, since that spec is already moving the boundary
between what is in the repository and what is in S3.

Drag-and-drop block reordering is a **non-goal**. Cloudscape's `sortable-area` and
`drag-handle` live under `internal/components/` — unsupported API, and a poor
dependency for a published framework. Up/down buttons are keyboard-accessible by
default, which matters given the Lighthouse checks.

Worth noting what this doesn't need: no new infrastructure, no schema migration,
no DynamoDB table. The work is admin UI plus that one storage decision.

Not urgent. Editing a JSON file is fine for an author who also has the repo
checked out, and these pages change a few times a year.

## Admin — authoring quality

- Server-side frontmatter schema validation (required fields).
- Readability scoring and slug suggestions.

## Admin — identity & access

Both presuppose more than one person, so neither is worth building yet:

- RBAC via Cognito groups (admin / editor / author / viewer) enforced in the API
  authorizer.
- SSO / federation with an external IdP (SAML/OIDC via Cognito).

## Admin — ops & integrations

- Slack delivery for failure alerts — the SNS topic can fan out to a Lambda or
  AWS Chatbot.
- Consider excluding `Tax` from the cost budget as well, the way `Amazon Registrar`
  already is. Tax on infrastructure is legitimate spend, so this is marginal.
- Webhooks on content events — no downstream consumers exist, so not planned.

## AWS account housekeeping

Found during a cost audit. None of it is urgent; the amounts are small but the
clutter obscures what is real.

- **Two orphaned SNS topics**, `ScaleUpEvent` and `MyWebsiteIsDown`, were the
  notification targets of CloudWatch alarms from 2017–2018 that have since been
  deleted. Topics cost nothing, so this is tidiness only.
- **Elastic IP costs the same whether its instance runs or not** — $0.005/hr, about
  $3.60/month, billed as `PublicIPv4:InUseAddress` or `PublicIPv4:IdleAddress`
  depending on attachment. Stopping an instance does not stop this charge, and a
  stopped instance's EBS volume keeps billing too. Worth an occasional check for
  allocations that are no longer needed.
- **Eleven domains are on auto-renew**, roughly $47 in a heavy renewal month. Several
  look unused. The cost budget now excludes registrar charges so they no longer
  distort alerting, which also means they no longer show up anywhere — worth a
  deliberate review rather than letting them renew unexamined.
- **Drafts are unlisted, not private.** `draft: true` keeps content out of every
  manifest, but the content route fetches the markdown directly and never checks
  the flag, so a draft is readable by anyone with the URL. The editor says so now,
  which is the honest minimum. Making it actually private means staging drafts
  under a non-public prefix and having the admin preview read them through the
  authenticated API, promoting to `content/` on publish — the manifest cannot
  provide it, since nothing on the read path consults one.

## Analytics

- A privacy-friendly alternative (Plausible, Umami) would remove the GA4
  dependency entirely rather than making it opt-out. This is a preference, not a
  defect: the visitor opt-out already addresses the consent concern.
- Exact cross-day unique-visitor counting (see
  [Architecture › Analytics rollups](architecture.md#analytics-rollups)).

## Dependency & tooling follow-ups

- ~~Run `cdk diff --all` before the next deploy~~ — done. The `aws-cdk-lib`
  2.264.0 bump shifted no synthesised defaults in either stack; the only diffs were
  content asset hashes. No action outstanding.
- **82 unconfigured CDK feature flags** are now reported by `cdk synth`; worth a
  deliberate pass.
- **Bump the pinned AWS CLI version** (`AWS_CLI_VERSION`, currently `2.17.20` —
  over a year old). Confirm the pinned installer URL resolves before changing it.
- **`brace-expansion` advisory in `infra/`** is nested inside `aws-cdk-lib`'s own
  dependency tree and can't be fixed from here. Build-time only and not covered
  by the CI audit job; it clears when CDK updates its dependency.
- **Redirect map ceiling** — `infra/redirects.json` is inlined into a CloudFront
  Function capped at 10 KB. About 3.5 KB of headroom remains (~25 typical
  entries); move it to a CloudFront KeyValueStore before that runs out.

## SEO

- A post-build script generating per-page meta was the big win here and is done.
  Remaining: consider structured data (JSON-LD) for articles.
- **Add `<lastmod>` to the sitemap**, now cheap since content carries a `modified`
  frontmatter stamp (see [Developer Guide › `modified` vs `date`](developer-guide.md)).
  Fall back to `date` where `modified` is absent. Note it has to go into **both**
  manifest builders — `scripts/generate-manifest.js` and the deploy Lambda's
  regeneration path — or an admin deploy will silently drop the field. The
  sitemap's _static_ pages now come from the page registry in both, so only the
  per-item fields are still duplicated.
- Structured data is done for articles: the prerendered `<head>` carries
  `BlogPosting` JSON-LD, written by both the build and the deploy Lambda.

## Admin — known rough edges

- ~~**A deploy can cause a spurious edit conflict**~~ — **fixed by a one-line change,
  pending.** Optimistic concurrency compares the client's `lastModified` against S3's, and
  a site deploy currently rewrites every content object, so an editor left open across a
  deploy gets `EDIT_CONFLICT` on save even though nobody touched that article.

  No new concurrency mechanism is needed after all. `BucketDeployment` has no reason to
  upload content — the admin writes it directly — so excluding `content/*` stops the
  deploy touching those objects, the token stops moving, and the false conflict
  disappears. That exclusion is
  [`content-storage`](../.kiro/specs/content-storage/tasks.md) task 1.1, which is also
  the fix for the prune data-loss path and for the ~6,938 object versions accumulating
  from deploy churn. One change, three problems.

- **Backfill `modified` from git history.** The field is only stamped when an item is
  saved through the admin, so the ~1,170 existing articles have none and fall back to
  their publication date. "Recently Modified" therefore reads as "recently published"
  until content gets edited. A one-off script could derive the real value cheaply: a
  single `git log --name-only --format=%cI -- public/content` pass builds a
  path-to-last-commit-date map for the whole tree, no per-file invocation needed.
  Worth doing before adding sitemap `<lastmod>`, so the dates published to crawlers
  are real rather than a mix of publication dates.

- **Show `modified` on the content list page.** It currently shows only `date`. A
  sortable "Modified" column would make "what have I touched lately" answerable
  beyond the dashboard's top five. Small, and worth more after the backfill above.
