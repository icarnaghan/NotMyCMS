import { useEffect, useState, useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import Table, { TableProps } from "@cloudscape-design/components/table";
import Header from "@cloudscape-design/components/header";
import Pagination from "@cloudscape-design/components/pagination";
import TextFilter from "@cloudscape-design/components/text-filter";
import SpaceBetween from "@cloudscape-design/components/space-between";
import Badge from "@cloudscape-design/components/badge";
import Button from "@cloudscape-design/components/button";
import Box from "@cloudscape-design/components/box";
import Modal from "@cloudscape-design/components/modal";
import Flashbar, { FlashbarProps } from "@cloudscape-design/components/flashbar";
import { useCollection } from "@cloudscape-design/collection-hooks";

import { useAuth } from "../../auth/use-auth";
import { createApiClient } from "../../api/client";
import {
  listContentCached,
  invalidateContentCache,
  deleteContent,
  type ContentItem,
  type ContentType,
} from "../../api/content";
import { filterContentItem } from "./content-filter";

const PAGE_SIZE = 20;

function getContentTypeFromPath(pathname: string): ContentType {
  if (pathname.startsWith("/knowledge-base")) {
    return "knowledge-base";
  }
  return "posts";
}

function getPageTitle(type: ContentType): string {
  return type === "posts" ? "Posts" : "Knowledge Base";
}

const COLUMN_DEFINITIONS: TableProps.ColumnDefinition<ContentItem>[] = [
  {
    id: "title",
    header: "Title",
    cell: (item) => item.title,
    sortingField: "title",
    width: 350,
  },
  {
    id: "date",
    header: "Date",
    cell: (item) => item.date,
    sortingField: "date",
    width: 130,
  },
  {
    id: "categories",
    header: "Categories",
    cell: (item) => item.categories.join(", ") || "—",
    sortingComparator: (a, b) => a.categories.join(", ").localeCompare(b.categories.join(", ")),
  },
  {
    id: "tags",
    header: "Tags",
    cell: (item) => item.tags.join(", ") || "—",
    sortingComparator: (a, b) => a.tags.join(", ").localeCompare(b.tags.join(", ")),
  },
  {
    id: "status",
    header: "Status",
    cell: (item) => {
      if (item.draft) {
        return <Badge color="grey">Draft</Badge>;
      }
      const t = new Date(item.date).getTime();
      if (!Number.isNaN(t) && t > Date.now()) {
        return <Badge color="blue">Scheduled</Badge>;
      }
      return <Badge color="green">Published</Badge>;
    },
    sortingComparator: (a, b) => Number(a.draft) - Number(b.draft),
    width: 120,
  },
];

export default function ContentListPage() {
  const { getAccessToken } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const contentType = getContentTypeFromPath(location.pathname);

  // Seed the filter from a ?filter= query param (e.g. navigated from the
  // taxonomy page), so clicking a category/tag lands on a filtered list.
  const initialFilterText = useMemo(
    () => new URLSearchParams(location.search).get("filter") ?? "",
    [location.search]
  );

  const [items, setItems] = useState<ContentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedItems, setSelectedItems] = useState<ContentItem[]>([]);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [notifications, setNotifications] = useState<FlashbarProps.MessageDefinition[]>([]);

  useEffect(() => {
    let cancelled = false;

    async function fetchContent() {
      setLoading(true);
      setError(null);
      try {
        const client = createApiClient(getAccessToken);
        const data = await listContentCached(client, contentType);
        if (!cancelled) {
          setItems(data);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load content");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    fetchContent();
    return () => {
      cancelled = true;
    };
  }, [contentType, getAccessToken]);

  const filteringFunction = useMemo(() => filterContentItem, []);

  const {
    items: collectionItems,
    filterProps,
    paginationProps,
    collectionProps,
  } = useCollection(items, {
    filtering: {
      filteringFunction,
      defaultFilteringText: initialFilterText,
      empty: (
        <Box textAlign="center" color="inherit">
          <b>No content</b>
          <Box padding={{ bottom: "s" }} variant="p" color="inherit">
            No {getPageTitle(contentType).toLowerCase()} found.
          </Box>
        </Box>
      ),
      noMatch: (
        <Box textAlign="center" color="inherit">
          <b>No matches</b>
          <Box padding={{ bottom: "s" }} variant="p" color="inherit">
            No {getPageTitle(contentType).toLowerCase()} match the filter text.
          </Box>
        </Box>
      ),
    },
    pagination: { pageSize: PAGE_SIZE },
    sorting: {
      defaultState: {
        sortingColumn: COLUMN_DEFINITIONS[1], // date column
        isDescending: true,
      },
    },
  });

  const handleRowClick = ({ detail }: { detail: TableProps.OnRowClickDetail<ContentItem> }) => {
    const slug = detail.item.slug;
    navigate(`/${contentType}/${slug}`);
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      const client = createApiClient(getAccessToken);
      const results = await Promise.allSettled(
        selectedItems.map((item) => deleteContent(client, contentType, item.slug))
      );

      const failed = results.filter((r) => r.status === "rejected");
      const succeeded = results.filter((r) => r.status === "fulfilled");

      // Any deletion changes the list — drop the cache so the next load is fresh.
      if (succeeded.length > 0) {
        invalidateContentCache(contentType);
      }

      if (succeeded.length > 0) {
        const deletedSlugs = new Set(
          selectedItems.filter((_, i) => results[i].status === "fulfilled").map((item) => item.slug)
        );
        setItems((prev) => prev.filter((item) => !deletedSlugs.has(item.slug)));
        const id = `delete-success-${Date.now()}`;
        setNotifications((prev) => [
          ...prev,
          {
            type: "success",
            dismissible: true,
            content: `Successfully deleted ${succeeded.length} item${succeeded.length > 1 ? "s" : ""}.`,
            id,
            onDismiss: () => setNotifications((n) => n.filter((x) => x.id !== id)),
          },
        ]);
      }

      if (failed.length > 0) {
        const id = `delete-error-${Date.now()}`;
        setNotifications((prev) => [
          ...prev,
          {
            type: "error",
            dismissible: true,
            content: `Failed to delete ${failed.length} item${failed.length > 1 ? "s" : ""}. Please try again.`,
            id,
            onDismiss: () => setNotifications((n) => n.filter((x) => x.id !== id)),
          },
        ]);
      }
    } catch (err) {
      const id = `delete-error-${Date.now()}`;
      setNotifications((prev) => [
        ...prev,
        {
          type: "error",
          dismissible: true,
          content: err instanceof Error ? err.message : "Failed to delete content",
          id,
          onDismiss: () => setNotifications((n) => n.filter((x) => x.id !== id)),
        },
      ]);
    } finally {
      setDeleting(false);
      setShowDeleteModal(false);
      setSelectedItems([]);
    }
  };

  return (
    <SpaceBetween size="l">
      <Flashbar items={notifications} />
      <Table
        {...collectionProps}
        columnDefinitions={COLUMN_DEFINITIONS}
        items={collectionItems}
        loading={loading}
        loadingText={`Loading ${getPageTitle(contentType).toLowerCase()}...`}
        trackBy="slug"
        variant="full-page"
        stickyHeader
        selectionType="multi"
        selectedItems={selectedItems}
        onSelectionChange={({ detail }) => setSelectedItems(detail.selectedItems)}
        onRowClick={handleRowClick}
        header={
          <Header
            variant="h1"
            counter={!loading ? `(${items.length})` : undefined}
            actions={
              <SpaceBetween direction="horizontal" size="xs">
                <Button
                  disabled={selectedItems.length === 0}
                  onClick={() => setShowDeleteModal(true)}
                >
                  Delete
                </Button>
                <Button variant="primary" onClick={() => navigate(`/${contentType}/new`)}>
                  Create
                </Button>
              </SpaceBetween>
            }
          >
            {getPageTitle(contentType)}
          </Header>
        }
        filter={
          <TextFilter
            {...filterProps}
            filteringPlaceholder="Search by title, categories, or tags"
            countText={`${collectionProps.totalItemsCount} match${collectionProps.totalItemsCount !== 1 ? "es" : ""}`}
          />
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
              <b>No {getPageTitle(contentType).toLowerCase()}</b>
              <Box padding={{ bottom: "s" }} variant="p" color="inherit">
                No {getPageTitle(contentType).toLowerCase()} to display.
              </Box>
              <Button onClick={() => navigate(`/${contentType}/new`)}>
                Create {contentType === "posts" ? "post" : "article"}
              </Button>
            </Box>
          )
        }
      />

      <Modal
        visible={showDeleteModal}
        onDismiss={() => setShowDeleteModal(false)}
        header="Delete content"
        footer={
          <Box float="right">
            <SpaceBetween direction="horizontal" size="xs">
              <Button variant="link" onClick={() => setShowDeleteModal(false)}>
                Cancel
              </Button>
              <Button variant="primary" onClick={handleDelete} loading={deleting}>
                Delete
              </Button>
            </SpaceBetween>
          </Box>
        }
      >
        <SpaceBetween size="s">
          <Box>
            Are you sure you want to delete{" "}
            {selectedItems.length === 1
              ? `"${selectedItems[0].title}"`
              : `${selectedItems.length} items`}
            ? This action cannot be undone. All associated files including images will be
            permanently removed.
          </Box>
          {selectedItems.length > 1 && (
            <Box variant="code">
              {selectedItems.map((item) => (
                <div key={item.slug}>• {item.title}</div>
              ))}
            </Box>
          )}
        </SpaceBetween>
      </Modal>
    </SpaceBetween>
  );
}
