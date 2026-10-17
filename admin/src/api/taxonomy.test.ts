import { describe, it, expect, vi } from "vitest";
import { getTaxonomy, renameTaxonomy, mergeTaxonomy, deleteTaxonomy } from "./taxonomy";
import type { ApiClient } from "./client";

function createMockClient(): ApiClient {
  return {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  };
}

describe("taxonomy API client", () => {
  describe("getTaxonomy", () => {
    it("calls GET /taxonomy and returns items", async () => {
      const client = createMockClient();
      const mockData = [
        { name: "JavaScript", type: "tag" as const, count: 42 },
        { name: "Tutorials", type: "category" as const, count: 15 },
      ];
      vi.mocked(client.get).mockResolvedValue(mockData);

      const result = await getTaxonomy(client);

      expect(client.get).toHaveBeenCalledWith("/taxonomy");
      expect(result).toEqual(mockData);
    });
  });

  describe("renameTaxonomy", () => {
    it("calls PUT /taxonomy/rename with type, oldName, and newName", async () => {
      const client = createMockClient();
      vi.mocked(client.put).mockResolvedValue(undefined);

      await renameTaxonomy(client, "tag", "JS", "JavaScript");

      expect(client.put).toHaveBeenCalledWith("/taxonomy/rename", {
        type: "tag",
        oldName: "JS",
        newName: "JavaScript",
      });
    });

    it("sends category type for category rename", async () => {
      const client = createMockClient();
      vi.mocked(client.put).mockResolvedValue(undefined);

      await renameTaxonomy(client, "category", "Dev", "Development");

      expect(client.put).toHaveBeenCalledWith("/taxonomy/rename", {
        type: "category",
        oldName: "Dev",
        newName: "Development",
      });
    });
  });

  describe("mergeTaxonomy", () => {
    it("calls PUT /taxonomy/merge with type, source, and target", async () => {
      const client = createMockClient();
      vi.mocked(client.put).mockResolvedValue(undefined);

      await mergeTaxonomy(client, "tag", "JS", "JavaScript");

      expect(client.put).toHaveBeenCalledWith("/taxonomy/merge", {
        type: "tag",
        source: "JS",
        target: "JavaScript",
      });
    });
  });

  describe("deleteTaxonomy", () => {
    it("calls DELETE /taxonomy/{name}?type=tag", async () => {
      const client = createMockClient();
      vi.mocked(client.delete).mockResolvedValue(undefined);

      await deleteTaxonomy(client, "tag", "obsolete-tag");

      expect(client.delete).toHaveBeenCalledWith("/taxonomy/obsolete-tag?type=tag");
    });

    it("encodes special characters in the name", async () => {
      const client = createMockClient();
      vi.mocked(client.delete).mockResolvedValue(undefined);

      await deleteTaxonomy(client, "category", "C++ & More");

      expect(client.delete).toHaveBeenCalledWith(
        `/taxonomy/${encodeURIComponent("C++ & More")}?type=category`
      );
    });
  });
});
