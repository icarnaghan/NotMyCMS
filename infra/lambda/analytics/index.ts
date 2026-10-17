import {
  S3Client,
  ListObjectsV2Command,
  GetObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { gunzipSync } from "zlib";
import * as crypto from "crypto";
import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from "aws-lambda";

const s3 = new S3Client({});
const LOGS_BUCKET = process.env.LOGS_BUCKET!;

// Per-day aggregated rollups live here so the endpoint doesn't reparse raw
// logs for completed days.
const ROLLUP_PREFIX = "analytics/daily/";

/**
 * A per-day aggregation of the CloudFront logs. Stored as
 * analytics/daily/YYYY-MM-DD.json. Full page/referrer maps are kept (not just
 * the top N) so range-level top lists merge accurately across days.
 */
interface DailyRollup {
  date: string;
  pageViews: number;
  uniqueVisitors: number;
  bandwidth: number;
  pages: Record<string, number>;
  referrers: Record<string, number>;
}

// --- Types ---

interface AnalyticsResponse {
  dateRange: { start: string; end: string };
  summary: {
    pageViews: number;
    uniqueVisitors: number;
    bandwidth: number;
  };
  dailyViews: Array<{ date: string; views: number }>;
  topPages: Array<{ path: string; views: number }>;
  topReferrers: Array<{ domain: string; count: number }>;
}

interface ApiError {
  code: string;
  message: string;
  path?: string;
  correlationId: string;
}

interface ParsedLogEntry {
  date: string;
  bytes: number;
  ip: string;
  uriStem: string;
  referrer: string;
}

// --- Utility Functions ---

function errorResponse(
  statusCode: number,
  code: string,
  message: string,
  path?: string
): APIGatewayProxyResultV2 {
  const error: ApiError = {
    code,
    message,
    path,
    correlationId: crypto.randomUUID(),
  };
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

/**
 * Validate a date string in YYYY-MM-DD format.
 */
export function isValidDate(dateStr: string): boolean {
  const regex = /^\d{4}-\d{2}-\d{2}$/;
  if (!regex.test(dateStr)) return false;
  const date = new Date(dateStr + "T00:00:00Z");
  return !isNaN(date.getTime()) && date.toISOString().startsWith(dateStr);
}

/**
 * Check if a log file key matches the given date range.
 * CloudFront log file names contain the date: {distribution-id}.YYYY-MM-DD-HH.{unique-id}.gz
 */
export function isLogFileInRange(key: string, startDate: string, endDate: string): boolean {
  const dateMatch = key.match(/\.(\d{4}-\d{2}-\d{2})-\d{2}\./);
  if (!dateMatch) return false;
  const fileDate = dateMatch[1];
  return fileDate >= startDate && fileDate <= endDate;
}

/**
 * Parse a single line of a CloudFront access log (tab-separated).
 * Fields: date, time, x-edge-location, sc-bytes, c-ip, cs-method,
 *         cs(Host), cs-uri-stem, sc-status, cs(Referer), cs(User-Agent), ...
 */
export function parseLogLine(line: string): ParsedLogEntry | null {
  // Skip comment lines
  if (line.startsWith("#")) return null;

  const fields = line.split("\t");
  // Need at least 10 fields for the data we care about
  if (fields.length < 10) return null;

  const date = fields[0];
  const bytes = parseInt(fields[3], 10);
  const ip = fields[4];
  const uriStem = fields[7];
  const referrer = fields[9];

  // Skip invalid entries
  if (!date || isNaN(bytes) || !ip || !uriStem) return null;

  return {
    date,
    bytes: bytes || 0,
    ip,
    uriStem,
    referrer: referrer || "-",
  };
}

/**
 * Extract the domain from a referrer URL.
 * Returns "-" for direct traffic or invalid referrers.
 */
export function extractReferrerDomain(referrer: string): string {
  if (!referrer || referrer === "-") return "-";
  try {
    const url = new URL(referrer);
    return url.hostname;
  } catch {
    return "-";
  }
}

/**
 * List all log file keys in the S3 bucket that match the date range.
 */
async function listLogFiles(startDate: string, endDate: string): Promise<string[]> {
  const logKeys: string[] = [];
  let continuationToken: string | undefined;

  do {
    const command = new ListObjectsV2Command({
      Bucket: LOGS_BUCKET,
      Prefix: "cf-logs/",
      ContinuationToken: continuationToken,
    });
    const response = await s3.send(command);

    if (response.Contents) {
      for (const obj of response.Contents) {
        if (obj.Key && obj.Key.endsWith(".gz") && isLogFileInRange(obj.Key, startDate, endDate)) {
          logKeys.push(obj.Key);
        }
      }
    }

    continuationToken = response.NextContinuationToken;
  } while (continuationToken);

  return logKeys;
}

/**
 * Download and decompress a gzipped log file from S3, returning parsed entries.
 */
async function downloadAndParseLogFile(key: string): Promise<ParsedLogEntry[]> {
  const command = new GetObjectCommand({ Bucket: LOGS_BUCKET, Key: key });
  const response = await s3.send(command);
  const compressedData = await response.Body!.transformToByteArray();
  const decompressed = gunzipSync(Buffer.from(compressedData));
  const content = decompressed.toString("utf-8");

  const entries: ParsedLogEntry[] = [];
  const lines = content.split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const entry = parseLogLine(trimmed);
    if (entry) {
      entries.push(entry);
    }
  }

  return entries;
}

/**
 * Aggregate parsed log entries into analytics metrics.
 */
export function aggregateMetrics(
  entries: ParsedLogEntry[],
  startDate: string,
  endDate: string
): AnalyticsResponse {
  const uniqueIPs = new Set<string>();
  let totalPageViews = 0;
  let totalBandwidth = 0;

  const dailyViewsMap = new Map<string, number>();
  const pageViewsMap = new Map<string, number>();
  const referrerMap = new Map<string, number>();

  for (const entry of entries) {
    // Filter entries to the date range
    if (entry.date < startDate || entry.date > endDate) continue;

    totalPageViews++;
    totalBandwidth += entry.bytes;
    uniqueIPs.add(entry.ip);

    // Daily views
    const currentCount = dailyViewsMap.get(entry.date) || 0;
    dailyViewsMap.set(entry.date, currentCount + 1);

    // Page views
    const pageCount = pageViewsMap.get(entry.uriStem) || 0;
    pageViewsMap.set(entry.uriStem, pageCount + 1);

    // Referrers
    const domain = extractReferrerDomain(entry.referrer);
    if (domain !== "-") {
      const refCount = referrerMap.get(domain) || 0;
      referrerMap.set(domain, refCount + 1);
    }
  }

  // Build daily views sorted by date
  const dailyViews = Array.from(dailyViewsMap.entries())
    .map(([date, views]) => ({ date, views }))
    .sort((a, b) => a.date.localeCompare(b.date));

  // Build top pages sorted by views descending, limit to top 20
  const topPages = Array.from(pageViewsMap.entries())
    .map(([path, views]) => ({ path, views }))
    .sort((a, b) => b.views - a.views)
    .slice(0, 20);

  // Build top referrers sorted by count descending, limit to top 20
  const topReferrers = Array.from(referrerMap.entries())
    .map(([domain, count]) => ({ domain, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 20);

  return {
    dateRange: { start: startDate, end: endDate },
    summary: {
      pageViews: totalPageViews,
      uniqueVisitors: uniqueIPs.size,
      bandwidth: totalBandwidth,
    },
    dailyViews,
    topPages,
    topReferrers,
  };
}

// --- Daily Rollups ---

/** Load and parse all log entries for a single day. */
async function loadDayEntries(date: string): Promise<ParsedLogEntry[]> {
  const logKeys = await listLogFiles(date, date);
  const entries: ParsedLogEntry[] = [];
  const BATCH_SIZE = 10;
  for (let i = 0; i < logKeys.length; i += BATCH_SIZE) {
    const batch = logKeys.slice(i, i + BATCH_SIZE);
    const results = await Promise.all(batch.map((key) => downloadAndParseLogFile(key)));
    for (const e of results) entries.push(...e);
  }
  return entries;
}

/** Aggregate a single day's raw logs into a rollup (full page/referrer maps). */
async function aggregateDayRollup(date: string): Promise<DailyRollup> {
  const entries = await loadDayEntries(date);
  const uniqueIPs = new Set<string>();
  const pages: Record<string, number> = {};
  const referrers: Record<string, number> = {};
  let pageViews = 0;
  let bandwidth = 0;

  for (const entry of entries) {
    if (entry.date !== date) continue;
    pageViews++;
    bandwidth += entry.bytes;
    uniqueIPs.add(entry.ip);
    pages[entry.uriStem] = (pages[entry.uriStem] || 0) + 1;
    const domain = extractReferrerDomain(entry.referrer);
    if (domain !== "-") referrers[domain] = (referrers[domain] || 0) + 1;
  }

  return { date, pageViews, uniqueVisitors: uniqueIPs.size, bandwidth, pages, referrers };
}

async function readRollup(date: string): Promise<DailyRollup | null> {
  try {
    const response = await s3.send(
      new GetObjectCommand({ Bucket: LOGS_BUCKET, Key: `${ROLLUP_PREFIX}${date}.json` })
    );
    const content = await response.Body!.transformToString();
    return JSON.parse(content) as DailyRollup;
  } catch (err: unknown) {
    if (
      err &&
      typeof err === "object" &&
      "name" in err &&
      (err as { name: string }).name === "NoSuchKey"
    ) {
      return null;
    }
    throw err;
  }
}

async function writeRollup(rollup: DailyRollup): Promise<void> {
  await s3.send(
    new PutObjectCommand({
      Bucket: LOGS_BUCKET,
      Key: `${ROLLUP_PREFIX}${rollup.date}.json`,
      Body: JSON.stringify(rollup),
      ContentType: "application/json",
    })
  );
}

/**
 * Get a day's rollup. Completed days are served from the cached rollup
 * (aggregating and persisting it on first request). The current, incomplete
 * day is always computed fresh and never cached.
 */
async function getDayRollup(date: string, today: string): Promise<DailyRollup> {
  if (date >= today) {
    return aggregateDayRollup(date);
  }
  const cached = await readRollup(date);
  if (cached) return cached;

  const fresh = await aggregateDayRollup(date);
  try {
    await writeRollup(fresh);
  } catch (err) {
    console.error(`Failed to persist rollup for ${date}:`, err);
  }
  return fresh;
}

// --- Date helpers ---

function utcToday(): string {
  return new Date().toISOString().slice(0, 10);
}

function addDays(date: string, delta: number): string {
  const d = new Date(date + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

function enumerateDates(start: string, end: string): string[] {
  const dates: string[] = [];
  let cur = start;
  while (cur <= end) {
    dates.push(cur);
    cur = addDays(cur, 1);
  }
  return dates;
}

/**
 * Merge per-day rollups into the API response. Note: uniqueVisitors is the sum
 * of per-day unique counts, which over-counts visitors active on multiple days
 * (accurate cross-day de-duplication would require storing per-day visitor sets).
 */
function buildResponse(
  rollups: DailyRollup[],
  startDate: string,
  endDate: string
): AnalyticsResponse {
  let pageViews = 0;
  let bandwidth = 0;
  let uniqueVisitors = 0;
  const pages = new Map<string, number>();
  const referrers = new Map<string, number>();
  const dailyViews: Array<{ date: string; views: number }> = [];

  for (const r of rollups) {
    pageViews += r.pageViews;
    bandwidth += r.bandwidth;
    uniqueVisitors += r.uniqueVisitors;
    dailyViews.push({ date: r.date, views: r.pageViews });
    for (const [p, v] of Object.entries(r.pages)) pages.set(p, (pages.get(p) || 0) + v);
    for (const [d, c] of Object.entries(r.referrers)) referrers.set(d, (referrers.get(d) || 0) + c);
  }

  dailyViews.sort((a, b) => a.date.localeCompare(b.date));
  const topPages = Array.from(pages.entries())
    .map(([path, views]) => ({ path, views }))
    .sort((a, b) => b.views - a.views)
    .slice(0, 20);
  const topReferrers = Array.from(referrers.entries())
    .map(([domain, count]) => ({ domain, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 20);

  return {
    dateRange: { start: startDate, end: endDate },
    summary: { pageViews, uniqueVisitors, bandwidth },
    dailyViews,
    topPages,
    topReferrers,
  };
}

/**
 * Scheduled (EventBridge) task: re-aggregate the last few completed days to
 * catch late-arriving logs and pre-warm rollups for the common views.
 */
async function runScheduledAggregation(): Promise<void> {
  const today = utcToday();
  for (let i = 1; i <= 3; i++) {
    const date = addDays(today, -i);
    try {
      const rollup = await aggregateDayRollup(date);
      await writeRollup(rollup);
      console.log(`Aggregated rollup for ${date}: ${rollup.pageViews} views`);
    } catch (err) {
      console.error(`Failed to aggregate ${date}:`, err);
    }
  }
}

// --- Handler ---

type ScheduledEvent = { source?: string; "detail-type"?: string };

export async function handler(
  event: APIGatewayProxyEventV2 | ScheduledEvent
): Promise<APIGatewayProxyResultV2 | void> {
  // EventBridge scheduled invocation (no HTTP request context).
  if (!("requestContext" in event)) {
    await runScheduledAggregation();
    return;
  }

  const apiEvent = event as APIGatewayProxyEventV2;
  try {
    const method = apiEvent.requestContext.http.method;

    if (method !== "GET") {
      return errorResponse(405, "METHOD_NOT_ALLOWED", `Method ${method} not allowed`);
    }

    const queryParams = apiEvent.queryStringParameters || {};
    const startDate = queryParams.start;
    const endDate = queryParams.end;

    if (!startDate || !endDate) {
      return errorResponse(
        400,
        "VALIDATION_ERROR",
        "Both 'start' and 'end' query parameters are required (format: YYYY-MM-DD)"
      );
    }
    if (!isValidDate(startDate)) {
      return errorResponse(
        400,
        "VALIDATION_ERROR",
        `Invalid start date format: ${startDate}. Expected YYYY-MM-DD`
      );
    }
    if (!isValidDate(endDate)) {
      return errorResponse(
        400,
        "VALIDATION_ERROR",
        `Invalid end date format: ${endDate}. Expected YYYY-MM-DD`
      );
    }
    if (startDate > endDate) {
      return errorResponse(400, "VALIDATION_ERROR", "Start date must not be after end date");
    }

    // Build the response from per-day rollups (cached for completed days,
    // computed fresh for today), fetched with limited concurrency.
    const today = utcToday();
    const dates = enumerateDates(startDate, endDate);
    const rollups: DailyRollup[] = [];
    const CONCURRENCY = 10;
    for (let i = 0; i < dates.length; i += CONCURRENCY) {
      const batch = dates.slice(i, i + CONCURRENCY);
      const results = await Promise.all(batch.map((d) => getDayRollup(d, today)));
      rollups.push(...results);
    }

    const analytics = buildResponse(rollups, startDate, endDate);
    return jsonResponse(200, analytics);
  } catch (err: unknown) {
    console.error("Unhandled error:", err);
    return errorResponse(500, "INTERNAL_ERROR", "An unexpected error occurred", apiEvent.rawPath);
  }
}
