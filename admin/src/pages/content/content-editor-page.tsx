import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useLocation, useNavigate } from "react-router-dom";
import Header from "@cloudscape-design/components/header";
import Container from "@cloudscape-design/components/container";
import SpaceBetween from "@cloudscape-design/components/space-between";
import Spinner from "@cloudscape-design/components/spinner";
import Box from "@cloudscape-design/components/box";
import Button from "@cloudscape-design/components/button";
import Flashbar, { FlashbarProps } from "@cloudscape-design/components/flashbar";
import Modal from "@cloudscape-design/components/modal";
import Alert from "@cloudscape-design/components/alert";

import StatusIndicator from "@cloudscape-design/components/status-indicator";
import ContentEditor from "../../components/content-editor";
import FrontmatterForm, { type FrontmatterValue } from "../../components/frontmatter-form";
import { getContentWarnings } from "./content-validation";
import { listMedia } from "../../api/media";
import { slugify } from "../../components/slugify";
import { useAuth } from "../../auth/use-auth";
import { createApiClient, ApiRequestError } from "../../api/client";
import { storageKey } from "../../lib/site-config";
import Table from "@cloudscape-design/components/table";
import {
  getContent,
  saveContent,
  deleteContent,
  listContentCached,
  invalidateContentCache,
  getRevisions,
  restoreRevision,
  type ContentType,
  type ContentItem,
  type Revision,
} from "../../api/content";

/**
 * Determines the content type from the current URL path.
 */
function useContentType(): ContentType {
  const { pathname } = useLocation();
  if (pathname.startsWith("/knowledge-base")) {
    return "knowledge-base";
  }
  return "posts";
}

const EMPTY_FRONTMATTER: FrontmatterValue = {
  title: "",
  date: new Date().toISOString().slice(0, 10),
  description: "",
  author: "",
  categories: [],
  tags: [],
  draft: true,
};

/**
 * ContentEditorPage is the container/orchestrator for editing or creating content.
 * It manages local state for the markdown body and frontmatter, loads existing content
 * when editing, and handles save/delete operations with API calls.
 */
