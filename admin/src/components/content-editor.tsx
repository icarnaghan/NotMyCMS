import { useCallback, useEffect, useMemo, useRef, useState, type ComponentType } from "react";
import ReactMarkdown from "react-markdown";
import Button from "@cloudscape-design/components/button";
import SpaceBetween from "@cloudscape-design/components/space-between";
import Modal from "@cloudscape-design/components/modal";
import Alert from "@cloudscape-design/components/alert";
import Box from "@cloudscape-design/components/box";
import Spinner from "@cloudscape-design/components/spinner";
import { useAuth } from "../auth/use-auth";
import { createApiClient } from "../api/client";
import { listMedia, deleteMedia, type MediaItem } from "../api/media";
import { safeUrlTransform } from "../lib/safe-url";
import {
  colorBackgroundContainerContent,
  colorBackgroundInputDefault,
  colorBorderDividerDefault,
  colorBorderInputDefault,
  colorTextBodyDefault,
  colorTextBodySecondary,
  fontFamilyMonospace,
} from "@cloudscape-design/design-tokens";
import {
  Bold,
  Italic,
  Heading1,
  Heading2,
  Heading3,
  Link as LinkIcon,
  Image as ImageIcon,
  ImagePlus,
  Code,
  type LucideProps,
} from "lucide-react";
import MediaUploader from "./media-uploader";
import { resolveImageSrc } from "./preview-image-src";

export interface ContentEditorProps {
  value: string;
  onChange: (value: string) => void;
  /** Content type of the post being edited (needed for image uploads). */
  contentType: "posts" | "knowledge-base";
  /** Slug of the post; undefined for a new, unsaved post (uploads disabled). */
  slug?: string;
}

interface ToolbarAction {
  label: string;
  Icon: ComponentType<LucideProps>;
  prefix: string;
  suffix: string;
  placeholder: string;
  block?: boolean;
}

const TOOLBAR_ACTIONS: ToolbarAction[] = [
  { label: "Bold", Icon: Bold, prefix: "**", suffix: "**", placeholder: "bold text" },
  { label: "Italic", Icon: Italic, prefix: "*", suffix: "*", placeholder: "italic text" },
  { label: "Heading 1", Icon: Heading1, prefix: "# ", suffix: "", placeholder: "Heading 1" },
  { label: "Heading 2", Icon: Heading2, prefix: "## ", suffix: "", placeholder: "Heading 2" },
  { label: "Heading 3", Icon: Heading3, prefix: "### ", suffix: "", placeholder: "Heading 3" },
  { label: "Link", Icon: LinkIcon, prefix: "[", suffix: "](url)", placeholder: "link text" },
  { label: "Image", Icon: ImageIcon, prefix: "![", suffix: "](url)", placeholder: "alt text" },
  {
    label: "Code Block",
    Icon: Code,
    prefix: "```\n",
    suffix: "\n```",
    placeholder: "code",
    block: true,
  },
];

