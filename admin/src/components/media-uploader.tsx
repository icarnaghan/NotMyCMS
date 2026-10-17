import { useCallback, useRef, useState } from "react";
import Box from "@cloudscape-design/components/box";
import Button from "@cloudscape-design/components/button";
import Icon from "@cloudscape-design/components/icon";
import ProgressBar from "@cloudscape-design/components/progress-bar";
import {
  colorBackgroundContainerContent,
  colorBackgroundItemSelected,
  colorBorderInputDefault,
  colorBorderItemFocused,
} from "@cloudscape-design/design-tokens";
import { useAuth } from "../auth/use-auth";

const ACCEPTED_EXTENSIONS = ["png", "jpg", "jpeg", "gif", "webp", "svg"];

const API_BASE_URL = "/api";

export interface MediaUploaderProps {
  contentType: "posts" | "knowledge-base";
  slug: string;
  onUploadComplete: (markdownRef: string) => void;
  onError: (message: string) => void;
}

function getFileExtension(filename: string): string {
  const parts = filename.split(".");
  return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : "";
}

function isAcceptedFormat(filename: string): boolean {
  const ext = getFileExtension(filename);
  return ACCEPTED_EXTENSIONS.includes(ext);
}

export default function MediaUploader({
  contentType,
  slug,
  onUploadComplete,
  onError,
}: MediaUploaderProps) {
  const { getAccessToken } = useAuth();
  const [isDragOver, setIsDragOver] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const uploadFile = useCallback(
    async (file: File) => {
      if (!isAcceptedFormat(file.name)) {
        onError(
          `Unsupported file format. Accepted formats: ${ACCEPTED_EXTENSIONS.join(", ").toUpperCase()}`
        );
        return;
      }

      setIsUploading(true);
      setUploadProgress(0);

      try {
        const token = await getAccessToken();
        const formData = new FormData();
        formData.append("file", file);

        const url = `${API_BASE_URL}/media/${contentType}/${slug}`;

        const xhr = new XMLHttpRequest();

        await new Promise<void>((resolve, reject) => {
          xhr.upload.addEventListener("progress", (event) => {
            if (event.lengthComputable) {
              const percent = Math.round((event.loaded / event.total) * 100);
              setUploadProgress(percent);
            }
          });

          xhr.addEventListener("load", () => {
            if (xhr.status >= 200 && xhr.status < 300) {
              resolve();
            } else {
              reject(new Error(`Upload failed with status ${xhr.status}`));
            }
          });

          xhr.addEventListener("error", () => {
            reject(new Error("Upload failed due to a network error"));
          });

          xhr.addEventListener("abort", () => {
            reject(new Error("Upload was aborted"));
          });

          xhr.open("POST", url);
          if (token) {
            xhr.setRequestHeader("Authorization", `Bearer ${token}`);
          }
          xhr.send(formData);
        });

        // Use the path returned by the server, which reflects any filename
        // sanitization (spaces/odd characters), rather than the raw file name.
        let relativePath = `images/${file.name}`;
        try {
          const parsed = JSON.parse(xhr.responseText) as { path?: string };
          if (parsed.path) relativePath = parsed.path;
        } catch {
          // Fall back to the raw name if the response isn't parseable.
        }

        const altText = file.name.replace(/\.[^.]+$/, "");
        const markdownRef = `![${altText}](${relativePath})`;
        onUploadComplete(markdownRef);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Upload failed";
        onError(message);
      } finally {
        setIsUploading(false);
        setUploadProgress(0);
      }
    },
    [contentType, slug, getAccessToken, onUploadComplete, onError]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragOver(false);

      const files = e.dataTransfer.files;
      if (files.length > 0) {
        uploadFile(files[0]);
      }
    },
    [uploadFile]
  );

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  }, []);

  const handleBrowseClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (files && files.length > 0) {
        uploadFile(files[0]);
      }
      // Reset input so the same file can be selected again
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    },
    [uploadFile]
  );

  return (
    <div>
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        style={{
          border: `2px dashed ${isDragOver ? colorBorderItemFocused : colorBorderInputDefault}`,
          borderRadius: "8px",
          padding: "24px",
          textAlign: "center",
          backgroundColor: isDragOver
            ? colorBackgroundItemSelected
            : colorBackgroundContainerContent,
          cursor: isUploading ? "default" : "pointer",
          transition: "border-color 0.2s, background-color 0.2s",
        }}
        role="button"
        aria-label="Drop zone for image upload"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            handleBrowseClick();
          }
        }}
      >
        {isUploading ? (
          <Box padding={{ vertical: "s" }}>
            <ProgressBar
              value={uploadProgress}
              label="Uploading image..."
              description={`${uploadProgress}% complete`}
            />
          </Box>
        ) : (
          <Box textAlign="center">
            <Box margin={{ bottom: "xs" }}>
              <Icon name="upload" size="big" />
            </Box>
            <Box variant="p" color="text-body-secondary">
              Drag and drop an image here
            </Box>
            <Box margin={{ top: "xs" }}>
              <Button onClick={handleBrowseClick} variant="normal">
                Browse files
              </Button>
            </Box>
            <Box variant="small" color="text-status-inactive" margin={{ top: "xs" }}>
              Accepted formats: PNG, JPG, JPEG, GIF, WebP, SVG
            </Box>
          </Box>
        )}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept={ACCEPTED_EXTENSIONS.map((ext) => `.${ext}`).join(",")}
        onChange={handleFileSelect}
        style={{ display: "none" }}
        aria-hidden="true"
      />
    </div>
  );
}
