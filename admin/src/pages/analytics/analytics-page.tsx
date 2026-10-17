import { useState, useEffect, useCallback, useMemo } from "react";
import Header from "@cloudscape-design/components/header";
import Container from "@cloudscape-design/components/container";
import SpaceBetween from "@cloudscape-design/components/space-between";
import Box from "@cloudscape-design/components/box";
import ColumnLayout from "@cloudscape-design/components/column-layout";
import DateRangePicker, {
  type DateRangePickerProps,
} from "@cloudscape-design/components/date-range-picker";
import Table from "@cloudscape-design/components/table";
import LineChart from "@cloudscape-design/components/line-chart";
import Spinner from "@cloudscape-design/components/spinner";
import Alert from "@cloudscape-design/components/alert";

import { useAuth } from "../../auth/use-auth";
import { createApiClient } from "../../api/client";
import { getAnalyticsCached, type AnalyticsResponse } from "../../api/analytics";

/**
 * Formats bytes into a human-readable string (KB, MB, GB).
 */
function formatBandwidth(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

/**
 * Returns a date string in YYYY-MM-DD format for n days ago.
 */
function daysAgo(n: number): string {
  const date = new Date();
  date.setDate(date.getDate() - n);
  return date.toISOString().split("T")[0];
}

/**
 * Returns today's date in YYYY-MM-DD format.
 */
function today(): string {
  return new Date().toISOString().split("T")[0];
}

export default function AnalyticsPage() {
  const { getAccessToken } = useAuth();
  const client = useMemo(() => createApiClient(getAccessToken), [getAccessToken]);

  const [dateRange, setDateRange] = useState<DateRangePickerProps.Value>({
    type: "relative",
    amount: 30,
    unit: "day",
  });
  const [startDate, setStartDate] = useState(daysAgo(30));
  const [endDate, setEndDate] = useState(today());
  const [data, setData] = useState<AnalyticsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAnalytics = useCallback(
    async (start: string, end: string) => {
      setLoading(true);
      setError(null);
      try {
        const response = await getAnalyticsCached(client, start, end);
        setData(response);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load analytics data");
      } finally {
        setLoading(false);
      }
    },
    [client]
  );

  useEffect(() => {
    fetchAnalytics(startDate, endDate);
  }, [fetchAnalytics, startDate, endDate]);

  const handleDateRangeChange = (value: DateRangePickerProps.Value | null) => {
    if (!value) return;
    setDateRange(value);

    if (value.type === "relative") {
      const newStart = daysAgo(value.amount);
      const newEnd = today();
      setStartDate(newStart);
      setEndDate(newEnd);
    } else if (value.type === "absolute") {
      setStartDate(value.startDate);
      setEndDate(value.endDate);
    }
  };

  return (
    <SpaceBetween size="l">
      <Header
        variant="h1"
        actions={
          <DateRangePicker
            value={dateRange}
            onChange={({ detail }) => handleDateRangeChange(detail.value)}
            relativeOptions={[
              { key: "7-days", amount: 7, unit: "day", type: "relative" },
              { key: "30-days", amount: 30, unit: "day", type: "relative" },
              { key: "90-days", amount: 90, unit: "day", type: "relative" },
            ]}
            isValidRange={(range) => {
              if (range?.type === "absolute") {
                if (!range.startDate || !range.endDate) {
                  return { valid: false, errorMessage: "Select a start and end date" };
                }
                if (range.startDate > range.endDate) {
                  return { valid: false, errorMessage: "Start date must be before end date" };
                }
              }
              return { valid: true };
            }}
            i18nStrings={{
              todayAriaLabel: "Today",
              nextMonthAriaLabel: "Next month",
              previousMonthAriaLabel: "Previous month",
              customRelativeRangeDurationLabel: "Duration",
              customRelativeRangeDurationPlaceholder: "Enter duration",
              customRelativeRangeOptionLabel: "Custom range",
              customRelativeRangeOptionDescription: "Set a custom range in the past",
              customRelativeRangeUnitLabel: "Unit of time",
              formatRelativeRange: (range) => `Last ${range.amount} ${range.unit}s`,
              formatUnit: (unit, value) => (value === 1 ? unit : `${unit}s`),
              relativeModeTitle: "Relative range",
              absoluteModeTitle: "Absolute range",
              relativeRangeSelectionHeading: "Choose a range",
              startDateLabel: "Start date",
              startTimeLabel: "Start time",
              endDateLabel: "End date",
              endTimeLabel: "End time",
              dateTimeConstraintText: "",
              applyButtonLabel: "Apply",
              cancelButtonLabel: "Cancel",
              clearButtonLabel: "Clear",
            }}
            placeholder="Select date range"
          />
        }
      >
        Analytics
      </Header>

      {error && <Alert type="error">{error}</Alert>}

      {loading && !data && (
        <Container>
          <Box textAlign="center" padding="l">
            <Spinner size="large" />
          </Box>
        </Container>
      )}

      {data && (
        <SpaceBetween size="l">
          {/* Summary Cards */}
          <ColumnLayout columns={3} variant="text-grid">
            <Container>
              <Box variant="awsui-key-label">Page Views</Box>
              <Box variant="awsui-value-large">{data.summary.pageViews.toLocaleString()}</Box>
            </Container>
            <Container>
              <Box variant="awsui-key-label">Unique Visitors</Box>
              <Box variant="awsui-value-large">{data.summary.uniqueVisitors.toLocaleString()}</Box>
            </Container>
            <Container>
              <Box variant="awsui-key-label">Bandwidth</Box>
              <Box variant="awsui-value-large">{formatBandwidth(data.summary.bandwidth)}</Box>
            </Container>
          </ColumnLayout>

          {/* Daily Page Views Chart */}
          <Container header={<Header variant="h2">Daily Page Views</Header>}>
            <LineChart
              series={[
                {
                  title: "Page Views",
                  type: "line",
                  data: data.dailyViews.map((d) => ({ x: new Date(d.date), y: d.views })),
                },
              ]}
              xDomain={
                data.dailyViews.length > 0
                  ? [
                      new Date(data.dailyViews[0].date),
                      new Date(data.dailyViews[data.dailyViews.length - 1].date),
                    ]
                  : undefined
              }
              yDomain={[0, Math.max(...data.dailyViews.map((d) => d.views), 1)]}
              i18nStrings={{
                xTickFormatter: (date) =>
                  (date as Date).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                  }),
                yTickFormatter: (value) => Math.round(value as number).toLocaleString(),
              }}
              xScaleType="time"
              yTitle="Views"
              xTitle="Date"
              height={250}
              empty={
                <Box textAlign="center" color="inherit">
                  No data available
                </Box>
              }
            />
          </Container>

          {/* Top Pages Table */}
          <Container header={<Header variant="h2">Top Pages</Header>}>
            <Table
              columnDefinitions={[
                {
                  id: "path",
                  header: "Page",
                  cell: (item) => item.path,
                  sortingField: "path",
                },
                {
                  id: "views",
                  header: "Views",
                  cell: (item) => item.views.toLocaleString(),
                  sortingField: "views",
                },
              ]}
              items={data.topPages}
              variant="embedded"
              empty={
                <Box textAlign="center" color="inherit">
                  No data
                </Box>
              }
            />
          </Container>

          {/* Top Referrers Table */}
          <Container header={<Header variant="h2">Top Referrers</Header>}>
            <Table
              columnDefinitions={[
                {
                  id: "domain",
                  header: "Referrer",
                  cell: (item) => item.domain,
                  sortingField: "domain",
                },
                {
                  id: "count",
                  header: "Visits",
                  cell: (item) => item.count.toLocaleString(),
                  sortingField: "count",
                },
              ]}
              items={data.topReferrers}
              variant="embedded"
              empty={
                <Box textAlign="center" color="inherit">
                  No data
                </Box>
              }
            />
          </Container>
        </SpaceBetween>
      )}
    </SpaceBetween>
  );
}
