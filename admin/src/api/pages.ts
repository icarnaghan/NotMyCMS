import type { ApiClient } from "./client";

/**
 * Landing-page types for the admin editor (landing-page-editor stage 5).
 *
 * These mirror the `LandingPage` schema in the site repo's `src/lib/page-schema.d.ts`.
 * They are redeclared here rather than imported because the admin is a separate package;
 * the server-side validator (`scripts/validate-page.js`, shared with the build) is the
 * single source of truth for the rules, and a save is rejected with field-level messages
 * if the payload is wrong, so these types are an editing convenience, not the contract.
 */

export type Tone = "active" | "neutral" | "muted";

export interface InternalLink {
  to: string;
  href?: never;
}
export interface ExternalLink {
  href: string;
  to?: never;
}
export type Link = InternalLink | ExternalLink;
export type Action = Link & { label: string; primary?: boolean };

export interface Breadcrumb {
  text: string;
  to?: string;
}

interface BlockBase {
  id: string;
  version: 1;
}

export type ProseBlock = BlockBase & {
  type: "prose";
  title?: string;
  markdown: string;
  muted?: boolean;
};

export interface CardItem {
  id: string;
  badge?: { text: string; tagFilter?: string };
  title: string;
  titleLink?: Link;
  meta?: string;
  description?: string;
  tags?: string[];
  actions?: Action[];
}

export type CardGridBlock = BlockBase & {
  type: "card-grid";
  title?: string;
  tone?: Tone;
  columns?: 1 | 2 | 3;
  emptyText?: string;
  items: CardItem[];
};

export type ColumnsBlock = BlockBase & {
  type: "columns";
  columns: { title: string; markdown: string }[];
};

export type BadgeListBlock = BlockBase & {
  type: "badge-list";
  title?: string;
  tone?: Tone;
  items: string[];
};

export type PanelBlock = BlockBase & {
  type: "panel";
  title?: string;
  lead?: string;
  markdown: string;
};

export type SocialLinksBlock = BlockBase & {
  type: "social-links";
  title?: string;
};

export type Block =
  ProseBlock | CardGridBlock | ColumnsBlock | BadgeListBlock | PanelBlock | SocialLinksBlock;

export type BlockType = Block["type"];

/** The block types the editor can create, in the order they appear in the "add" menu. */
export const BLOCK_TYPES: BlockType[] = [
  "prose",
  "card-grid",
  "columns",
  "badge-list",
  "panel",
  "social-links",
];

export interface LandingPage {
  schemaVersion: 1;
  slug: string;
  nav?: { label: string; order: number };
  seo: { title: string; description: string };
  header: { title: string; description?: string; divider?: boolean };
  breadcrumbs?: Breadcrumb[];
  blocks: Block[];
  /** Server-managed edit time. Read-only in the editor. */
  modified?: string;
}

/** A landing page as returned by GET /api/pages/{slug}: the doc plus its concurrency token. */
export interface LandingPageWithToken extends LandingPage {
  /**
   * S3 `LastModified`, the optimistic-concurrency token sent back on save. Not a
   * meaningful edit time — a reconcile or deploy can reset it; use `modified` for display.
   */
  lastModified: string;
}

/** The manifest-shaped summary returned by GET /api/pages (the list view). */
export interface PageSummary {
  slug: string;
  nav?: { label: string; order: number };
  seo: { title: string; description: string };
}

/** List every landing page (summary only). */
export function listPages(client: ApiClient): Promise<PageSummary[]> {
  return client.get<PageSummary[]>("/pages");
}

/** Get one landing page's full document by slug (which may contain slashes). */
export function getPage(client: ApiClient, slug: string): Promise<LandingPageWithToken> {
  return client.get<LandingPageWithToken>(`/pages/${slug}`);
}

/**
 * Save a landing page. On create (no existing slug) the slug is taken from the payload
 * and PUT /pages is used; on update PUT /pages/{slug}. Pass `lastModified` on an update
 * for optimistic concurrency.
 */
export function savePage(
  client: ApiClient,
  slug: string | null | undefined,
  page: LandingPage & { lastModified?: string }
): Promise<LandingPageWithToken> {
  if (slug) {
    return client.put<LandingPageWithToken>(`/pages/${slug}`, page);
  }
  return client.put<LandingPageWithToken>("/pages", page);
}

/** Delete a landing page and all its objects. */
export function deletePage(client: ApiClient, slug: string): Promise<void> {
  return client.delete<void>(`/pages/${slug}`);
}
