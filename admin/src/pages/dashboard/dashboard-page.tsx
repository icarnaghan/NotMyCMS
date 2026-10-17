import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import Header from "@cloudscape-design/components/header";
import Container from "@cloudscape-design/components/container";
import SpaceBetween from "@cloudscape-design/components/space-between";
import ColumnLayout from "@cloudscape-design/components/column-layout";
import Box from "@cloudscape-design/components/box";
import Button from "@cloudscape-design/components/button";
import Table from "@cloudscape-design/components/table";
import StatusIndicator from "@cloudscape-design/components/status-indicator";
import Link from "@cloudscape-design/components/link";
import { createApiClient } from "../../api/client";
import { listContentCached, type ContentItem } from "../../api/content";
import { deriveTaxonomy, type TaxonomyItem } from "../../api/taxonomy";
import { getDeployStatus, type DeployStatus } from "../../api/deploy";
import { useAuth } from "../../auth/use-auth";

function getStatusType(
  status: DeployStatus["status"]
): "success" | "error" | "in-progress" | "info" {
  switch (status) {
    case "success":
      return "success";
    case "failed":
      return "error";
    case "building":
    case "deploying":
      return "in-progress";
    case "idle":
    default:
      return "info";
  }
}

function getStatusLabel(status: DeployStatus["status"]): string {
  switch (status) {
    case "idle":
      return "Idle";
    case "building":
      return "Building";
    case "deploying":
      return "Deploying";
    case "success":
      return "Success";
    case "failed":
      return "Failed";
    default:
      return "Unknown";
  }
}

function formatTimestamp(iso: string | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString();
}

/**
 * The effective "last edited" value for a content item.
 *
 * Prefers the frontmatter `modified` stamp, falling back to the publication `date`
 * for content that has never been edited through the admin. Deliberately does NOT
 * use `lastModified`: that is S3's timestamp, and a site deploy rewrites every
 * content object, so it reads as the deploy time for everything at once.
 */
function effectiveModified(item: ContentItem): string | undefined {
  return item.modified || item.date || undefined;
}

