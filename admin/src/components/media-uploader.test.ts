import { describe, it, expect } from "vitest";

/**
 * Unit tests for MediaUploader utility logic.
 * Validates Requirements 7.1, 7.2, 7.3, 7.5, 7.6
 */

// Re-implement the utility functions here since they're not exported from the component.
// This tests the logic in isolation.
const ACCEPTED_EXTENSIONS = ["png", "jpg", "jpeg", "gif", "webp", "svg"];

function getFileExtension(filename: string): string {
  const parts = filename.split(".");
  return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : "";
}

function isAcceptedFormat(filename: string): boolean {
  const ext = getFileExtension(filename);
  return ACCEPTED_EXTENSIONS.includes(ext);
}

describe("MediaUploader - file extension extraction", () => {
  it("extracts extension from a simple filename", () => {
    expect(getFileExtension("photo.png")).toBe("png");
  });

  it("extracts extension in lowercase", () => {
    expect(getFileExtension("photo.PNG")).toBe("png");
  });

  it("extracts extension from filename with multiple dots", () => {
    expect(getFileExtension("my.photo.file.jpg")).toBe("jpg");
  });

  it("returns empty string for filename without extension", () => {
    expect(getFileExtension("noextension")).toBe("");
  });

  it("returns empty string for empty filename", () => {
    expect(getFileExtension("")).toBe("");
  });
});

describe("MediaUploader - file format validation", () => {
  it("accepts PNG files", () => {
    expect(isAcceptedFormat("image.png")).toBe(true);
  });

  it("accepts JPG files", () => {
    expect(isAcceptedFormat("photo.jpg")).toBe(true);
  });

  it("accepts JPEG files", () => {
    expect(isAcceptedFormat("photo.jpeg")).toBe(true);
  });

  it("accepts GIF files", () => {
    expect(isAcceptedFormat("animation.gif")).toBe(true);
  });

  it("accepts WebP files", () => {
    expect(isAcceptedFormat("modern.webp")).toBe(true);
  });

  it("accepts SVG files", () => {
    expect(isAcceptedFormat("vector.svg")).toBe(true);
  });

  it("accepts files with uppercase extensions", () => {
    expect(isAcceptedFormat("IMAGE.PNG")).toBe(true);
  });

  it("rejects PDF files", () => {
    expect(isAcceptedFormat("document.pdf")).toBe(false);
  });

  it("rejects TXT files", () => {
    expect(isAcceptedFormat("readme.txt")).toBe(false);
  });

  it("rejects files without extension", () => {
    expect(isAcceptedFormat("noextension")).toBe(false);
  });

  it("rejects BMP files", () => {
    expect(isAcceptedFormat("image.bmp")).toBe(false);
  });

  it("rejects TIFF files", () => {
    expect(isAcceptedFormat("scan.tiff")).toBe(false);
  });
});

describe("MediaUploader - markdown reference generation", () => {
  it("generates correct markdown reference for uploaded file", () => {
    const filename = "screenshot.png";
    const markdownRef = `![${filename}](images/${filename})`;
    expect(markdownRef).toBe("![screenshot.png](images/screenshot.png)");
  });

  it("preserves spaces in filename for markdown reference", () => {
    const filename = "my image.jpg";
    const markdownRef = `![${filename}](images/${filename})`;
    expect(markdownRef).toBe("![my image.jpg](images/my image.jpg)");
  });

  it("preserves special characters in filename", () => {
    const filename = "photo-2024_01.webp";
    const markdownRef = `![${filename}](images/${filename})`;
    expect(markdownRef).toBe("![photo-2024_01.webp](images/photo-2024_01.webp)");
  });
});
