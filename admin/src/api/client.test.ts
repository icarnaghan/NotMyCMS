import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createApiClient, ApiRequestError } from "./client";
import type { GetAccessToken } from "./client";

describe("createApiClient", () => {
  let mockFetch: ReturnType<typeof vi.fn>;
  let getAccessToken: GetAccessToken;

  beforeEach(() => {
    mockFetch = vi.fn();
    globalThis.fetch = mockFetch as unknown as typeof fetch;
    getAccessToken = vi.fn().mockResolvedValue("test-token-123");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("auth headers", () => {
    it("attaches Authorization Bearer header with the access token", async () => {
      mockFetch.mockResolvedValue(new Response(JSON.stringify({ data: "ok" }), { status: 200 }));

      const client = createApiClient(getAccessToken);
      await client.get("/content/posts");

      expect(mockFetch).toHaveBeenCalledWith(
        "/api/content/posts",
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: "Bearer test-token-123",
          }),
        })
      );
    });

    it("does not attach Authorization header when token is null", async () => {
      const noTokenFn: GetAccessToken = vi.fn().mockResolvedValue(null);
      mockFetch.mockResolvedValue(new Response(JSON.stringify({}), { status: 200 }));

      const client = createApiClient(noTokenFn);
      await client.get("/content/posts");

      const callHeaders = mockFetch.mock.calls[0][1].headers;
      expect(callHeaders).not.toHaveProperty("Authorization");
    });
  });

  describe("HTTP methods", () => {
    beforeEach(() => {
      mockFetch.mockResolvedValue(new Response(JSON.stringify({ id: 1 }), { status: 200 }));
    });

    it("sends GET requests", async () => {
      const client = createApiClient(getAccessToken);
      const result = await client.get("/content/posts");

      expect(mockFetch).toHaveBeenCalledWith(
        "/api/content/posts",
        expect.objectContaining({ method: "GET" })
      );
      expect(result).toEqual({ id: 1 });
    });

    it("sends POST requests with body", async () => {
      const client = createApiClient(getAccessToken);
      await client.post("/deploy", { force: true });

      expect(mockFetch).toHaveBeenCalledWith(
        "/api/deploy",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ force: true }),
        })
      );
    });

    it("sends PUT requests with body", async () => {
      const client = createApiClient(getAccessToken);
      await client.put("/content/posts/my-post", { title: "Updated" });

      expect(mockFetch).toHaveBeenCalledWith(
        "/api/content/posts/my-post",
        expect.objectContaining({
          method: "PUT",
          body: JSON.stringify({ title: "Updated" }),
        })
      );
    });

    it("sends DELETE requests", async () => {
      const client = createApiClient(getAccessToken);
      await client.delete("/content/posts/my-post");

      expect(mockFetch).toHaveBeenCalledWith(
        "/api/content/posts/my-post",
        expect.objectContaining({ method: "DELETE" })
      );
    });
  });

  describe("token refresh on 401", () => {
    it("retries with a refreshed token on 401 response", async () => {
      const tokenFn = vi
        .fn()
        .mockResolvedValueOnce("expired-token")
        .mockResolvedValueOnce("fresh-token");

      mockFetch
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              code: "UNAUTHORIZED",
              message: "Token expired",
              correlationId: "abc",
            }),
            { status: 401 }
          )
        )
        .mockResolvedValueOnce(new Response(JSON.stringify({ data: "success" }), { status: 200 }));

      const client = createApiClient(tokenFn);
      const result = await client.get("/content/posts");

      expect(result).toEqual({ data: "success" });
      expect(mockFetch).toHaveBeenCalledTimes(2);

      // Second call should use the refreshed token
      const secondCallHeaders = mockFetch.mock.calls[1][1].headers;
      expect(secondCallHeaders.Authorization).toBe("Bearer fresh-token");
    });

    it("throws ApiRequestError if refresh returns the same token", async () => {
      const tokenFn = vi.fn().mockResolvedValue("same-token");

      mockFetch.mockResolvedValue(
        new Response(
          JSON.stringify({
            code: "UNAUTHORIZED",
            message: "Invalid token",
            correlationId: "xyz",
          }),
          { status: 401 }
        )
      );

      const client = createApiClient(tokenFn);

      await expect(client.get("/content/posts")).rejects.toThrow(ApiRequestError);
      // Should not retry since token didn't change
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it("throws ApiRequestError if refresh returns null", async () => {
      const tokenFn = vi.fn().mockResolvedValueOnce("expired-token").mockResolvedValueOnce(null);

      mockFetch.mockResolvedValue(
        new Response(
          JSON.stringify({
            code: "UNAUTHORIZED",
            message: "Token expired",
            correlationId: "abc",
          }),
          { status: 401 }
        )
      );

      const client = createApiClient(tokenFn);

      await expect(client.get("/content/posts")).rejects.toThrow(ApiRequestError);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });

  describe("error handling", () => {
    it("throws ApiRequestError with parsed error body on non-2xx response", async () => {
      mockFetch.mockResolvedValue(
        new Response(
          JSON.stringify({
            code: "CONTENT_NOT_FOUND",
            message: "Post not found",
            path: "/content/posts/missing",
            correlationId: "corr-123",
          }),
          { status: 404 }
        )
      );

      const client = createApiClient(getAccessToken);

      try {
        await client.get("/content/posts/missing");
        expect.fail("Should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(ApiRequestError);
        const apiError = error as ApiRequestError;
        expect(apiError.code).toBe("CONTENT_NOT_FOUND");
        expect(apiError.message).toBe("Post not found");
        expect(apiError.path).toBe("/content/posts/missing");
        expect(apiError.correlationId).toBe("corr-123");
        expect(apiError.statusCode).toBe(404);
      }
    });

    it("handles non-JSON error responses gracefully", async () => {
      mockFetch.mockResolvedValue(
        new Response("Internal Server Error", {
          status: 500,
          statusText: "Internal Server Error",
        })
      );

      const client = createApiClient(getAccessToken);

      try {
        await client.get("/content/posts");
        expect.fail("Should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(ApiRequestError);
        const apiError = error as ApiRequestError;
        expect(apiError.code).toBe("UNKNOWN_ERROR");
        expect(apiError.message).toBe("Internal Server Error");
        expect(apiError.correlationId).toBe("");
        expect(apiError.statusCode).toBe(500);
      }
    });

    it("handles 204 No Content responses", async () => {
      mockFetch.mockResolvedValue(new Response(null, { status: 204 }));

      const client = createApiClient(getAccessToken);
      const result = await client.delete("/content/posts/old-post");

      expect(result).toBeUndefined();
    });

    it("treats a 200 text/html response (CloudFront-swallowed auth failure) as an auth error", async () => {
      // CloudFront rewrites API 403/404 to 200 serving index.html. The single
      // token getter here returns the same token, so no retry succeeds.
      mockFetch.mockResolvedValue(
        new Response("<!doctype html><html></html>", {
          status: 200,
          headers: { "content-type": "text/html" },
        })
      );

      const client = createApiClient(getAccessToken);

      try {
        await client.get("/content/posts");
        expect.fail("Should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(ApiRequestError);
        const apiError = error as ApiRequestError;
        expect(apiError.code).toBe("AUTH_REQUIRED");
        expect(apiError.statusCode).toBe(403);
      }
    });
  });
});
