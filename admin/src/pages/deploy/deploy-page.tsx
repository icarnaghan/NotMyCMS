import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import Header from "@cloudscape-design/components/header";
import Container from "@cloudscape-design/components/container";
import SpaceBetween from "@cloudscape-design/components/space-between";
import Button from "@cloudscape-design/components/button";
import StatusIndicator from "@cloudscape-design/components/status-indicator";
import Modal from "@cloudscape-design/components/modal";
import Box from "@cloudscape-design/components/box";
import Alert from "@cloudscape-design/components/alert";
import Table from "@cloudscape-design/components/table";
import { createApiClient } from "../../api/client";
import {
  triggerDeploy,
  getDeployStatus,
  getDeployHistory,
  type DeployStatus,
  type DeployHistoryEntry,
} from "../../api/deploy";
import { useAuth } from "../../auth/use-auth";

const POLL_INTERVAL_MS = 5000;
// Stop polling after this many consecutive failures so a persistent error
// doesn't leave the UI stuck in a disabled "Deploying" state forever.
const MAX_POLL_ERRORS = 5;

function getStatusType(
  status: DeployStatus["status"]
): "success" | "error" | "in-progress" | "info" | "stopped" {
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
  const date = new Date(iso);
  return date.toLocaleString();
}

function formatDurationMs(durationMs: number | undefined): string {
  if (durationMs === undefined || durationMs < 0) return "—";
  const seconds = Math.round(durationMs / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds}s`;
}

function computeDuration(startedAt: string | undefined, completedAt: string | undefined): string {
  if (!startedAt || !completedAt) return "—";
  const durationMs = new Date(completedAt).getTime() - new Date(startedAt).getTime();
  return formatDurationMs(durationMs);
}

export default function DeployPage() {
  const { getAccessToken } = useAuth();
  const [deployStatus, setDeployStatus] = useState<DeployStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isDeploying, setIsDeploying] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<DeployHistoryEntry[]>([]);
  const [isHistoryLoading, setIsHistoryLoading] = useState(true);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Consecutive poll failures; used to stop polling instead of spinning forever.
  const pollErrorsRef = useRef(0);

  const client = useMemo(() => createApiClient(getAccessToken), [getAccessToken]);

  const fetchStatus = useCallback(async () => {
    try {
      const status = await getDeployStatus(client);
      setDeployStatus(status);
      setError(null);
      return status;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to fetch deploy status";
      setError(message);
      return null;
    }
  }, [client]);

  const fetchHistory = useCallback(async () => {
    try {
      const entries = await getDeployHistory(client);
      setHistory(entries);
    } catch {
      // History is non-critical; leave the current list in place on error.
    } finally {
      setIsHistoryLoading(false);
    }
  }, [client]);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const startPolling = useCallback(() => {
    stopPolling();
    pollErrorsRef.current = 0;
    pollRef.current = setInterval(async () => {
      const status = await fetchStatus();
      if (!status) {
        // Network/API error — give up after several consecutive failures so a
        // persistent error doesn't wedge the UI in "Deploying" indefinitely.
        pollErrorsRef.current += 1;
        if (pollErrorsRef.current >= MAX_POLL_ERRORS) {
          stopPolling();
          setIsDeploying(false);
        }
        return;
      }
      pollErrorsRef.current = 0;
      if (status.status !== "building" && status.status !== "deploying") {
        stopPolling();
        setIsDeploying(false);
        // A deploy just finished — refresh the history table.
        fetchHistory();
      }
    }, POLL_INTERVAL_MS);
  }, [fetchStatus, fetchHistory, stopPolling]);

  useEffect(() => {
    const loadInitialStatus = async () => {
      setIsLoading(true);
      const status = await fetchStatus();
      setIsLoading(false);
      // If a deployment is currently in progress, start polling
      if (status && (status.status === "building" || status.status === "deploying")) {
        setIsDeploying(true);
        startPolling();
      }
    };
    loadInitialStatus();
    fetchHistory();
    return () => stopPolling();
  }, [fetchStatus, fetchHistory, startPolling, stopPolling]);

  const handleDeploy = async () => {
    setShowConfirmModal(false);
    setIsDeploying(true);
    setError(null);
    try {
      const status = await triggerDeploy(client);
      setDeployStatus(status);
      startPolling();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to trigger deployment";
      setError(message);
      setIsDeploying(false);
    }
  };

  return (
    <SpaceBetween size="l">
      <Header variant="h1">Deploy</Header>

      <Container header={<Header variant="h2">Trigger Deployment</Header>}>
        <SpaceBetween size="m">
          <Box>
            Trigger a full site rebuild including manifest generation, Vite build, S3 upload, and
            CloudFront cache invalidation.
          </Box>
          <Button
            variant="primary"
            onClick={() => setShowConfirmModal(true)}
            loading={isDeploying}
            disabled={isDeploying || isLoading}
          >
            Deploy Site
          </Button>
        </SpaceBetween>
      </Container>

      <Container header={<Header variant="h2">Deployment Status</Header>}>
        {isLoading ? (
          <StatusIndicator type="loading">Loading status...</StatusIndicator>
        ) : deployStatus ? (
          <SpaceBetween size="m">
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

            <SpaceBetween size="xs" direction="horizontal">
              <Box variant="awsui-key-label">Duration:</Box>
              <Box>{computeDuration(deployStatus.startedAt, deployStatus.completedAt)}</Box>
            </SpaceBetween>

            {deployStatus.buildId && (
              <SpaceBetween size="xs" direction="horizontal">
                <Box variant="awsui-key-label">Build ID:</Box>
                <Box>{deployStatus.buildId}</Box>
              </SpaceBetween>
            )}
          </SpaceBetween>
        ) : (
          <Box>No deployment information available.</Box>
        )}
      </Container>

      {deployStatus?.status === "failed" && deployStatus.error && (
        <Container header={<Header variant="h2">Error Details</Header>}>
          <Alert type="error" header="Deployment failed">
            <Box variant="code">{deployStatus.error}</Box>
          </Alert>
        </Container>
      )}

      {error && (
        <Alert type="error" dismissible onDismiss={() => setError(null)}>
          {error}
        </Alert>
      )}

      <Table<DeployHistoryEntry>
        variant="container"
        header={<Header variant="h2">Deploy History</Header>}
        loading={isHistoryLoading}
        loadingText="Loading deploy history..."
        items={history}
        empty={<Box textAlign="center">No deployments recorded yet.</Box>}
        columnDefinitions={[
          {
            id: "status",
            header: "Status",
            cell: (item) => (
              <StatusIndicator type={item.status === "success" ? "success" : "error"}>
                {item.status === "success" ? "Success" : "Failed"}
              </StatusIndicator>
            ),
          },
          {
            id: "completedAt",
            header: "Completed",
            cell: (item) => formatTimestamp(item.completedAt),
          },
          {
            id: "duration",
            header: "Duration",
            cell: (item) => formatDurationMs(item.durationMs),
          },
          {
            id: "content",
            header: "Content",
            cell: (item) =>
              item.status === "success"
                ? `${item.postCount ?? 0} posts, ${item.kbCount ?? 0} KB`
                : "—",
          },
          {
            id: "triggeredBy",
            header: "Triggered by",
            cell: (item) => item.triggeredBy || "—",
          },
          {
            id: "detail",
            header: "Detail",
            cell: (item) => item.error || "—",
          },
        ]}
      />

      <Modal
        visible={showConfirmModal}
        onDismiss={() => setShowConfirmModal(false)}
        header="Confirm Deployment"
        footer={
          <Box float="right">
            <SpaceBetween size="xs" direction="horizontal">
              <Button variant="link" onClick={() => setShowConfirmModal(false)}>
                Cancel
              </Button>
              <Button variant="primary" onClick={handleDeploy}>
                Deploy
              </Button>
            </SpaceBetween>
          </Box>
        }
      >
        <Box>
          Are you sure you want to trigger a site deployment? This will rebuild the entire site and
          invalidate the CloudFront cache.
        </Box>
      </Modal>
    </SpaceBetween>
  );
}
