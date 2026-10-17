import { describe, it, expect, vi, beforeEach } from "vitest";
import { listContent, getContent, saveContent, deleteContent } from "./content";
import type { ApiClient } from "./client";
import type { ContentItem, ContentSaveData } from "./content";

function createMockClient(): ApiClient {
  return {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  } as unknown as ApiClient;
}

const sampleItem: ContentItem = {
  slug: "my-first-post",
  type: "posts",
  title: "My First Post",
  date: "2024-01-15",
  description: "A sample post",
  author: "Ian",
  categories: ["tech"],
  tags: ["javascript", "react"],
  draft: false,
  images: ["hero.png"],
  lastModified: "2024-01-15T10:00:00Z",
};

describe("content API client", () => {
  let client: ApiClient;

  beforeEach(() => {
    client = createMockClient();
  });

  describe("listContent", () => {
    it("calls GET /content/{type} for posts", async () => {
      const items = [sampleItem];
      vi.mocked(client.get).mockResolvedValue(items);

      const result = await listContent(client, "posts");

      expect(client.get).toHaveBeenCalledWith("/content/posts");
      expect(result).toEqual(items);
    });

    it("calls GET /content/{type} for knowledge-base", async () => {
      vi.mocked(client.get).mockResolvedValue([]);

      const result = await listContent(client, "knowledge-base");

      expect(client.get).toHaveBeenCalledWith("/content/knowledge-base");
      expect(result).toEqual([]);
    });
  });

  describe("getContent", () => {
    it("calls GET /content/{type}/{slug} and returns item with body", async () => {
      const itemWithBody: ContentItem = {
        ...sampleItem,
        body: "# Hello World\n\nThis is my post.",
      };
      vi.mocked(client.get).mockResolvedValue(itemWithBody);

      const result = await getContent(client, "posts", "my-first-post");

      expect(client.get).toHaveBeenCalledWith("/content/posts/my-first-post");
      expect(result).toEqual(itemWithBody);
      expect(result.body).toBe("# Hello World\n\nThis is my post.");
    });
  });

  describe("saveContent", () => {
    const saveData: ContentSaveData = {
      title: "My First Post",
      date: "2024-01-15",
      description: "A sample post",
      author: "Ian",
      categories: ["tech"],
      tags: ["javascript", "react"],
      draft: false,
      body: "# Hello World",
    };

    it("calls PUT /content/{type}/{slug} when slug is provided (update)", async () => {
      vi.mocked(client.put).mockResolvedValue(sampleItem);

      const result = await saveContent(client, "posts", "my-first-post", saveData);

      expect(client.put).toHaveBeenCalledWith("/content/posts/my-first-post", saveData);
      expect(result).toEqual(sampleItem);
    });

    it("calls PUT /content/{type} when slug is null (create)", async () => {
      vi.mocked(client.put).mockResolvedValue(sampleItem);

      const result = await saveContent(client, "posts", null, saveData);

      expect(client.put).toHaveBeenCalledWith("/content/posts", saveData);
      expect(result).toEqual(sampleItem);
    });

    it("calls PUT /content/{type} when slug is undefined (create)", async () => {
      vi.mocked(client.put).mockResolvedValue(sampleItem);

      const result = await saveContent(client, "posts", undefined, saveData);

      expect(client.put).toHaveBeenCalledWith("/content/posts", saveData);
      expect(result).toEqual(sampleItem);
    });
  });

  describe("deleteContent", () => {
    it("calls DELETE /content/{type}/{slug}", async () => {
      vi.mocked(client.delete).mockResolvedValue(undefined);

      await deleteContent(client, "posts", "my-first-post");

      expect(client.delete).toHaveBeenCalledWith("/content/posts/my-first-post");
    });
  });
});
