# Common chores for this site. Identity comes from site.config.json.
#
# Run `make` with no arguments for the list.
#
# Two things here are load-bearing rather than convenience, because both have
# already cost debugging time:
#
#   1. `make build` runs generate-manifest.js BEFORE vite build. The manifest
#      script writes public/sitemap.xml and the manifests; vite then copies
#      public/ into dist/. Run them the other way round and you ship a stale
#      sitemap that silently omits any newly added page. `make verify-build`
#      asserts the static routes actually landed.
#
#   2. `make deploy-local` refuses to run without ALERT_EMAIL. The SNS email
#      subscription is only synthesised when the alertEmail context value is
#      present, so a deploy without it renders a template with no subscription
#      and CloudFormation deletes the confirmed one — disarming every alarm
#      while leaving them all reporting OK. CI passes it automatically.
#
#   3. `make deploy-local` builds first and ships the admin SPA too, because the
#      site bucket deployment uploads whatever dist/ currently holds, and the
#      admin frontend is shipped by an s3 sync rather than by CDK. A bare
#      `cdk deploy` publishes a stale site and no admin changes at all.
#
# Normal deploys need none of this: push to main, then click the manual deploy
# job in GitLab. `deploy-local` exists for the rare case CI is unavailable.

.DEFAULT_GOAL := help

# Read from site.config.json rather than duplicated here, so this file works for a
# different deployment. Recursively expanded, so node only runs for the targets that
# actually use them.
AWS_REGION ?= $(shell node -p "require('./site.config.json').region")
SITE_BUCKET ?= $(shell node -p "require('./site.config.json').apexDomain")
# The CloudFront alias used to locate the distribution to invalidate.
SITE_DOMAIN ?= $(shell node -p "require('./site.config.json').domain")
# Prefix for AWS resource names. Must match resourceName() in infra/lib/site-config.ts.
RESOURCE_PREFIX ?= $(shell node -p "require('./site.config.json').resourcePrefix")
ALERT_TOPIC_NAME := $(RESOURCE_PREFIX)-admin-alerts

# The hand-maintained list of static routes now lives in scripts/verify-build.js,
# alongside the assertions that use it.

.PHONY: help install dev dev-admin check check-config check-all fix test test-root \
        test-admin test-infra audit audit-dev scan build build-admin admin-env \
        check-admin-env content-drift verify-build ci synth diff require-alert-email \
        deploy-local staging-diff staging-deploy staging-destroy cost budget alerts clean

