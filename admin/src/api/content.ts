import type { ApiClient } from "./client";

/**
 * Content types supported by the CMS.
 */
export type ContentType = "posts" | "knowledge-base";

/**
 * Represents a content item (blog post or knowledge base article).
 */
export interface ContentItem {
  slug: string;
  type: ContentType;
  title: string;
  date: string;
  description?: string;
  author?: string;
  categories: string[];
  tags: string[];
  draft: boolean;
  body?: string;
  images: string[];
  /**
   * S3 `LastModified`, used as the optimistic-concurrency token on save. Not a
   * meaningful edit time: a site deploy rewrites every content object and resets
   * this for all of them. Use `modified` for display.
   */
  lastModified: string;
  /**
   * Last edit time (ISO timestamp), stamped server-side on save and stored in
   * frontmatter so it survives deploys. Absent on content that has not been edited
   * through the admin, in which case fall back to `date`.
   */
  modified?: string;
}

/**
 * Data payload for creating or updating a content item.
 * Omits server-managed fields (slug on create, type, images, lastModified).
 */
export interface ContentSaveData {
  title: string;
  date: string;
  description?: string;
  author?: string;
  categories: string[];
  tags: string[];
  draft: boolean;
  body: string;
  /** Last-known S3 lastModified, sent on updates for optimistic concurrency. */
  lastModified?: string;
}

/**
 * List all content items of a given type.
 * Returns items without body content for efficient listing.
 */
export function listContent(client: ApiClient, type: ContentType): Promise<ContentItem[]> {
  return client.get<ContentItem[]>(`/content/${type}`);
}

// --- Client-side list cache ---
//
// The list endpoint reads every content file, so it's expensive. Cache the
// result per type in memory so navigating around the admin (list <-> editor <->
// dashboard) doesn't refetch. The cache lives for the SPA session (cleared on a
// full page reload) and is invalidated on any create/update/delete.

interface ListCacheEntry {
  data: ContentItem[];
  timestamp: number;
}

const listCache: Partial<Record<ContentType, ListCacheEntry>> = {};
const LIST_CACHE_TTL_MS = 5 * 60 * 1000;

/**
 * Like listContent, but returns a cached result when one is fresh.
 */
export async function listContentCached(
  client: ApiClient,
  type: ContentType
): Promise<ContentItem[]> {
  const entry = listCache[type];
  if (entry && Date.now() - entry.timestamp < LIST_CACHE_TTL_MS) {
    return entry.data;
  }
  const data = await listContent(client, type);
  listCache[type] = { data, timestamp: Date.now() };
  return data;
}

/**
 * Invalidate the cached list. Call after any mutation so the next read is fresh.
 * Pass a type to clear just that list, or nothing to clear all.
 */
export function invalidateContentCache(type?: ContentType): void {
  if (type) {
    delete listCache[type];
  } else {
    delete listCache.posts;
    delete listCache["knowledge-base"];
  }
}

/**
 * Get a single content item by type and slug.
 * Returns the full item including body content.
 */
export function getContent(
  client: ApiClient,
  type: ContentType,
  slug: string
): Promise<ContentItem> {
  return client.get<ContentItem>(`/content/${type}/${slug}`);
}

/**
 * Save a content item. If slug is provided, updates the existing item.
 * If slug is null or undefined, creates a new item (slug generated from title).
 */
export function saveContent(
  client: ApiClient,
  type: ContentType,
  slug: string | null | undefined,
  data: ContentSaveData
): Promise<ContentItem> {
  if (slug) {
    return client.put<ContentItem>(`/content/${type}/${slug}`, data);
  }
  return client.put<ContentItem>(`/content/${type}`, data);
}

/**
 * Delete a content item and all associated files (images, etc.).
 */
export function deleteContent(client: ApiClient, type: ContentType, slug: string): Promise<void> {
  return client.delete<void>(`/content/${type}/${slug}`);
}

/**
 * A commit in a post's revision history.
 */
export interface Revision {
  id: string;
  shortId: string;
  createdAt: string;
  message: string;
  authorName: string;
}

/**
 * List the git revision history for a content item (most recent first).
 */
export function getRevisions(
  client: ApiClient,
  type: ContentType,
  slug: string
): Promise<Revision[]> {
  return client.get<Revision[]>(`/content/${type}/${slug}/revisions`);
}

/**
 * Restore a content item to a previous revision (by commit SHA).
 */
export function restoreRevision(
  client: ApiClient,
  type: ContentType,
  slug: string,
  sha: string
): Promise<ContentItem> {
  return client.post<ContentItem>(`/content/${type}/${slug}/restore`, { sha });
}
