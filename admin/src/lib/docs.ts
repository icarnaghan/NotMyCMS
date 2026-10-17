/**
 * Where the admin's help links point.
 *
 * The admin doesn't duplicate the project docs — it links out to the markdown in the
 * repository's `docs/` directory (and a few top-level files), rendered by the git host.
 * Keeping the base URL and the link registry here, in one module, means:
 *   - the Help page and the inline config hints share one source of truth for URLs;
 *   - a framework consumer (notmycms) overrides `DOCS_BASE_URL` in one place rather than
 *     hunting hardcoded links through components.
 *
 * The base URL comes from `site.config.json` (`docsBaseUrl`) rather than being hardcoded:
 * it is deployment-specific (which repository hosts the docs), so a framework consumer
 * sets its own, and hardcoding this site's repo would also trip the no-site-strings
 * guard. When it is unset, the Help page simply shows no outbound links.
 */
import { siteConfig } from "./site-config";

/** Base for repository-hosted docs, e.g. a GitLab repo's `/-/blob/main`. "" when unset. */
export const DOCS_BASE_URL = siteConfig.docsBaseUrl ?? "";

/** A documentation destination. `path` is relative to the repository root. */
export interface DocLink {
  readonly label: string;
  readonly path: string;
  readonly description: string;
}

/**
 * The docs the admin links to. Each `path` must exist in the repository — a test
 * (`docs.test.ts`) asserts that, so a renamed or deleted doc fails CI rather than
 * shipping a dead "Help" link.
 */
export const DOCS = {
  setup: {
    label: "Setup",
    path: "docs/setup.md",
    description: "Standing the whole thing up from scratch: repos, credentials, local dev.",
  },
  developerGuide: {
    label: "Developer Guide",
    path: "docs/developer-guide.md",
    description: "Day-to-day development, adding content, project conventions.",
  },
  architecture: {
    label: "Architecture",
    path: "docs/architecture.md",
    description: "System design, data flow, how content and config are stored.",
  },
  cicd: {
    label: "CI/CD & Deploying",
    path: "docs/ci-cd.md",
    description: "The pipeline, security scanning, and how a change goes live.",
  },
  readme: {
    label: "Project README",
    path: "README.md",
    description: "Overview, tech stack, and the full documentation index.",
  },
} as const satisfies Record<string, DocLink>;

/** Whether a docs base URL is configured. When false, the Help UI omits outbound links. */
export const DOCS_CONFIGURED = DOCS_BASE_URL !== "";

/** The absolute URL for a doc link, or null when no docs base URL is configured. */
export function docUrl(link: DocLink): string | null {
  return DOCS_CONFIGURED ? `${DOCS_BASE_URL}/${link.path}` : null;
}
