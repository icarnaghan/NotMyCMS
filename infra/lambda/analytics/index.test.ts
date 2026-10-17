import { describe, it, expect } from "vitest";
import {
  isValidDate,
  isLogFileInRange,
  parseLogLine,
  extractReferrerDomain,
  aggregateMetrics,
} from "./index";

describe("isValidDate", () => {
  it("returns true for valid YYYY-MM-DD dates", () => {
    expect(isValidDate("2024-01-15")).toBe(true);
    expect(isValidDate("2023-12-31")).toBe(true);
    expect(isValidDate("2024-02-29")).toBe(true); // Leap year
  });

  it("returns false for invalid date formats", () => {
    expect(isValidDate("2024-1-15")).toBe(false);
    expect(isValidDate("24-01-15")).toBe(false);
    expect(isValidDate("2024/01/15")).toBe(false);
    expect(isValidDate("not-a-date")).toBe(false);
    expect(isValidDate("")).toBe(false);
  });

  it("returns false for invalid dates", () => {
    expect(isValidDate("2023-02-29")).toBe(false); // Not a leap year
    expect(isValidDate("2024-13-01")).toBe(false);
    expect(isValidDate("2024-00-01")).toBe(false);
  });
});

describe("isLogFileInRange", () => {
  it("returns true for log files within the date range", () => {
    expect(
      isLogFileInRange("E1ABC2DEF.2024-01-15-08.abcdef12.gz", "2024-01-01", "2024-01-31")
    ).toBe(true);
  });

  it("returns true for log files on boundary dates", () => {
    expect(
      isLogFileInRange("E1ABC2DEF.2024-01-01-00.abcdef12.gz", "2024-01-01", "2024-01-31")
    ).toBe(true);
    expect(
      isLogFileInRange("E1ABC2DEF.2024-01-31-23.abcdef12.gz", "2024-01-01", "2024-01-31")
    ).toBe(true);
  });

  it("returns false for log files outside the date range", () => {
    expect(
      isLogFileInRange("E1ABC2DEF.2024-02-01-08.abcdef12.gz", "2024-01-01", "2024-01-31")
    ).toBe(false);
    expect(
      isLogFileInRange("E1ABC2DEF.2023-12-31-23.abcdef12.gz", "2024-01-01", "2024-01-31")
    ).toBe(false);
  });

  it("returns false for keys that don't match the log file pattern", () => {
    expect(isLogFileInRange("somefile.txt", "2024-01-01", "2024-01-31")).toBe(false);
    expect(isLogFileInRange("logs/data.json", "2024-01-01", "2024-01-31")).toBe(false);
  });

  it("handles log files in subdirectories", () => {
    expect(
      isLogFileInRange("logs/E1ABC2DEF.2024-01-15-08.abcdef12.gz", "2024-01-01", "2024-01-31")
    ).toBe(true);
  });
});

describe("parseLogLine", () => {
  it("parses a valid CloudFront log line", () => {
    const line =
      "2024-01-15\t10:30:45\tSEA19-C2\t1234\t192.168.1.1\tGET\twww.example.com\t/blog/my-post\t200\thttps://google.com/\tMozilla/5.0";
    const entry = parseLogLine(line);
    expect(entry).toEqual({
      date: "2024-01-15",
      bytes: 1234,
      ip: "192.168.1.1",
      uriStem: "/blog/my-post",
      referrer: "https://google.com/",
    });
  });

  it("returns null for comment lines", () => {
    expect(parseLogLine("#Version: 1.0")).toBeNull();
    expect(parseLogLine("#Fields: date time ...")).toBeNull();
  });

  it("returns null for lines with fewer than 10 fields", () => {
    expect(parseLogLine("2024-01-15\t10:30:45\tSEA19")).toBeNull();
  });

  it("handles missing referrer as dash", () => {
    const line =
      "2024-01-15\t10:30:45\tSEA19-C2\t5678\t10.0.0.1\tGET\twww.example.com\t/page\t200\t-\tMozilla/5.0";
    const entry = parseLogLine(line);
    expect(entry).not.toBeNull();
    expect(entry!.referrer).toBe("-");
  });

  it("handles zero bytes", () => {
    const line =
      "2024-01-15\t10:30:45\tSEA19-C2\t0\t10.0.0.1\tGET\twww.example.com\t/\t304\t-\tMozilla/5.0";
    const entry = parseLogLine(line);
    expect(entry).not.toBeNull();
    expect(entry!.bytes).toBe(0);
  });
});

