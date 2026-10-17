import type { ApiClient } from "./client";
import type { ContentType } from "./content";

/**
 * An image stored for a content item.
 */
export interface MediaItem {
  filename: string;
  /** Relative path for markdown, e.g. "images/diagram.png". */
  path: string;
  size: number;
  lastModified: string;
}

/**
 * List the images uploaded for a content item.
 */
export function listMedia(
  client: ApiClient,
  type: ContentType,
  slug: string
): Promise<MediaItem[]> {
  return client.get<MediaItem[]>(`/media/${type}/${slug}`);
}

/**
 * Delete an image from a content item (also removed from git).
 */
export function deleteMedia(
  client: ApiClient,
  type: ContentType,
  slug: string,
  filename: string
): Promise<void> {
  return client.delete<void>(`/media/${type}/${slug}/${encodeURIComponent(filename)}`);
}
