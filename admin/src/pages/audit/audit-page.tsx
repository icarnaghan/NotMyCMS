import { useEffect, useState, useMemo } from "react";
import Table from "@cloudscape-design/components/table";
import Header from "@cloudscape-design/components/header";
import Box from "@cloudscape-design/components/box";
import SpaceBetween from "@cloudscape-design/components/space-between";
import StatusIndicator from "@cloudscape-design/components/status-indicator";
import Pagination from "@cloudscape-design/components/pagination";
import TextFilter from "@cloudscape-design/components/text-filter";
import Button from "@cloudscape-design/components/button";
import { useCollection } from "@cloudscape-design/collection-hooks";

import { useAuth } from "../../auth/use-auth";
import { createApiClient } from "../../api/client";
import { getAuditLog, type AuditEntry } from "../../api/audit";

const PAGE_SIZE = 25;

function formatTimestamp(iso: string): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString();
}

function GitStatus({ entry }: { entry: AuditEntry }) {
  if (entry.gitMirrored === undefined) return <>—</>;
  if (entry.gitMirrored) return <StatusIndicator type="success">Mirrored</StatusIndicator>;
  return (
    <StatusIndicator type="error">{entry.gitError ? "Failed" : "Not mirrored"}</StatusIndicator>
  );
}

export default function AuditPage() {
  const { getAccessToken } = useAuth();
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useMemo(
    () => async () => {
      setLoading(true);
      setError(null);
      try {
        const client = createApiClient(getAccessToken);
        setEntries(await getAuditLog(client, 200));
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load audit log");
      } finally {
        setLoading(false);
      }
    },
    [getAccessToken]
  );

  useEffect(() => {
    load();
  }, [load]);

  const { items, filterProps, paginationProps, collectionProps } = useCollection(entries, {
    filtering: {
      filteringFunction: (item, text) => {
        const q = text.toLowerCase();
        return (
          item.action.toLowerCase().includes(q) ||
          item.resource.toLowerCase().includes(q) ||
          item.user.toLowerCase().includes(q)
        );
      },
    },
    pagination: { pageSize: PAGE_SIZE },
    sorting: {},
  });

  return (
    <SpaceBetween size="l">
      <Table
        {...collectionProps}
        items={items}
        loading={loading}
        loadingText="Loading activity..."
        variant="full-page"
        stickyHeader
        columnDefinitions={[
          {
            id: "timestamp",
            header: "When",
            cell: (item) => formatTimestamp(item.timestamp),
            width: 200,
          },
          { id: "user", header: "User", cell: (item) => item.user, width: 200 },
          { id: "action", header: "Action", cell: (item) => item.action, width: 160 },
          { id: "resource", header: "Resource", cell: (item) => item.resource },
          {
            id: "detail",
            header: "Detail",
            cell: (item) => item.detail || "—",
          },
          {
            id: "git",
            header: "Git",
            cell: (item) => <GitStatus entry={item} />,
            width: 130,
          },
        ]}
        header={
          <Header
            variant="h1"
            counter={!loading ? `(${entries.length})` : undefined}
            actions={
              <Button iconName="refresh" onClick={load} loading={loading}>
                Refresh
              </Button>
            }
          >
            Audit Log
          </Header>
        }
        filter={
          <TextFilter {...filterProps} filteringPlaceholder="Search by user, action, or resource" />
        }
        pagination={<Pagination {...paginationProps} />}
        empty={
          error ? (
            <Box textAlign="center" color="inherit">
              <b>Error</b>
              <Box padding={{ bottom: "s" }} variant="p" color="inherit">
                {error}
              </Box>
            </Box>
          ) : (
            <Box textAlign="center" color="inherit">
              <b>No activity</b>
              <Box padding={{ bottom: "s" }} variant="p" color="inherit">
                No admin activity has been recorded yet.
              </Box>
            </Box>
          )
        }
      />
    </SpaceBetween>
  );
}
