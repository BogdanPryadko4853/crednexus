import Keycloak from "keycloak-js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SessionController, appUrl } from "./session";
import { config } from "../config";
import { currentUser } from "../test/currentUser";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

function identity() {
  const adapter = new Keycloak({
    url: config.keycloak.url,
    realm: config.keycloak.realm,
    clientId: config.keycloak.clientId,
  });
  adapter.init = vi.fn(async () => {
    adapter.authenticated = true;
    adapter.token = "test-access-token";
    return true;
  });
  adapter.updateToken = vi.fn(async () => false);
  adapter.clearToken = vi.fn(() => {
    delete adapter.token;
    adapter.authenticated = false;
    adapter.onAuthLogout?.();
  });
  return adapter;
}

describe("Authentication session", () => {
  it("initializes once with PKCE and loads the actual backend profile", async () => {
    const adapter = identity();
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json(currentUser));
    vi.stubGlobal("fetch", fetcher);
    const session = new SessionController(() => adapter);
    await Promise.all([session.initialize(), session.initialize()]);
    expect(adapter.init).toHaveBeenCalledOnce();
    expect(adapter.init).toHaveBeenCalledWith(
      expect.objectContaining({ pkceMethod: "S256", flow: "standard" }),
    );
    expect(session.getSnapshot()).toEqual({
      status: "authenticated",
      user: currentUser,
    });
    expect(fetcher).toHaveBeenCalledOnce();
    expect(localStorage.getItem("access_token")).toBeNull();
    expect(localStorage.getItem("refresh_token")).toBeNull();
  });
  it("clears profile and credentials if refresh fails", async () => {
    const adapter = identity();
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>().mockResolvedValue(Response.json(currentUser)),
    );
    const session = new SessionController(() => adapter);
    await session.initialize();
    adapter.updateToken = vi.fn(async () => {
      throw new Error("Refresh failed");
    });
    await expect(session.getToken()).rejects.toMatchObject({ status: 401 });
    expect(session.getSnapshot()).toMatchObject({
      status: "anonymous",
      expired: true,
    });
    expect(adapter.token).toBeUndefined();
  });
  it("shows a profile error when backend data is unavailable or invalid", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn<typeof fetch>()
        .mockResolvedValue(Response.json({ fullName: "Incomplete profile" })),
    );
    const session = new SessionController(identity);
    await session.initialize();
    expect(session.getSnapshot()).toEqual({
      status: "error",
      source: "profile",
    });
  });
  it("handles backend 401 as an expired session", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn<typeof fetch>()
        .mockResolvedValue(new Response(null, { status: 401 })),
    );
    const session = new SessionController(identity);
    await session.initialize();
    expect(session.getSnapshot()).toMatchObject({
      status: "anonymous",
      expired: true,
    });
  });
  it("rejects open redirects and accepts an internal return path", () => {
    expect(appUrl("//other.test/path")).toBe(
      new URL("/dashboard", location.origin).href,
    );
    expect(appUrl("/profile?section=account")).toBe(
      new URL("/profile?section=account", location.origin).href,
    );
    expect(appUrl("/\\other.test/path")).toBe(
      new URL("/dashboard", location.origin).href,
    );
  });
  it("does not restore a profile after the session has been cleared", async () => {
    let finish: (response: Response) => void = () => undefined;
    const pending = new Promise<Response>((resolve) => {
      finish = resolve;
    });
    const fetcher = vi.fn<typeof fetch>().mockReturnValue(pending);
    vi.stubGlobal("fetch", fetcher);
    const adapter = identity();
    const session = new SessionController(() => adapter);
    const initialization = session.initialize();
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledOnce());
    session.invalidate();
    finish(Response.json(currentUser));
    await initialization;
    expect(session.getSnapshot()).toMatchObject({ status: "anonymous" });
    expect(adapter.token).toBeUndefined();
  });
  it("clears credentials before navigating to the Keycloak logout endpoint", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>().mockResolvedValue(Response.json(currentUser)),
    );
    const assign = vi.fn();
    vi.stubGlobal("window", { location: { origin: location.origin, assign } });
    const adapter = identity();
    const target = `${config.keycloak.url}/realms/${config.keycloak.realm}/protocol/openid-connect/logout`;
    adapter.createLogoutUrl = vi.fn(() => target);
    const session = new SessionController(() => adapter);
    await session.initialize();
    assign.mockImplementation(() => {
      expect(adapter.token).toBeUndefined();
      expect(session.getSnapshot()).toEqual({ status: "anonymous" });
    });
    await session.logout();
    expect(adapter.createLogoutUrl).toHaveBeenCalledWith({
      redirectUri: appUrl("/login"),
    });
    expect(assign).toHaveBeenCalledWith(target);
  });
  it("stops initialization when the identity server does not respond", async () => {
    vi.useFakeTimers();
    const adapter = identity();
    adapter.init = vi.fn(() => new Promise<boolean>(() => undefined));
    const session = new SessionController(() => adapter);
    const initialization = session.initialize();
    await vi.advanceTimersByTimeAsync(config.keycloak.initializationTimeoutMs);
    await initialization;
    expect(session.getSnapshot()).toEqual({
      status: "error",
      source: "identity",
    });
  });
});
