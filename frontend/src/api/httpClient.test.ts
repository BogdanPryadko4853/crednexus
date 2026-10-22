import { afterEach, describe, expect, it, vi } from "vitest";
import { createApiClient } from "./httpClient";

afterEach(() => vi.useRealTimers());

function client(
  fetcher: typeof fetch,
  onUnauthorized = vi.fn(),
  timeoutMs = 1000,
) {
  return createApiClient({
    baseUrl: "/api",
    timeoutMs,
    getToken: async () => "test-access-token",
    onUnauthorized,
    fetcher,
  });
}

describe("HTTP client", () => {
  it("uses the configured API prefix and a fresh bearer token", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json({ ok: true }));
    expect(await client(fetcher).request("/users/me")).toEqual({ ok: true });
    expect(fetcher.mock.calls[0]?.[0]).toBe("/api/users/me");
    expect(
      new Headers(fetcher.mock.calls[0]?.[1]?.headers).get("Authorization"),
    ).toBe("Bearer test-access-token");
  });
  it.each([400, 403, 404, 409, 500])(
    "preserves HTTP %i without repeating a mutation",
    async (status) => {
      const fetcher = vi
        .fn<typeof fetch>()
        .mockResolvedValue(new Response(null, { status }));
      await expect(
        client(fetcher).request("/resource", {
          method: "POST",
          body: { value: 1 },
        }),
      ).rejects.toMatchObject({ kind: "http", status });
      expect(fetcher).toHaveBeenCalledOnce();
    },
  );
  it("invalidates the session on 401 without replaying the request", async () => {
    const expired = vi.fn();
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(null, { status: 401 }));
    await expect(
      client(fetcher, expired).request("/users/me"),
    ).rejects.toMatchObject({ status: 401 });
    expect(expired).toHaveBeenCalledOnce();
    expect(fetcher).toHaveBeenCalledOnce();
  });
  it("rejects external resources before obtaining or sending credentials", async () => {
    const fetcher = vi.fn<typeof fetch>();
    await expect(
      client(fetcher).request("//other.test/collect"),
    ).rejects.toThrow("relative path");
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("aborts timed out requests", async () => {
    vi.useFakeTimers();
    const fetcher = vi
      .fn<typeof fetch>()
      .mockImplementation(
        (_url, options) =>
          new Promise((_resolve, reject) =>
            options?.signal?.addEventListener("abort", () =>
              reject(new DOMException("Aborted", "AbortError")),
            ),
          ),
      );
    const result = expect(
      client(fetcher).request("/users/me"),
    ).rejects.toMatchObject({ kind: "timeout" });
    await vi.advanceTimersByTimeAsync(1000);
    await result;
  });
  it("cancels a stale request and does not label it a network error", async () => {
    const controller = new AbortController();
    controller.abort();
    const fetcher = vi.fn<typeof fetch>();
    await expect(
      client(fetcher).request("/users/me", { signal: controller.signal }),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(fetcher).not.toHaveBeenCalled();
  });
});
