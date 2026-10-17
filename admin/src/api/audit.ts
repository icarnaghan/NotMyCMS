import type { ApiClient } from "./client";

/**
 * A single audit-log entry describing an admin mutation.
 */
export interface AuditEntry {
  timestamp: string;
  action: string;
  resource: string;
  user: string;
  detail?: string;
  /** Whether the change was mirrored to git (undefined when not applicable). */
  gitMirrored?: boolean;
  gitError?: string;
}

/**
 * Fetch recent audit-log entries (most recent first).
 */
export function getAuditLog(client: ApiClient, limit = 100): Promise<AuditEntry[]> {
  return client.get<AuditEntry[]>(`/audit?limit=${limit}`);
}
