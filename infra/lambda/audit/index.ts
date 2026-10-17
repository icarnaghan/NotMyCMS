/**
 * Audit query Lambda. Serves GET /api/audit — returns recent admin activity
 * (most recent first) from the DynamoDB audit table.
 */
import { DynamoDBClient, QueryCommand } from "@aws-sdk/client-dynamodb";
import * as crypto from "crypto";
import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from "aws-lambda";

const dynamodb = new DynamoDBClient({});
const AUDIT_TABLE = process.env.AUDIT_TABLE!;
const AUDIT_PARTITION = "AUDIT";
const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;

interface AuditRecord {
  timestamp: string;
  action: string;
  resource: string;
  user: string;
  detail?: string;
  gitMirrored?: boolean;
  gitError?: string;
}

interface ApiError {
  code: string;
  message: string;
  path?: string;
  correlationId: string;
}

function errorResponse(statusCode: number, code: string, message: string): APIGatewayProxyResultV2 {
  const error: ApiError = { code, message, correlationId: crypto.randomUUID() };
  return {
    statusCode,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(error),
  };
}

function jsonResponse(statusCode: number, data: unknown): APIGatewayProxyResultV2 {
  return {
    statusCode,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  };
}

export async function handler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  try {
    if (event.requestContext.http.method !== "GET") {
      return errorResponse(405, "METHOD_NOT_ALLOWED", "Only GET is supported");
    }

    const limitParam = parseInt(event.queryStringParameters?.limit ?? "", 10);
    const limit = Math.min(
      Number.isNaN(limitParam) ? DEFAULT_LIMIT : Math.max(1, limitParam),
      MAX_LIMIT
    );

    const response = await dynamodb.send(
      new QueryCommand({
        TableName: AUDIT_TABLE,
        KeyConditionExpression: "pk = :pk",
        ExpressionAttributeValues: { ":pk": { S: AUDIT_PARTITION } },
        ScanIndexForward: false, // most recent first
        Limit: limit,
      })
    );

    const items: AuditRecord[] = (response.Items ?? []).map((item) => ({
      timestamp: item.timestamp?.S ?? "",
      action: item.action?.S ?? "",
      resource: item.resource?.S ?? "",
      user: item.user?.S ?? "",
      detail: item.detail?.S,
      gitMirrored: item.gitMirrored?.BOOL,
      gitError: item.gitError?.S,
    }));

    return jsonResponse(200, items);
  } catch (err: unknown) {
    console.error("Unhandled error:", err);
    return errorResponse(500, "INTERNAL_ERROR", "An unexpected error occurred");
  }
}