/** True for a date-only value like `2024-01-15` (the `date` fallback). */
function isDateOnly(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

/**
 * Sort key for recency. Date-only values are pinned to UTC midnight so they order
 * consistently against full ISO timestamps. Unparseable values sort last.
 */
function modifiedTime(item: ContentItem): number {
  const value = effectiveModified(item);
  if (!value) return 0;
  const t = new Date(isDateOnly(value) ? `${value}T00:00:00Z` : value).getTime();
  return Number.isNaN(t) ? 0 : t;
}

/**
 * Renders the effective modification time.
 *
 * Date-only fallbacks are formatted in UTC: `new Date("2024-01-15")` is UTC
 * midnight, and rendering that in local time shows the previous day anywhere west
 * of UTC. Full timestamps are rendered in local time, which is what you want for
 * "I edited this 20 minutes ago".
 */
function formatModified(item: ContentItem): string {
  const value = effectiveModified(item);
  if (!value) return "—";
  if (isDateOnly(value)) {
    return new Date(`${value}T00:00:00Z`).toLocaleDateString(undefined, { timeZone: "UTC" });
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "—" : parsed.toLocaleString();
}

export default function DashboardPage() {
  const { getAccessToken } = useAuth();
  const navigate = useNavigate();
  const client = useMemo(() => createApiClient(getAccessToken), [getAccessToken]);

  const [posts, setPosts] = useState<ContentItem[]>([]);
  const [kbArticles, setKbArticles] = useState<ContentItem[]>([]);
  const [taxonomy, setTaxonomy] = useState<TaxonomyItem[]>([]);
  const [deployStatus, setDeployStatus] = useState<DeployStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
      const [postsResult, kbResult, deployResult] = await Promise.allSettled([
        listContentCached(client, "posts"),
        listContentCached(client, "knowledge-base"),
        getDeployStatus(client),
      ]);
      const postsData = postsResult.status === "fulfilled" ? postsResult.value : [];
      const kbData = kbResult.status === "fulfilled" ? kbResult.value : [];
      if (postsResult.status === "fulfilled") setPosts(postsData);
      if (kbResult.status === "fulfilled") setKbArticles(kbData);
      // Derive taxonomy from the content we already loaded instead of a
      // separate all-files server read.
      setTaxonomy(deriveTaxonomy([...postsData, ...kbData]));
      if (deployResult.status === "fulfilled") setDeployStatus(deployResult.value);
      setIsLoading(false);
    };
    fetchData();
  }, [client]);

  const categoriesCount = taxonomy.filter((t) => t.type === "category").length;
  const tagsCount = taxonomy.filter((t) => t.type === "tag").length;

  const recentItems = [...posts, ...kbArticles]
    .sort((a, b) => modifiedTime(b) - modifiedTime(a))
    .slice(0, 5);

  return (
    <SpaceBetween size="l">
      <Header variant="h1">Dashboard</Header>

      {/* Summary Statistics */}
      <Container header={<Header variant="h2">Summary</Header>}>
        <ColumnLayout columns={4} variant="text-grid">
          <div>
            <Box variant="awsui-key-label">Total Posts</Box>
            <Box variant="awsui-value-large">{isLoading ? "—" : posts.length}</Box>
          </div>
          <div>
            <Box variant="awsui-key-label">KB Articles</Box>
            <Box variant="awsui-value-large">{isLoading ? "—" : kbArticles.length}</Box>
          </div>
          <div>
            <Box variant="awsui-key-label">Categories</Box>
            <Box variant="awsui-value-large">{isLoading ? "—" : categoriesCount}</Box>
          </div>
          <div>
            <Box variant="awsui-key-label">Tags</Box>
            <Box variant="awsui-value-large">{isLoading ? "—" : tagsCount}</Box>
          </div>
        </ColumnLayout>
      </Container>

      {/* Recently Modified Content */}
      <Table
        header={<Header variant="h2">Recently Modified</Header>}
        loading={isLoading}
        loadingText="Loading recent content..."
        items={recentItems}
        columnDefinitions={[
          {
            id: "title",
            header: "Title",
            cell: (item) => (
              <Link
                onFollow={(e) => {
                  e.preventDefault();
                  navigate(`/${item.type}/${item.slug}`);
                }}
              >
                {item.title}
              </Link>
            ),
          },
          {
            id: "type",
            header: "Type",
            cell: (item) => (item.type === "posts" ? "Post" : "KB Article"),
          },
          {
            id: "lastModified",
            header: "Last Modified",
            cell: (item) => formatModified(item),
          },
        ]}
        empty={<Box textAlign="center">No content items found.</Box>}
      />

      {/* Deployment Status */}
      <Container header={<Header variant="h2">Last Deployment</Header>}>
        {isLoading ? (
          <StatusIndicator type="loading">Loading...</StatusIndicator>
        ) : deployStatus ? (
          <SpaceBetween size="s">
            <SpaceBetween size="xs" direction="horizontal">
              <Box variant="awsui-key-label">Status:</Box>
              <StatusIndicator type={getStatusType(deployStatus.status)}>
                {getStatusLabel(deployStatus.status)}
              </StatusIndicator>
            </SpaceBetween>
            <SpaceBetween size="xs" direction="horizontal">
              <Box variant="awsui-key-label">Last deployed:</Box>
              <Box>{formatTimestamp(deployStatus.completedAt)}</Box>
            </SpaceBetween>
          </SpaceBetween>
        ) : (
          <Box>No deployment information available.</Box>
        )}
      </Container>

      {/* Quick Actions */}
      <Container header={<Header variant="h2">Quick Actions</Header>}>
        <SpaceBetween size="s" direction="horizontal">
          <Button variant="primary" onClick={() => navigate("/posts/new")}>
            Create Post
          </Button>
          <Button onClick={() => navigate("/knowledge-base/new")}>Create Article</Button>
          <Button onClick={() => navigate("/deploy")}>Trigger Deploy</Button>
        </SpaceBetween>
      </Container>
    </SpaceBetween>
  );
}
