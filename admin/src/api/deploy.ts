import type { ApiClient } from "./client";

/**
 * Deployment status returned by the deploy API.
 */
export interface DeployStatus {
  status: "idle" | "building" | "deploying" | "success" | "failed";
  startedAt?: string;
  completedAt?: string;
  error?: string;
  buildId?: string;
}

/**
 * Trigger a new site deployment.
 * Initiates the manifest generation, Vite build, S3 upload, and CloudFront invalidation.
 */
export function triggerDeploy(client: ApiClient): Promise<DeployStatus> {
  return client.post<DeployStatus>("/deploy");
}

/**
 * Get the current or most recent deployment status.
 */
export function getDeployStatus(client: ApiClient): Promise<DeployStatus> {
  return client.get<DeployStatus>("/deploy/status");
}

/**
 * A single completed deployment recorded in the deploy history.
 */
export interface DeployHistoryEntry {
  status: "success" | "failed";
  startedAt?: string;
  completedAt: string;
  durationMs?: number;
  postCount?: number;
  kbCount?: number;
  error?: string;
  triggeredBy?: string;
}

/**
 * Get the recent deployment history (newest first).
 */
export function getDeployHistory(client: ApiClient): Promise<DeployHistoryEntry[]> {
  return client.get<DeployHistoryEntry[]>("/deploy/history");
}
