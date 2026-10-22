import Keycloak from "keycloak-js";
import { config } from "../config";
import { ApiError, createApiClient } from "../api/httpClient";
import { isCurrentUser } from "../features/profile/model/currentUser";
import type { CurrentUser } from "../features/profile/model/currentUser";
import { routes } from "../config/routes";

export type SessionState =
  | { status: "initializing" }
  | { status: "anonymous"; expired?: boolean }
  | { status: "authenticated"; user: CurrentUser }
  | { status: "error"; source: "identity" | "profile" };

export class SessionController {
  private state: SessionState = { status: "initializing" };
  private readonly listeners = new Set<() => void>();
  private client: Keycloak | undefined;
  private initialization: Promise<void> | undefined;
  private generation = 0;

  private readonly createClient: () => Keycloak;
  constructor(
    createClient = () =>
      new Keycloak({
        url: config.keycloak.url,
        realm: config.keycloak.realm,
        clientId: config.keycloak.clientId,
      }),
  ) {
    this.createClient = createClient;
  }

  getSnapshot = () => this.state;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private publish(state: SessionState) {
    this.state = state;
    this.listeners.forEach((listener) => listener());
  }

  invalidate = () => {
    this.generation++;
    this.publish({ status: "anonymous", expired: true });
    this.client?.clearToken();
  };

  getToken = async (): Promise<string> => {
    const client = this.client;
    const generation = this.generation;
    if (!client?.authenticated) throw new ApiError("http", 401);
    try {
      await client.updateToken(config.keycloak.minimumValiditySeconds);
      if (generation !== this.generation || client !== this.client)
        throw new Error("Authentication session changed during token refresh");
      if (!client.token) throw new Error("Access token is unavailable");
      return client.token;
    } catch {
      if (generation === this.generation && client === this.client)
        this.invalidate();
      throw new ApiError("http", 401);
    }
  };

  readonly api = createApiClient({
    ...config.api,
    getToken: this.getToken,
    onUnauthorized: this.invalidate,
  });

  private async loadProfile(generation: number) {
    const user = await this.api.request<unknown>(config.api.currentUserPath);
    if (!isCurrentUser(user)) throw new ApiError("invalidResponse");
    if (generation === this.generation)
      this.publish({ status: "authenticated", user });
  }

  initialize = (): Promise<void> => {
    if (this.initialization) return this.initialization;
    const generation = ++this.generation;
    this.publish({ status: "initializing" });
    const client = this.client?.authenticated
      ? this.client
      : this.createClient();
    this.client = client;
    client.onAuthLogout = () => {
      if (generation === this.generation) {
        this.generation++;
        this.publish({ status: "anonymous" });
      }
    };
    client.onAuthRefreshError = () => {
      if (generation === this.generation) this.invalidate();
    };
    client.onTokenExpired = () => {
      if (generation === this.generation)
        void this.getToken().catch(() => undefined);
    };
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const ready = client.authenticated
      ? Promise.resolve(true)
      : client.init({
          onLoad: "check-sso",
          pkceMethod: "S256",
          flow: "standard",
          checkLoginIframe: false,
          enableLogging: false,
        });
    this.initialization = Promise.race([
      ready,
      new Promise<never>((_, reject) => {
        timeout = setTimeout(
          () => reject(new Error("Authentication initialization timed out")),
          config.keycloak.initializationTimeoutMs,
        );
      }),
    ])
      .then(async (authenticated) => {
        if (generation !== this.generation) return;
        if (authenticated) await this.loadProfile(generation);
        else this.publish({ status: "anonymous" });
      })
      .catch(() => {
        if (generation === this.generation)
          this.publish({
            status: "error",
            source: client.authenticated ? "profile" : "identity",
          });
      })
      .finally(() => {
        clearTimeout(timeout);
        this.initialization = undefined;
      });
    return this.initialization;
  };

  login = async (returnTo: string) => {
    if (!this.client)
      throw new Error("Authentication client is not initialized");
    await this.client.login({
      redirectUri: appUrl(returnTo),
      locale: config.locale,
    });
  };

  logout = async () => {
    const client = this.client;
    if (!client) return;
    const logoutUrl = client.createLogoutUrl({
      redirectUri: appUrl(routes.login),
    });
    this.generation++;
    client.clearToken();
    this.publish({ status: "anonymous" });
    window.location.assign(logoutUrl);
  };
}

export function appUrl(path: string) {
  const safePath =
    path.startsWith("/") && !path.startsWith("//") ? path : routes.dashboard;
  const url = new URL(
    `${config.basePath.replace(/\/$/, "")}${safePath}`,
    window.location.origin,
  );
  if (
    url.origin !== window.location.origin ||
    !url.pathname.startsWith(config.basePath)
  )
    return new URL(
      `${config.basePath.replace(/\/$/, "")}${routes.dashboard}`,
      window.location.origin,
    ).href;
  return url.href;
}

export const session = new SessionController();