export default function ContentEditorPage() {
  const { slug } = useParams<{ slug?: string }>();
  const contentType = useContentType();
  const navigate = useNavigate();
  const { getAccessToken } = useAuth();
  const isEditing = Boolean(slug);

  const [body, setBody] = useState("");
  const [frontmatter, setFrontmatter] = useState<FrontmatterValue>(EMPTY_FRONTMATTER);
  const [lastModified, setLastModified] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(false);

  // --- Autosave / local draft recovery ---
  const draftKey = `${storageKey("admin-draft")}:${contentType}:${slug ?? "new"}`;
  const [pendingDraft, setPendingDraft] = useState<{
    body: string;
    frontmatter: FrontmatterValue;
    savedAt: string;
  } | null>(null);
  const hydratedRef = useRef(false);
  const baselineRef = useRef("");

  const clearDraft = useCallback(() => {
    try {
      localStorage.removeItem(draftKey);
    } catch {
      // ignore storage errors
    }
    setPendingDraft(null);
  }, [draftKey]);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [revisions, setRevisions] = useState<Revision[]>([]);
  const [revisionsLoading, setRevisionsLoading] = useState(false);
  const [restoringSha, setRestoringSha] = useState<string | null>(null);
  const [flashItems, setFlashItems] = useState<FlashbarProps.MessageDefinition[]>([]);
  const [availableCategories, setAvailableCategories] = useState<string[]>([]);
  const [availableTags, setAvailableTags] = useState<string[]>([]);

  const client = useMemo(() => createApiClient(getAccessToken), [getAccessToken]);

  // Add a flash notification
  const addFlash = useCallback(
    (
      type: FlashbarProps.MessageDefinition["type"],
      content: string,
      action?: { text: string; onClick: () => void }
    ) => {
      const id = Date.now().toString();
      setFlashItems((prev) => [
        ...prev,
        {
          type,
          content,
          dismissible: true,
          dismissLabel: "Dismiss",
          id,
          buttonText: action?.text,
          onButtonClick: action
            ? () => {
                setFlashItems((items) => items.filter((item) => item.id !== id));
                action.onClick();
              }
            : undefined,
          onDismiss: () => setFlashItems((items) => items.filter((item) => item.id !== id)),
        },
      ]);
    },
    []
  );

  // Load available categories and tags from existing content of the same type
  useEffect(() => {
    let cancelled = false;

    async function loadTaxonomy() {
      try {
        const items: ContentItem[] = await listContentCached(client, contentType);
        if (cancelled) return;

        const cats = new Set<string>();
        const tags = new Set<string>();
        for (const item of items) {
          item.categories.forEach((c) => cats.add(c));
          item.tags.forEach((t) => tags.add(t));
        }
        setAvailableCategories(Array.from(cats).sort());
        setAvailableTags(Array.from(tags).sort());
      } catch {
        // Silently fail — categories/tags will just be empty
      }
    }

    loadTaxonomy();
    return () => {
      cancelled = true;
    };
  }, [client, contentType]);

  // Read any saved local draft for this post (runs before content loads).
  useEffect(() => {
    hydratedRef.current = false;
    try {
      const raw = localStorage.getItem(draftKey);
      setPendingDraft(raw ? JSON.parse(raw) : null);
    } catch {
      setPendingDraft(null);
    }
  }, [draftKey]);

  // Overwrite the editor with the current server copy. Returns a cancel fn so
  // the initial-load effect can bail if the component unmounts mid-fetch.
  const loadFromServer = useCallback(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const item = await getContent(client, contentType, slug!);
        if (cancelled) return;
        const loadedFrontmatter: FrontmatterValue = {
          title: item.title,
          date: item.date,
          description: item.description ?? "",
          author: item.author ?? "",
          categories: item.categories,
          tags: item.tags,
          draft: item.draft,
        };
        setBody(item.body ?? "");
        setFrontmatter(loadedFrontmatter);
        setLastModified(item.lastModified);
        baselineRef.current = JSON.stringify({
          body: item.body ?? "",
          frontmatter: loadedFrontmatter,
        });
        hydratedRef.current = true;
      } catch (err) {
        if (cancelled) return;
        const message = err instanceof ApiRequestError ? err.message : "Failed to load content.";
        addFlash("error", message);
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [slug, contentType, client, addFlash]);

  // Load existing content when editing
  useEffect(() => {
    if (!slug) {
      setBody("");
      setFrontmatter(EMPTY_FRONTMATTER);
      baselineRef.current = JSON.stringify({ body: "", frontmatter: EMPTY_FRONTMATTER });
      hydratedRef.current = true;
      return;
    }
    return loadFromServer();
  }, [slug, loadFromServer]);

  // Debounced autosave of the working draft to localStorage (once hydrated and
  // only when the content differs from what was loaded).
  useEffect(() => {
    if (!hydratedRef.current) return;
    if (JSON.stringify({ body, frontmatter }) === baselineRef.current) return;
    const timer = setTimeout(() => {
      try {
        localStorage.setItem(
          draftKey,
          JSON.stringify({ body, frontmatter, savedAt: new Date().toISOString() })
        );
      } catch {
        // ignore storage errors
      }
    }, 1000);
    return () => clearTimeout(timer);
  }, [body, frontmatter, draftKey]);

  const restoreDraft = useCallback(() => {
    if (!pendingDraft) return;
    setBody(pendingDraft.body);
    setFrontmatter(pendingDraft.frontmatter);
    setPendingDraft(null);
  }, [pendingDraft]);

  // Handle save
  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      const data = {
        title: frontmatter.title,
        date: frontmatter.date,
        description: frontmatter.description || undefined,
        author: frontmatter.author || undefined,
        categories: frontmatter.categories,
        tags: frontmatter.tags,
        draft: frontmatter.draft,
        body,
        // Sent on updates so the server can reject a stale overwrite.
        lastModified: isEditing ? lastModified : undefined,
      };

      const savedItem = await saveContent(client, contentType, isEditing ? slug! : null, data);
      setLastModified(savedItem.lastModified);

      // Saved content is the new baseline — clear the recovery draft.
      baselineRef.current = JSON.stringify({ body, frontmatter });
      clearDraft();

      // The list changed — drop the cache so the list/dashboard reload fresh.
      invalidateContentCache(contentType);

      addFlash("success", `Content "${savedItem.title}" saved successfully.`);

      // Navigate to edit URL for the saved slug (handles both create and edit)
      const basePath = contentType === "posts" ? "/posts" : "/knowledge-base";
      if (!isEditing || savedItem.slug !== slug) {
        navigate(`${basePath}/${savedItem.slug}`, { replace: true });
      }
    } catch (err) {
      if (err instanceof ApiRequestError && err.code === "SLUG_CONFLICT") {
        addFlash(
          "error",
          `A content item with the slug "${slugify(frontmatter.title)}" already exists. Please choose a different title.`
        );
      } else if (err instanceof ApiRequestError && err.code === "EDIT_CONFLICT") {
        // Someone else saved since this copy was loaded. Offer to reload the
        // latest server version rather than silently clobbering their changes.
        // The unsaved local edits remain recoverable from the autosave draft.
        addFlash(
          "warning",
          "This item was changed since you opened it. Reload the latest version before saving to avoid overwriting the other change. Your unsaved edits are kept as a recoverable draft.",
          { text: "Reload latest", onClick: () => loadFromServer() }
        );
      } else {
        const message =
          err instanceof ApiRequestError
            ? err.message
            : "An unexpected error occurred while saving.";
        addFlash("error", message);
      }
    } finally {
      setSaving(false);
    }
  }, [
    frontmatter,
    body,
    lastModified,
    client,
    contentType,
    isEditing,
    slug,
    navigate,
    addFlash,
    clearDraft,
    loadFromServer,
  ]);

  // Handle delete
  const handleDelete = useCallback(async () => {
    if (!slug) return;
    setDeleting(true);
    setShowDeleteModal(false);

    try {
      await deleteContent(client, contentType, slug);
      invalidateContentCache(contentType);
      clearDraft();
      addFlash("success", "Content deleted successfully.");
      const basePath = contentType === "posts" ? "/posts" : "/knowledge-base";
      navigate(basePath);
    } catch (err) {
      const message =
        err instanceof ApiRequestError
          ? err.message
          : "An unexpected error occurred while deleting.";
      addFlash("error", message);
    } finally {
      setDeleting(false);
    }
  }, [slug, client, contentType, navigate, addFlash, clearDraft]);

  // Open the revision-history modal and load commits for this post.
  const openHistory = useCallback(async () => {
    if (!slug) return;
    setShowHistoryModal(true);
    setRevisionsLoading(true);
    try {
      setRevisions(await getRevisions(client, contentType, slug));
    } catch (err) {
      addFlash("error", err instanceof ApiRequestError ? err.message : "Failed to load history.");
    } finally {
      setRevisionsLoading(false);
    }
  }, [slug, client, contentType, addFlash]);

  // Restore a previous revision and load it into the editor.
  const handleRestore = useCallback(
    async (sha: string) => {
      if (!slug) return;
      setRestoringSha(sha);
      try {
        const item = await restoreRevision(client, contentType, slug, sha);
        invalidateContentCache(contentType);
        setBody(item.body ?? "");
        setFrontmatter({
          title: item.title,
          date: item.date,
          description: item.description ?? "",
          author: item.author ?? "",
          categories: item.categories,
          tags: item.tags,
          draft: item.draft,
        });
        setLastModified(item.lastModified);
        setShowHistoryModal(false);
        addFlash("success", `Restored to revision ${sha.slice(0, 8)}.`);
      } catch (err) {
        addFlash("error", err instanceof ApiRequestError ? err.message : "Failed to restore.");
      } finally {
        setRestoringSha(null);
      }
    },
    [slug, client, contentType, addFlash]
  );

  // Uploaded image paths for this post, used to flag references to files that
  // don't exist. Undefined until loaded (and for unsaved posts), which skips the
  // check rather than reporting false positives.
  const [availableImages, setAvailableImages] = useState<string[] | undefined>(undefined);

  useEffect(() => {
    if (!slug) {
      setAvailableImages(undefined);
      return;
    }
    let cancelled = false;
    listMedia(client, contentType, slug)
      .then((items) => {
        if (!cancelled) setAvailableImages(items.map((i) => i.path));
      })
      .catch(() => {
        // Non-fatal: leave undefined so the check stays off.
        if (!cancelled) setAvailableImages(undefined);
      });
    return () => {
      cancelled = true;
    };
  }, [client, contentType, slug]);

  const warnings = useMemo(
    () => getContentWarnings(frontmatter, body, availableImages),
    [frontmatter, body, availableImages]
  );

  const pageTitle = isEditing ? `Edit ${frontmatter.title || "Content"}` : "Create New Content";
  const typeLabel = contentType === "posts" ? "Post" : "Article";

  if (loading) {
    return (
      <SpaceBetween size="l">
        <Header variant="h1">{pageTitle}</Header>
        <Container>
          <Box textAlign="center" padding="xl">
            <Spinner size="large" />
            <Box variant="p" margin={{ top: "s" }}>
              Loading content...
            </Box>
          </Box>
        </Container>
      </SpaceBetween>
    );
  }

  return (
    <SpaceBetween size="l">
      <Flashbar items={flashItems} />

      {pendingDraft && (
        <Alert
          type="info"
          dismissible
          onDismiss={clearDraft}
          header="Unsaved draft found"
          action={<Button onClick={restoreDraft}>Restore draft</Button>}
        >
          There's an unsaved draft from {new Date(pendingDraft.savedAt).toLocaleString()}. Restore
          it, or dismiss to discard.
        </Alert>
      )}

      <Header
        variant="h1"
        description={`${isEditing ? "Editing" : "Creating new"} ${typeLabel}`}
        actions={
          <SpaceBetween direction="horizontal" size="xs">
            {isEditing && (
              <Button variant="normal" iconName="undo" onClick={openHistory} disabled={saving}>
                History
              </Button>
            )}
            {isEditing && (
              <Button
                variant="normal"
                onClick={() => setShowDeleteModal(true)}
                loading={deleting}
                disabled={saving}
              >
                Delete
              </Button>
            )}
            <Button
              variant="primary"
              onClick={handleSave}
              loading={saving}
              disabled={deleting || !frontmatter.title.trim()}
            >
              Save
            </Button>
          </SpaceBetween>
        }
      >
        {pageTitle}
      </Header>

      <Container header={<Header variant="h2">Metadata</Header>}>
        <FrontmatterForm
          value={frontmatter}
          onChange={setFrontmatter}
          isNew={!isEditing}
          availableCategories={availableCategories}
          availableTags={availableTags}
        />
      </Container>

      {warnings.length > 0 && (
        <Container header={<Header variant="h2">Quality checks</Header>}>
          <SpaceBetween size="xs">
            {warnings.map((w, i) => (
              <StatusIndicator key={i} type={w.level === "warning" ? "warning" : "info"}>
                {w.message}
              </StatusIndicator>
            ))}
          </SpaceBetween>
        </Container>
      )}

      <Container header={<Header variant="h2">Content</Header>}>
        <ContentEditor value={body} onChange={setBody} contentType={contentType} slug={slug} />
      </Container>

      {/* Delete confirmation modal */}
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
              <Button variant="primary" onClick={handleDelete}>
                Delete
              </Button>
            </SpaceBetween>
          </Box>
        }
      >
        Are you sure you want to delete &quot;{frontmatter.title}&quot;? This will permanently
        remove the content and all associated files. This action cannot be undone.
      </Modal>

      {/* Revision history modal */}
      <Modal
        visible={showHistoryModal}
        onDismiss={() => setShowHistoryModal(false)}
        header="Revision history"
        size="large"
        footer={
          <Box float="right">
            <Button variant="link" onClick={() => setShowHistoryModal(false)}>
              Close
            </Button>
          </Box>
        }
      >
        <Table
          items={revisions}
          loading={revisionsLoading}
          loadingText="Loading history..."
          variant="embedded"
          columnDefinitions={[
            {
              id: "date",
              header: "When",
              cell: (item) => new Date(item.createdAt).toLocaleString(),
              width: 200,
            },
            { id: "author", header: "Author", cell: (item) => item.authorName },
            { id: "message", header: "Message", cell: (item) => item.message },
            {
              id: "actions",
              header: "",
              cell: (item) => (
                <Button
                  variant="normal"
                  loading={restoringSha === item.id}
                  disabled={restoringSha !== null}
                  onClick={() => handleRestore(item.id)}
                >
                  Restore
                </Button>
              ),
              width: 130,
            },
          ]}
          empty={
            <Box textAlign="center" color="inherit">
              No revision history found. Changes are recorded once they are mirrored to git.
            </Box>
          }
        />
      </Modal>
    </SpaceBetween>
  );
}