describe("extractReferrerDomain", () => {
  it("extracts domain from a valid URL", () => {
    expect(extractReferrerDomain("https://www.google.com/search?q=test")).toBe("www.google.com");
    expect(extractReferrerDomain("https://t.co/abc123")).toBe("t.co");
  });

  it("returns dash for empty or dash referrer", () => {
    expect(extractReferrerDomain("-")).toBe("-");
    expect(extractReferrerDomain("")).toBe("-");
  });

  it("returns dash for invalid URLs", () => {
    expect(extractReferrerDomain("not-a-url")).toBe("-");
  });
});

describe("aggregateMetrics", () => {
  const sampleEntries = [
    {
      date: "2024-01-15",
      bytes: 1000,
      ip: "1.1.1.1",
      uriStem: "/blog/post-1",
      referrer: "https://google.com/",
    },
    {
      date: "2024-01-15",
      bytes: 2000,
      ip: "2.2.2.2",
      uriStem: "/blog/post-1",
      referrer: "https://google.com/",
    },
    {
      date: "2024-01-15",
      bytes: 500,
      ip: "1.1.1.1",
      uriStem: "/blog/post-2",
      referrer: "https://twitter.com/",
    },
    { date: "2024-01-16", bytes: 3000, ip: "3.3.3.3", uriStem: "/", referrer: "-" },
    {
      date: "2024-01-16",
      bytes: 1500,
      ip: "4.4.4.4",
      uriStem: "/blog/post-1",
      referrer: "https://google.com/",
    },
  ];

  it("calculates correct page view totals", () => {
    const result = aggregateMetrics(sampleEntries, "2024-01-15", "2024-01-16");
    expect(result.summary.pageViews).toBe(5);
  });

  it("calculates correct unique visitors", () => {
    const result = aggregateMetrics(sampleEntries, "2024-01-15", "2024-01-16");
    expect(result.summary.uniqueVisitors).toBe(4);
  });

  it("calculates correct bandwidth", () => {
    const result = aggregateMetrics(sampleEntries, "2024-01-15", "2024-01-16");
    expect(result.summary.bandwidth).toBe(8000);
  });

  it("builds daily views sorted by date", () => {
    const result = aggregateMetrics(sampleEntries, "2024-01-15", "2024-01-16");
    expect(result.dailyViews).toEqual([
      { date: "2024-01-15", views: 3 },
      { date: "2024-01-16", views: 2 },
    ]);
  });

  it("builds top pages sorted by views descending", () => {
    const result = aggregateMetrics(sampleEntries, "2024-01-15", "2024-01-16");
    expect(result.topPages[0]).toEqual({ path: "/blog/post-1", views: 3 });
    // Remaining pages have 1 view each; verify they exist but don't assert order
    const remainingPaths = result.topPages
      .slice(1)
      .map((p) => p.path)
      .sort();
    expect(remainingPaths).toEqual(["/", "/blog/post-2"]);
    expect(result.topPages.slice(1).every((p) => p.views === 1)).toBe(true);
  });

  it("builds top referrers sorted by count descending", () => {
    const result = aggregateMetrics(sampleEntries, "2024-01-15", "2024-01-16");
    expect(result.topReferrers[0]).toEqual({ domain: "google.com", count: 3 });
    expect(result.topReferrers[1]).toEqual({ domain: "twitter.com", count: 1 });
  });

  it("filters entries outside the date range", () => {
    const result = aggregateMetrics(sampleEntries, "2024-01-15", "2024-01-15");
    expect(result.summary.pageViews).toBe(3);
    expect(result.summary.uniqueVisitors).toBe(2);
    expect(result.dailyViews).toEqual([{ date: "2024-01-15", views: 3 }]);
  });

  it("returns empty metrics for no matching entries", () => {
    const result = aggregateMetrics(sampleEntries, "2024-02-01", "2024-02-28");
    expect(result.summary.pageViews).toBe(0);
    expect(result.summary.uniqueVisitors).toBe(0);
    expect(result.summary.bandwidth).toBe(0);
    expect(result.dailyViews).toEqual([]);
    expect(result.topPages).toEqual([]);
    expect(result.topReferrers).toEqual([]);
  });

  it("includes date range in response", () => {
    const result = aggregateMetrics(sampleEntries, "2024-01-15", "2024-01-16");
    expect(result.dateRange).toEqual({ start: "2024-01-15", end: "2024-01-16" });
  });

  it("excludes direct traffic from referrers", () => {
    const entriesWithDirect = [
      { date: "2024-01-15", bytes: 100, ip: "1.1.1.1", uriStem: "/", referrer: "-" },
    ];
    const result = aggregateMetrics(entriesWithDirect, "2024-01-15", "2024-01-15");
    expect(result.topReferrers).toEqual([]);
  });
});
