import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import Tabs from "@cloudscape-design/components/tabs";
import Table, { TableProps } from "@cloudscape-design/components/table";
import Header from "@cloudscape-design/components/header";
import Button from "@cloudscape-design/components/button";
import Input from "@cloudscape-design/components/input";
import Modal from "@cloudscape-design/components/modal";
import SpaceBetween from "@cloudscape-design/components/space-between";
import Box from "@cloudscape-design/components/box";
import Select, { SelectProps } from "@cloudscape-design/components/select";
import FormField from "@cloudscape-design/components/form-field";

import { useAuth } from "../../auth/use-auth";
import { createApiClient } from "../../api/client";
import {
  deriveTaxonomy,
  renameTaxonomy,
  mergeTaxonomy,
  deleteTaxonomy,
  type TaxonomyItem,
  type TaxonomyType,
} from "../../api/taxonomy";
import { listContentCached, invalidateContentCache } from "../../api/content";

export default function TaxonomyPage() {
  const { getAccessToken } = useAuth();
  const navigate = useNavigate();

  const [items, setItems] = useState<TaxonomyItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TaxonomyType>("category");

  // Inline rename state
  const [renamingItem, setRenamingItem] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  // Merge modal state
  const [mergeModalVisible, setMergeModalVisible] = useState(false);
  const [mergeSource, setMergeSource] = useState<string | null>(null);
  const [mergeTarget, setMergeTarget] = useState<SelectProps.Option | null>(null);

  // Delete confirmation state
  const [deleteModalVisible, setDeleteModalVisible] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  // Action loading state
  const [actionLoading, setActionLoading] = useState(false);

  const fetchTaxonomy = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const client = createApiClient(getAccessToken);
      const [posts, kb] = await Promise.all([
        listContentCached(client, "posts"),
        listContentCached(client, "knowledge-base"),
      ]);
      setItems(deriveTaxonomy([...posts, ...kb]));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load taxonomy");
    } finally {
      setLoading(false);
    }
  }, [getAccessToken]);

  useEffect(() => {
    fetchTaxonomy();
  }, [fetchTaxonomy]);

  const filteredItems = items.filter((item) => item.type === activeTab);

  // --- Rename ---
  const handleRenameStart = (name: string) => {
    setRenamingItem(name);
    setRenameValue(name);
  };

  const handleRenameCancel = () => {
    setRenamingItem(null);
    setRenameValue("");
  };

  const handleRenameConfirm = async () => {
    if (!renamingItem || !renameValue.trim() || renameValue === renamingItem) {
      handleRenameCancel();
      return;
    }
    setActionLoading(true);
    try {
      const client = createApiClient(getAccessToken);
      await renameTaxonomy(client, activeTab, renamingItem, renameValue.trim());
      handleRenameCancel();
      invalidateContentCache();
      await fetchTaxonomy();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to rename");
    } finally {
      setActionLoading(false);
    }
  };

  const handleRenameKeyDown = (event: CustomEvent<{ keyCode: number; key: string }>) => {
    if (event.detail.key === "Enter") {
      handleRenameConfirm();
    } else if (event.detail.key === "Escape") {
      handleRenameCancel();
    }
  };

  // --- Merge ---
  const handleMergeStart = (sourceName: string) => {
    setMergeSource(sourceName);
    setMergeTarget(null);
    setMergeModalVisible(true);
  };

  const handleMergeConfirm = async () => {
    if (!mergeSource || !mergeTarget?.value) return;
    setActionLoading(true);
    try {
      const client = createApiClient(getAccessToken);
      await mergeTaxonomy(client, activeTab, mergeSource, mergeTarget.value);
      setMergeModalVisible(false);
      setMergeSource(null);
      setMergeTarget(null);
      invalidateContentCache();
      await fetchTaxonomy();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to merge");
    } finally {
      setActionLoading(false);
    }
  };

  // --- Delete ---
  const handleDeleteStart = (name: string) => {
    setDeleteTarget(name);
    setDeleteModalVisible(true);
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    setActionLoading(true);
    try {
      const client = createApiClient(getAccessToken);
      await deleteTaxonomy(client, activeTab, deleteTarget);
      setDeleteModalVisible(false);
      setDeleteTarget(null);
      invalidateContentCache();
      await fetchTaxonomy();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete");
    } finally {
      setActionLoading(false);
    }
  };

  // --- Click-through to filtered content ---
  const handleNameClick = (name: string) => {
    const filterParam = encodeURIComponent(name);
    navigate(`/posts?filter=${filterParam}`);
  };

  // --- Merge target options (exclude source) ---
  const mergeTargetOptions: SelectProps.Option[] = filteredItems
    .filter((item) => item.name !== mergeSource)
    .map((item) => ({ label: item.name, value: item.name }));

  // --- Column definitions ---
  const columnDefinitions: TableProps.ColumnDefinition<TaxonomyItem>[] = [
    {
      id: "name",
      header: "Name",
      cell: (item) => {
        if (renamingItem === item.name) {
          return (
            <Input
              value={renameValue}
              onChange={({ detail }) => setRenameValue(detail.value)}
              onKeyDown={handleRenameKeyDown}
              autoFocus
              placeholder="Enter new name"
            />
          );
        }
        return (
          <Button variant="inline-link" onClick={() => handleNameClick(item.name)}>
            {item.name}
          </Button>
        );
      },
      sortingField: "name",
      width: 300,
    },
    {
      id: "count",
      header: "Usage Count",
      cell: (item) => item.count,
      sortingField: "count",
      width: 140,
    },
    {
      id: "actions",
      header: "Actions",
      cell: (item) => {
        if (renamingItem === item.name) {
          return (
            <SpaceBetween direction="horizontal" size="xs">
              <Button onClick={handleRenameConfirm} loading={actionLoading} variant="primary">
                Save
              </Button>
              <Button onClick={handleRenameCancel} variant="link">
                Cancel
              </Button>
            </SpaceBetween>
          );
        }
        return (
          <SpaceBetween direction="horizontal" size="xs">
            <Button onClick={() => handleRenameStart(item.name)} iconName="edit" variant="icon" />
            <Button onClick={() => handleMergeStart(item.name)} iconName="share" variant="icon" />
            <Button onClick={() => handleDeleteStart(item.name)} iconName="remove" variant="icon" />
          </SpaceBetween>
        );
      },
      width: 200,
    },
  ];

  const tabLabel = activeTab === "category" ? "Categories" : "Tags";

  return (
    <SpaceBetween size="l">
      <Header variant="h1">Taxonomy</Header>

      <Tabs
        activeTabId={activeTab}
        onChange={({ detail }) => {
          setActiveTab(detail.activeTabId as TaxonomyType);
          handleRenameCancel();
        }}
        tabs={[
          { id: "category", label: "Categories" },
          { id: "tag", label: "Tags" },
        ]}
      />

      <Table
        columnDefinitions={columnDefinitions}
        items={filteredItems}
        loading={loading}
        loadingText={`Loading ${tabLabel.toLowerCase()}...`}
        trackBy="name"
        sortingDisabled={false}
        header={
          <Header counter={!loading ? `(${filteredItems.length})` : undefined}>{tabLabel}</Header>
        }
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
              <b>No {tabLabel.toLowerCase()}</b>
              <Box padding={{ bottom: "s" }} variant="p" color="inherit">
                No {tabLabel.toLowerCase()} found.
              </Box>
            </Box>
          )
        }
      />

      {/* Merge Modal */}
      <Modal
        visible={mergeModalVisible}
        onDismiss={() => setMergeModalVisible(false)}
        header={`Merge ${activeTab}`}
        footer={
          <Box float="right">
            <SpaceBetween direction="horizontal" size="xs">
              <Button variant="link" onClick={() => setMergeModalVisible(false)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={handleMergeConfirm}
                loading={actionLoading}
                disabled={!mergeTarget}
              >
                Merge
              </Button>
            </SpaceBetween>
          </Box>
        }
      >
        <SpaceBetween size="m">
          <FormField label="Source (will be removed)">
            <Input value={mergeSource ?? ""} disabled />
          </FormField>
          <FormField label="Target (will keep)">
            <Select
              selectedOption={mergeTarget}
              onChange={({ detail }) => setMergeTarget(detail.selectedOption)}
              options={mergeTargetOptions}
              placeholder="Select target"
            />
          </FormField>
        </SpaceBetween>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        visible={deleteModalVisible}
        onDismiss={() => setDeleteModalVisible(false)}
        header={`Delete ${activeTab}`}
        footer={
          <Box float="right">
            <SpaceBetween direction="horizontal" size="xs">
              <Button variant="link" onClick={() => setDeleteModalVisible(false)}>
                Cancel
              </Button>
              <Button variant="primary" onClick={handleDeleteConfirm} loading={actionLoading}>
                Delete
              </Button>
            </SpaceBetween>
          </Box>
        }
      >
        <Box>
          Are you sure you want to delete <b>{deleteTarget}</b>? This will remove it from all
          content items that reference it.
        </Box>
      </Modal>
    </SpaceBetween>
  );
}
