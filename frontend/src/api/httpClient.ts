export type ApiErrorKind = "http" | "network" | "timeout" | "invalidResponse";

export class ApiError extends Error {
  readonly kind: ApiErrorKind;
  readonly status: number;
  constructor(kind: ApiErrorKind, status = 0) {
    super(`API request failed: ${kind}${status ? ` (${status})` : ""}`);
    this.name = "ApiError";
    this.kind = kind;
    this.status = status;
  }
}

type ApiClientOptions = {
  baseUrl: string;
  timeoutMs: number;
  getToken: () => Promise<string>;
  onUnauthorized: () => void;
  fetcher?: typeof fetch;
};

export function createApiClient({
  baseUrl,
  timeoutMs,
  getToken,
  onUnauthorized,
  fetcher = fetch,
}: ApiClientOptions) {
  return {
    async request<T>(
      path: string,
      options: Omit<RequestInit, "body"> & { body?: unknown } = {},
    ): Promise<T> {
      if (
        !path.startsWith("/") ||
        path.startsWith("//") ||
        path.includes("..") ||
        path.includes("://")
      )
        throw new Error(
          "API resource must be a relative path within the configured API",
        );
      const controller = new AbortController();
      const abort = () => controller.abort();
      options.signal?.addEventListener("abort", abort, { once: true });
      if (options.signal?.aborted) controller.abort();
      const timeout = setTimeout(abort, timeoutMs);
      try {
        const token = await getToken();
        if (controller.signal.aborted)
          throw new DOMException("Request aborted", "AbortError");
        const headers = new Headers(options.headers);
        headers.set("Authorization", `Bearer ${token}`);
        headers.set("Accept", "application/json");
        if (options.body !== undefined && !(options.body instanceof FormData))
          headers.set("Content-Type", "application/json");
        const { body, ...requestOptions } = options;
        const response = await fetcher(`${baseUrl}${path}`, {
          ...requestOptions,
          headers,
          signal: controller.signal,
          ...(body === undefined
            ? {}
            : { body: body instanceof FormData ? body : JSON.stringify(body) }),
        });
        if (response.status === 401) onUnauthorized();
        if (!response.ok) throw new ApiError("http", response.status);
        if (response.status === 204) return undefined as T;
        try {
          return (await response.json()) as T;
        } catch {
          throw new ApiError("invalidResponse", response.status);
        }
      } catch (error) {
        if (options.signal?.aborted) throw error;
        if (error instanceof ApiError) throw error;
        throw new ApiError(controller.signal.aborted ? "timeout" : "network");
      } finally {
        clearTimeout(timeout);
        options.signal?.removeEventListener("abort", abort);
      }
    },
  };
}
