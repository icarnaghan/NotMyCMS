/**
 * Shared audit-log helper. Records admin mutations (who/what/when) to a
 * DynamoDB table so the admin can show an activity trail and surface failed
 * git mirrors. Best-effort: never throws — an audit failure must not fail the
 * underlying operation.
 *
 * Env:
 *   - AUDIT_TABLE : DynamoDB table name (single partition, sorted by time)
 */
import * as crypto from "crypto";
import type { APIGatewayProxyEventV2 } from "aws-lambda";

const AUDIT_TABLE = process.env.AUDIT_TABLE || "";

// All entries share one partition so recent activity is a single sorted query.
export const AUDIT_PARTITION = "AUDIT";

export interface AuditEntry {
  /** e.g. "content.update", "media.upload", "taxonomy.rename", "deploy.trigger" */
  action: string;
  /** e.g. "posts/my-slug" or a taxonomy name */
  resource: string;
  /** who performed it (email / username / sub) */
  user: string;
  /** optional human-readable detail */
  detail?: string;
}

// The `gitMirrored` / `gitError` fields were retired when commits became blocking
// (content-storage stage 4): a save that fails to commit now fails outright and never
// reaches this writer, so there is no mirror status left to record per entry. New
// entries omit them; the read path still surfaces them so historical records written
// under the best-effort regime keep rendering their "Git" column.

/**
 * Extract the acting user from the Cognito JWT claims attached by the API
 * Gateway authorizer. Falls back to "unknown".
 */
export function getActor(event: APIGatewayProxyEventV2): string {
  const ctx = event.requestContext as unknown as {
    authorizer?: { jwt?: { claims?: Record<string, unknown> } };
  };
  const claims = ctx.authorizer?.jwt?.claims ?? {};
  return String(claims.email || claims["cognito:username"] || claims.sub || "unknown");
}

/**
 * Write an audit entry. Best-effort — logs and swallows any error. The AWS SDK
 * is imported lazily so the module loads in tests without the package present.
 */
export async function writeAudit(entry: AuditEntry): Promise<void> {
  if (!AUDIT_TABLE) return;

  try {
    const { DynamoDBClient, PutItemCommand } = await import("@aws-sdk/client-dynamodb");
    const client = new DynamoDBClient({});

    const now = new Date().toISOString();
    const sortKey = `${now}#${crypto.randomUUID()}`;

    const item: Record<string, { S: string } | { BOOL: boolean }> = {
      pk: { S: AUDIT_PARTITION },
      sk: { S: sortKey },
      timestamp: { S: now },
      action: { S: entry.action },
      resource: { S: entry.resource },
      user: { S: entry.user },
    };
    if (entry.detail !== undefined) item.detail = { S: entry.detail };

    await client.send(new PutItemCommand({ TableName: AUDIT_TABLE, Item: item }));
  } catch (err) {
    console.error("Failed to write audit entry:", err);
  }
}