export default function ContentEditor({ value, onChange, contentType, slug }: ContentEditorProps) {
  const { getAccessToken } = useAuth();
  const client = useMemo(() => createApiClient(getAccessToken), [getAccessToken]);

  const [preview, setPreview] = useState(value);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [mediaItems, setMediaItems] = useState<MediaItem[]>([]);
  const [mediaLoading, setMediaLoading] = useState(false);
  const [deletingFile, setDeletingFile] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounced preview update (300ms)
  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    debounceRef.current = setTimeout(() => {
      setPreview(value);
    }, 300);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [value]);

  const handleTextareaChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      onChange(e.target.value);
    },
    [onChange]
  );

  // Rewrite relative image paths so uploaded images render in the preview the
  // same way they will on the live site.
  const previewComponents = useMemo(
    () => ({
      img: ({ src, alt }: { src?: string | Blob; alt?: string }) => (
        <img
          src={resolveImageSrc(typeof src === "string" ? src : undefined, contentType, slug)}
          alt={alt || ""}
          loading="lazy"
          style={{ maxWidth: "100%", height: "auto" }}
        />
      ),
    }),
    [contentType, slug]
  );

  const insertMarkdown = useCallback(
    (action: ToolbarAction) => {
      const textarea = textareaRef.current;
      if (!textarea) return;

      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const selectedText = value.substring(start, end);
      const textToInsert = selectedText || action.placeholder;

      let newValue: string;
      let newCursorStart: number;
      let newCursorEnd: number;

      if (action.block) {
        // For block-level insertions, ensure we're on a new line
        const before = value.substring(0, start);
        const after = value.substring(end);
        const needsNewlineBefore = before.length > 0 && !before.endsWith("\n");
        const prefix = (needsNewlineBefore ? "\n" : "") + action.prefix;
        newValue = before + prefix + textToInsert + action.suffix + after;
        newCursorStart = before.length + prefix.length;
        newCursorEnd = newCursorStart + textToInsert.length;
      } else {
        const before = value.substring(0, start);
        const after = value.substring(end);
        newValue = before + action.prefix + textToInsert + action.suffix + after;
        newCursorStart = start + action.prefix.length;
        newCursorEnd = newCursorStart + textToInsert.length;
      }

      onChange(newValue);

      // Restore cursor position after React re-renders
      requestAnimationFrame(() => {
        textarea.focus();
        textarea.setSelectionRange(newCursorStart, newCursorEnd);
      });
    },
    [value, onChange]
  );

  // Insert a complete string (e.g. an uploaded image reference) at the cursor.
  const insertTextAtCursor = useCallback(
    (text: string) => {
      const textarea = textareaRef.current;
      const start = textarea ? textarea.selectionStart : value.length;
      const end = textarea ? textarea.selectionEnd : value.length;
      const newValue = value.substring(0, start) + text + value.substring(end);
      onChange(newValue);

      const cursor = start + text.length;
      requestAnimationFrame(() => {
        if (!textarea) return;
        textarea.focus();
        textarea.setSelectionRange(cursor, cursor);
      });
    },
    [value, onChange]
  );

  const loadMedia = useCallback(async () => {
    if (!slug) return;
    setMediaLoading(true);
    try {
      setMediaItems(await listMedia(client, contentType, slug));
    } catch {
      // Non-fatal — the uploader still works even if the list fails to load.
      setMediaItems([]);
    } finally {
      setMediaLoading(false);
    }
  }, [client, contentType, slug]);

  const openUploadModal = useCallback(() => {
    setUploadError(null);
    setShowUploadModal(true);
    loadMedia();
  }, [loadMedia]);

  const handleUploadComplete = useCallback(
    (markdownRef: string) => {
      insertTextAtCursor(markdownRef);
      setShowUploadModal(false);
      setUploadError(null);
    },
    [insertTextAtCursor]
  );

  const handleInsertExisting = useCallback(
    (item: MediaItem) => {
      const alt = item.filename.replace(/\.[^.]+$/, "");
      insertTextAtCursor(`![${alt}](${item.path})`);
      setShowUploadModal(false);
    },
    [insertTextAtCursor]
  );

  const handleDeleteMedia = useCallback(
    async (filename: string) => {
      if (!slug) return;
      setDeletingFile(filename);
      try {
        await deleteMedia(client, contentType, slug, filename);
        setMediaItems((prev) => prev.filter((m) => m.filename !== filename));
      } catch (err) {
        setUploadError(err instanceof Error ? err.message : "Failed to delete image");
      } finally {
        setDeletingFile(null);
      }
    },
    [client, contentType, slug]
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
      {/* Toolbar */}
      <div
        style={{
          borderBottom: `1px solid ${colorBorderDividerDefault}`,
          paddingBottom: "8px",
        }}
      >
        <SpaceBetween direction="horizontal" size="xs">
          {TOOLBAR_ACTIONS.map((action) => (
            <Button
              key={action.label}
              variant="icon"
              ariaLabel={action.label}
              iconSvg={
                <action.Icon width="100%" height="100%" aria-hidden="true" focusable="false" />
              }
              onClick={() => insertMarkdown(action)}
            />
          ))}
          <Button
            variant="icon"
            ariaLabel={slug ? "Upload image" : "Save the post before uploading images"}
            disabled={!slug}
            iconSvg={<ImagePlus width="100%" height="100%" aria-hidden="true" focusable="false" />}
            onClick={openUploadModal}
          />
        </SpaceBetween>
      </div>

      {/* Split Pane: Editor + Preview */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "16px",
          minHeight: "500px",
        }}
      >
        {/* Left: Markdown Source */}
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div
            style={{
              fontSize: "12px",
              fontWeight: "bold",
              marginBottom: "4px",
              color: colorTextBodySecondary,
              textTransform: "uppercase",
            }}
          >
            Markdown
          </div>
          <textarea
            ref={textareaRef}
            value={value}
            onChange={handleTextareaChange}
            aria-label="Markdown editor"
            style={{
              flex: 1,
              fontFamily: fontFamilyMonospace,
              fontSize: "14px",
              lineHeight: "1.6",
              padding: "12px",
              border: `1px solid ${colorBorderInputDefault}`,
              borderRadius: "4px",
              resize: "vertical",
              minHeight: "460px",
              outline: "none",
              backgroundColor: colorBackgroundInputDefault,
              color: colorTextBodyDefault,
            }}
            placeholder="Write your markdown content here..."
          />
        </div>

        {/* Right: Live Preview */}
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div
            style={{
              fontSize: "12px",
              fontWeight: "bold",
              marginBottom: "4px",
              color: colorTextBodySecondary,
              textTransform: "uppercase",
            }}
          >
            Preview
          </div>
          <div
            style={{
              flex: 1,
              padding: "12px",
              border: `1px solid ${colorBorderDividerDefault}`,
              borderRadius: "4px",
              overflowY: "auto",
              minHeight: "460px",
              backgroundColor: colorBackgroundContainerContent,
              color: colorTextBodyDefault,
            }}
          >
            {/*
              urlTransform runs first and rejects unsafe schemes (react-markdown
              v10 dropped its built-in sanitizer); components.img then rewrites
              the surviving relative paths to /content/<type>/<slug>/… so
              uploaded images render. Relative URLs pass the transform
              untouched, so the two compose.
            */}
            <ReactMarkdown components={previewComponents} urlTransform={safeUrlTransform}>
              {preview}
            </ReactMarkdown>
          </div>
        </div>
      </div>

      <Modal
        visible={showUploadModal}
        onDismiss={() => setShowUploadModal(false)}
        header="Insert image"
        footer={
          <Box float="right">
            <Button variant="link" onClick={() => setShowUploadModal(false)}>
              Cancel
            </Button>
          </Box>
        }
      >
        <SpaceBetween size="m">
          {uploadError && <Alert type="error">{uploadError}</Alert>}
          {slug && (
            <MediaUploader
              contentType={contentType}
              slug={slug}
              onUploadComplete={handleUploadComplete}
              onError={(message) => setUploadError(message)}
            />
          )}

          <Box>
            <Box variant="h4">Existing images</Box>
            {mediaLoading ? (
              <Box textAlign="center" padding="s">
                <Spinner />
              </Box>
            ) : mediaItems.length === 0 ? (
              <Box color="text-body-secondary" padding={{ top: "xs" }}>
                No images uploaded for this post yet.
              </Box>
            ) : (
              <SpaceBetween size="xs">
                {mediaItems.map((img) => (
                  <div
                    key={img.filename}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: "8px",
                    }}
                  >
                    <Box>{img.filename}</Box>
                    <SpaceBetween direction="horizontal" size="xs">
                      <Button onClick={() => handleInsertExisting(img)}>Insert</Button>
                      <Button
                        variant="icon"
                        iconName="remove"
                        ariaLabel={`Delete ${img.filename}`}
                        loading={deletingFile === img.filename}
                        disabled={deletingFile !== null}
                        onClick={() => handleDeleteMedia(img.filename)}
                      />
                    </SpaceBetween>
                  </div>
                ))}
              </SpaceBetween>
            )}
          </Box>
        </SpaceBetween>
      </Modal>
    </div>
  );
}
