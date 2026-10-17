/**
 * API client with automatic auth token attachment and error handling.
 *
 * This is a non-hook utility that accepts a `getAccessToken` function,
 * so it can be used both inside and outside React components.
 */

const API_BASE_URL = "/api";

/**
 * Structured API error matching the backend error response format.
 */
export interface ApiError {
  code: string;
  message: string;
  path?: string;
  correlationId: string;
}

/**
 * Custom error class that wraps the API error response.
 * Thrown on non-2xx responses so the UI can catch and display details.
 */
export class ApiRequestError extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly path?: string;
  public readonly correlationId: string;

  constructor(statusCode: number, apiError: ApiError) {
    super(apiError.message);
    this.name = "ApiRequestError";
    this.code = apiError.code;
    this.statusCode = statusCode;
    this.path = apiError.path;
    this.correlationId = apiError.correlationId;
  }
}

/**
 * Function signature for retrieving the current access token.
 * Returns null if no token is available (user not authenticated).
 */
export type GetAccessToken = () => Promise<string | null>;

/**
 * Options for individual API requests.
 */
export interface RequestOptions {
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
  signal?: AbortSignal;
}

/**
 * Creates an API client bound to a token provider.
 *
 * Usage:
 * ```ts
 * const client = createApiClient(getAccessToken);
 * const posts = await client.get('/content/posts');
 * ```
 */
export function createApiClient(getAccessToken: GetAccessToken) {
  /**
   * Core request function that attaches auth headers and handles errors.
   * On a 401 response, it refreshes the token and retries once.
   */
  async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const { method = "GET", body, headers = {}, signal } = options;

    const token = await getAccessToken();

    const response = await makeRequest(path, {
      method,
      body,
      headers,
      signal,
      token,
    });

    // On 401 — or when CloudFront has swallowed an auth failure by rewriting
    // the API 403/404 to a 200 serving the SPA's index.html (see the
    // distribution errorResponses in site-stack.ts) — attempt a token refresh
    // and retry once.
    if (response.status === 401 || isSwallowedAuthError(response)) {
      const refreshedToken = await getAccessToken();

      if (refreshedToken && refreshedToken !== token) {
        const retryResponse = await makeRequest(path, {
          method,
          body,
          headers,
          signal,
          token: refreshedToken,
        });

        return handleResponse<T>(retryResponse);
      }

      // Refresh didn't produce a new token — surface a clear auth error.
      return handleResponse<T>(response);
    }

    return handleResponse<T>(response);
  }

  return {
    get<T>(path: string, options?: Omit<RequestOptions, "method" | "body">) {
      return request<T>(path, { ...options, method: "GET" });
    },

    post<T>(path: string, body?: unknown, options?: Omit<RequestOptions, "method" | "body">) {
      return request<T>(path, { ...options, method: "POST", body });
    },

    put<T>(path: string, body?: unknown, options?: Omit<RequestOptions, "method" | "body">) {
      return request<T>(path, { ...options, method: "PUT", body });
    },

    delete<T>(path: string, options?: Omit<RequestOptions, "method" | "body">) {
      return request<T>(path, { ...options, method: "DELETE" });
    },
  };
}

/**
 * Convenience hook-compatible type for the API client instance.
 */
export type ApiClient = ReturnType<typeof createApiClient>;

// --- Internal helpers ---

interface InternalRequestOptions {
  method: string;
  body?: unknown;
  headers: Record<string, string>;
  signal?: AbortSignal;
  token: string | null;
}

async function makeRequest(
  path: string,
  { method, body, headers, signal, token }: InternalRequestOptions
): Promise<Response> {
  const url = `${API_BASE_URL}${path}`;

  const requestHeaders: Record<string, string> = {
    "Content-Type": "application/json",
    ...headers,
  };

  if (token) {
    requestHeaders["Authorization"] = `Bearer ${token}`;
  }

  const fetchOptions: RequestInit = {
    method,
    headers: requestHeaders,
    signal,
  };

  if (body !== undefined && method !== "GET") {
    fetchOptions.body = JSON.stringify(body);
  }

  return fetch(url, fetchOptions);
}

/**
 * Detects a 200 response that is actually a swallowed auth failure: CloudFront
 * rewrites API 403/404 to 200 serving index.html, so a "successful" HTML
 * response to a JSON API call means the request never reached the API.
 */
function isSwallowedAuthError(response: Response): boolean {
  if (!response.ok) return false;
  if (response.status === 204) return false;
  const contentType = response.headers.get("content-type") ?? "";
  return contentType.includes("text/html");
}

async function handleResponse<T>(response: Response): Promise<T> {
  if (response.ok) {
    // Handle 204 No Content
    if (response.status === 204) {
      return undefined as T;
    }
    // A 200 carrying HTML is a CloudFront-swallowed auth failure, not data.
    if (isSwallowedAuthError(response)) {
      throw new ApiRequestError(403, {
        code: "AUTH_REQUIRED",
        message: "Your session has expired or you are not authorized. Please sign in again.",
        correlationId: "",
      });
    }
    return response.json() as Promise<T>;
  }

  // Parse error response into ApiError structure
  let apiError: ApiError;

  try {
    const errorBody = await response.json();
    apiError = {
      code: errorBody.code ?? "UNKNOWN_ERROR",
      message: errorBody.message ?? response.statusText,
      path: errorBody.path,
      correlationId: errorBody.correlationId ?? "",
    };
  } catch {
    // Response body isn't valid JSON
    apiError = {
      code: "UNKNOWN_ERROR",
      message: response.statusText || `Request failed with status ${response.status}`,
      correlationId: "",
    };
  }

  throw new ApiRequestError(response.status, apiError);
}
