import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import Table from "@cloudscape-design/components/table";
import Header from "@cloudscape-design/components/header";
import Button from "@cloudscape-design/components/button";
import SpaceBetween from "@cloudscape-design/components/space-between";
import Box from "@cloudscape-design/components/box";
import Badge from "@cloudscape-design/components/badge";
import Modal from "@cloudscape-design/components/modal";
import Flashbar, { FlashbarProps } from "@cloudscape-design/components/flashbar";

import { useAuth } from "../../auth/use-auth";
import { createApiClient } from "../../api/client";
import { listPages, deletePage, type PageSummary } from "../../api/pages";

/**
 * Landing-page list: every page in the pages manifest, with create / edit / delete.
 *
 * Landing pages are a small, fixed-ish set (unlike the 600+ posts), so no pagination or
 * filtering — a plain table is enough. Nav order and the "unlisted" state are shown so
 * the navigation layout is visible at a glance.
 */
export default function PagesListPage() {
  const navigate = useNavigate();
  const { getAccessToken } = useAuth();
  const client = useMemo(() => createApiClient(getAccessToken), [getAccessToken]);

  const [pages, setPages] = useState<PageSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [flash, setFlash] = useState<FlashbarProps.MessageDefinition[]>([]);
  const [toDelete, setToDelete] = useState<PageSummary | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useMemo(
    () => () => {
      setLoading(true);
      listPages(client)
        .then(setPages)
        .catch((err) =>
          setFlash([
            {
              type: "error",
              content: `Failed to load pages: ${err.message}`,
              dismissible: true,
              onDismiss: () => setFlash([]),
              id: "load-error",
            },
          ])
        )
        .finally(() => setLoading(false));
    },
    [client]
  );

  useEffect(() => {
    load();
  }, [load]);

  async function confirmDelete() {
    if (!toDelete) return;
    setDeleting(true);
    try {
      await deletePage(client, toDelete.slug);
      setFlash([
        {
          type: "success",
          content: `Deleted "${toDelete.slug}".`,
          dismissible: true,
          onDismiss: () => setFlash([]),
          id: "deleted",
        },
      ]);
      setToDelete(null);
      load();
    } catch (err) {
      setFlash([
        {
          type: "error",
          content: `Delete failed: ${(err as Error).message}`,
          dismissible: true,
          onDismiss: () => setFlash([]),
          id: "delete-error",
        },
      ]);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <SpaceBetween size="l">
      {flash.length > 0 && <Flashbar items={flash} />}
      <Table
        items={pages}
        loading={loading}
        loadingText="Loading pages…"
        variant="full-page"
        header={
          <Header
            variant="awsui-h1-sticky"
            counter={`(${pages.length})`}
            actions={
              <Button variant="primary" onClick={() => navigate("/pages/new")}>
                New page
              </Button>
            }
          >
            Landing Pages
          </Header>
        }
        columnDefinitions={[
          {
            id: "slug",
            header: "Slug",
            cell: (p) => (
              <Button variant="inline-link" onClick={() => navigate(`/pages/${p.slug}`)}>
                {p.slug}
              </Button>
            ),
            width: 280,
          },
          {
            id: "title",
            header: "Title",
            cell: (p) => p.seo.title,
            width: 240,
          },
          {
            id: "nav",
            header: "Navigation",
            cell: (p) =>
              p.nav ? (
                <Badge color="blue">{`${p.nav.label} (${p.nav.order})`}</Badge>
              ) : (
                <Box color="text-status-inactive">Unlisted</Box>
              ),
          },
          {
            id: "actions",
            header: "Actions",
            cell: (p) => (
              <SpaceBetween direction="horizontal" size="xs">
                <Button variant="inline-link" onClick={() => navigate(`/pages/${p.slug}`)}>
                  Edit
                </Button>
                <Button variant="inline-link" onClick={() => setToDelete(p)}>
                  Delete
                </Button>
              </SpaceBetween>
            ),
          },
        ]}
        empty={
          <Box textAlign="center" color="inherit" padding="l">
            <SpaceBetween size="s">
              <b>No landing pages</b>
              <Button onClick={() => navigate("/pages/new")}>Create one</Button>
            </SpaceBetween>
          </Box>
        }
      />

      <Modal
        visible={toDelete !== null}
        onDismiss={() => setToDelete(null)}
        header="Delete landing page"
        footer={
          <Box float="right">
            <SpaceBetween direction="horizontal" size="xs">
              <Button variant="link" onClick={() => setToDelete(null)} disabled={deleting}>
                Cancel
              </Button>
              <Button variant="primary" onClick={confirmDelete} loading={deleting}>
                Delete
              </Button>
            </SpaceBetween>
          </Box>
        }
      >
        Delete the landing page <b>{toDelete?.slug}</b>? This removes it from the site, the
        navigation, and the sitemap. The change is committed to the content repository and can be
        reverted there.
      </Modal>
    </SpaceBetween>
  );
}