help: ## Show this help
	@echo "$(SITE_BUCKET) — make targets"
	@echo ""
	@grep -E '^[a-zA-Z0-9_-]+:.*?## .*$$' $(MAKEFILE_LIST) \
		| awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-14s\033[0m %s\n", $$1, $$2}'
	@echo ""
	@echo "Deploys: push to main and click the manual job in GitLab."
	@echo "Use 'make diff' first — it is read-only and shows exactly what would change."

# --- Setup ---

install: ## Install dependencies in all three workspaces
	npm ci --prefer-offline
	cd admin && npm ci --prefer-offline
	cd infra && npm ci --prefer-offline

# --- Development ---

# Content lives in the Content_Repo now, not this repo, so the dev server has nothing to
# serve under /content until the clone is linked in. link-content symlinks the clone's
# content/ into public/content (gitignored) so the SPA's runtime fetches resolve locally;
# dev depends on it. Override the clone location with CONTENT_REPO=<dir>.
link-content: ## Symlink the Content_Repo clone into public/content for local dev
	@test -d "$(CONTENT_REPO)/content" || { \
		echo "No content clone at $(CONTENT_REPO)/content."; \
		echo "Clone the Content_Repo first:  git clone <content-repo-url> $(CONTENT_REPO)"; \
		echo "or point at an existing clone:  make link-content CONTENT_REPO=<dir>"; \
		exit 1; }
	rm -rf public/content
	ln -s "$(CONTENT_REPO)/content" public/content
	CONTENT_ROOT=public/content node scripts/generate-manifest.js

dev: link-content ## Run the site dev server (links content first)
	npm run dev

dev-admin: ## Run the admin dev server
	cd admin && npm run dev

# --- Quality gates (mirror CI) ---

check: check-config ## Lint, format check, and typecheck the site (matches CI)
	npm run check

check-config: ## Validate site.config.json and assert nothing hardcodes this site
	node scripts/check-site-config.js
	node scripts/check-no-site-strings.js
	node scripts/check-pages.js

check-all: check ## Also typecheck admin and infra
	# Bare `tsc` is correct for these two: both have a plain tsconfig with an `include`.
	# The root needs `tsc -b` because it is `files: []` plus project references — see the
	# `check` script in package.json.
	cd admin && npx tsc --noEmit
	cd infra && npx tsc --noEmit

fix: ## Auto-fix lint and formatting
	npm run fix

test: test-root test-admin test-infra ## Run every test suite (matches CI)

test-root: ## Site tests only
	npm test

test-admin: ## Admin tests only
	cd admin && npm test

test-infra: ## Infra tests only
	cd infra && npm test

audit: ## Production dependency audit — this one gates CI
	npm audit --audit-level=high --omit=dev

audit-dev: ## Advisory audit including dev dependencies (never fails)
	npm audit --audit-level=high || true
	cd admin && (npm audit --audit-level=high || true)
	cd infra && (npm audit --audit-level=high || true)

scan: ## Run the AWS automated-security-helper scan locally
	ash --mode local --no-fail-on-findings

# --- Build ---

build: ## Generate manifests then build the site (order matters — see header)
	CONTENT_ROOT=$(CONTENT_REPO)/content node scripts/generate-manifest.js
	npm run build

build-admin: ## Build the admin SPA (prebuild checks admin/.env.production)
	cd admin && npm run build

admin-env: ## Regenerate admin/.env.production from the deployed stack. Needs AWS creds.
	node scripts/generate-admin-env.js

check-admin-env: ## Assert admin/.env.production matches the deployed stack. Needs AWS creds.
	node scripts/generate-admin-env.js --check

content-drift: ## Compare the Content_Repo clone against content in S3. Needs AWS creds.
	CONTENT_ROOT=$(CONTENT_REPO)/content node scripts/check-content-drift.js

# --- Content_Repo migration (content-storage spec, stage 2) ---
#
# Override the destination with OUT=<dir>. Both targets are local and read-only with
# respect to this repository; neither talks to a remote.

seed-content-repo: ## Build and verify the Content_Repo's first commit in OUT (default ~/<prefix>-content-repo)
	node scripts/seed-content-repo.js $(if $(OUT),--out $(OUT),)

verify-content-seed: ## Re-run the seed checks against an existing directory, writing nothing
	node scripts/seed-content-repo.js $(if $(OUT),--out $(OUT),) --verify-only

# --- Reconcile_Job (content-storage stage 5) ---

# Default clone location, derived from the config prefix rather than hardcoded (same
# convention as seed-content-repo.js). Override with CONTENT_REPO=<dir>.
CONTENT_REPO ?= $(HOME)/$(shell node -p "require('./site.config.json').resourcePrefix")-content-repo

reconcile-local: ## Build the projection from a Content_Repo clone into dist-projection/ (no AWS). CONTENT_REPO=<dir>
	node scripts/reconcile.js --content $(CONTENT_REPO)/content --config site.config.json --out dist-projection

reconcile-sync: ## Copy the Reconcile_Job CI + scripts into the Content_Repo clone. CONTENT_REPO=<dir>
	@test -d "$(CONTENT_REPO)" || { echo "CONTENT_REPO not found: $(CONTENT_REPO)"; exit 1; }
	mkdir -p "$(CONTENT_REPO)/scripts"
	cp content-repo-ci/.gitlab-ci.yml "$(CONTENT_REPO)/.gitlab-ci.yml"
	cp content-repo-ci/gitignore "$(CONTENT_REPO)/.gitignore"
	cp content-repo-ci/package.json "$(CONTENT_REPO)/package.json"
	cp content-repo-ci/README.md "$(CONTENT_REPO)/CI.md"
	cp content-repo-ci/reconcile-role-trust.json content-repo-ci/reconcile-role-policy.json "$(CONTENT_REPO)/"
	cp scripts/build-artifacts.js scripts/reconcile.js "$(CONTENT_REPO)/scripts/"
	cp site.config.json "$(CONTENT_REPO)/site.config.json"
	@echo "--- copied. review and commit in $(CONTENT_REPO):"
	@cd "$(CONTENT_REPO)" && git status --short

verify-build: ## Assert the build produced a complete sitemap, meta pages, and head
	node scripts/verify-build.js

ci: check test audit build verify-build ## Everything CI checks before deploy

# --- Infrastructure ---

staging-diff: ## Show what deploying staging would create (read-only, safe)
	cd infra && npx cdk diff --context staging=true CarnaghanStagingAdmin CarnaghanStagingSite

staging-deploy: build build-admin ## Create/update the staging environment. Costs ~$1-3/month.
	@echo "Staging serves on its CloudFront hostname — no domain, no certificate, no DNS."
	@echo "First deploy: admin sign-in will not work until you redeploy with"
	@echo "  make staging-deploy STAGING_SITE_URL=https://<StagingSite.DistributionDomain>"
	@echo ""
	cd infra && npx cdk deploy --context staging=true \
		$(if $(STAGING_SITE_URL),--context stagingSiteUrl=$(STAGING_SITE_URL),) \
		--require-approval never CarnaghanStagingAdmin CarnaghanStagingSite

staging-destroy: ## Tear down staging. The bucket and pool are RETAIN, so delete those by hand.
	@echo "Note: the site bucket, Cognito pool and audit table have RemovalPolicy.RETAIN,"
	@echo "so CloudFormation leaves them behind. Remove them manually if you want them gone."
	cd infra && npx cdk destroy --context staging=true CarnaghanStagingSite CarnaghanStagingAdmin

synth: ## Synthesise CloudFormation templates
	cd infra && npx cdk synth --quiet

diff: ## Show what a deploy would change (read-only, safe)
	cd infra && npx cdk diff --all --context alertEmail="$(ALERT_EMAIL)"

# Mirrors the CI deploy job's three steps, and depends on both builds first.
#
# The build dependencies are not a convenience: CarnaghanSite's BucketDeployment
# uploads whatever is in dist/, so deploying without building first publishes a
# stale (or half-written) site. And the admin SPA is shipped by the s3 sync below,
# not by CDK, so a cdk-only deploy leaves the admin frontend unchanged — new admin
# behaviour silently fails to appear.
# Listed first among deploy-local's prerequisites so it fails in milliseconds
# rather than after a multi-minute build. Prerequisites run left to right.
require-alert-email:
	@if [ -z "$(ALERT_EMAIL)" ]; then \
		echo "ERROR: ALERT_EMAIL is not set."; \
		echo ""; \
		echo "Deploying without it would DELETE the confirmed SNS alert subscription,"; \
		echo "silently disarming all eight alarms while leaving them reporting OK."; \
		echo ""; \
		echo "  make deploy-local ALERT_EMAIL=you@example.com"; \
		echo ""; \
		echo "Or just push to main and click the manual deploy job, which sets it for you."; \
		exit 1; \
	fi

deploy-local: require-alert-email build verify-build build-admin ## Deploy everything from this machine (prefer CI). Requires ALERT_EMAIL.
	cd infra && npx cdk deploy --all --require-approval never --context alertEmail="$(ALERT_EMAIL)"
	aws s3 sync admin/dist/ s3://$(SITE_BUCKET)/admin/ --delete
	aws cloudfront create-invalidation \
		--distribution-id $$(aws cloudfront list-distributions \
			--query "DistributionList.Items[?Aliases.Items[?contains(@,'$(SITE_DOMAIN)')]].Id" \
			--output text) \
		--paths "/admin/*"

# --- Operations ---

cost: ## Month-to-date spend by service, excluding domain renewals
	@aws ce get-cost-and-usage \
		--time-period Start=$$(date -u +%Y-%m-01),End=$$(date -u -v+1d +%Y-%m-%d) \
		--granularity MONTHLY --metrics UnblendedCost \
		--filter '{"Not":{"Dimensions":{"Key":"SERVICE","Values":["Amazon Registrar"]}}}' \
		--group-by Type=DIMENSION,Key=SERVICE \
		--query 'ResultsByTime[].Groups[].[Keys[0],Metrics.UnblendedCost.Amount]' \
		--output text | sort -t"$$(printf '\t')" -k2 -rn

budget: ## Show budget limits against actual and forecast spend
	@aws budgets describe-budgets --account-id $$(aws sts get-caller-identity --query Account --output text) \
		--query 'Budgets[].[BudgetName,BudgetLimit.Amount,CalculatedSpend.ActualSpend.Amount,CalculatedSpend.ForecastedSpend.Amount]' \
		--output table

alerts: ## Check alarm states and that the alert topic has a confirmed subscriber
	@echo "--- subscriptions (a real ARN means confirmed) ---"
	@aws sns list-subscriptions-by-topic --region $(AWS_REGION) \
		--topic-arn arn:aws:sns:$(AWS_REGION):$$(aws sts get-caller-identity --query Account --output text):$(ALERT_TOPIC_NAME) \
		--query 'Subscriptions[].[Protocol,Endpoint,SubscriptionArn]' --output text
	@echo "--- alarms wired to that topic ---"
	@aws cloudwatch describe-alarms --region $(AWS_REGION) \
		--query "MetricAlarms[?contains(to_string(AlarmActions),'$(ALERT_TOPIC_NAME)')].[AlarmName,StateValue]" \
		--output table

clean: ## Remove build output and CDK staging
	rm -rf dist admin/dist infra/cdk.out
