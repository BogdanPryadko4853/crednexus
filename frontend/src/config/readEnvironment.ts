export type Environment = Record<string, string | undefined>;

function choice<const T extends string>(
  env: Environment,
  key: string,
  fallback: T,
  allowed: readonly T[],
): T {
  const value = env[key] ?? fallback;
  const match = allowed.find((item) => item === value);
  if (!match) throw new Error(`Invalid ${key}: expected ${allowed.join(", ")}`);
  return match;
}

function positiveInteger(
  env: Environment,
  key: string,
  fallback: number,
  maximum: number,
) {
  const raw = env[key];
  const value = raw === undefined ? fallback : Number(raw);
  if (
    (raw !== undefined && !/^\d+$/.test(raw)) ||
    !Number.isSafeInteger(value) ||
    value < 1 ||
    value > maximum
  ) {
    throw new Error(
      `Invalid ${key}: expected an integer between 1 and ${maximum}`,
    );
  }
  return value;
}

function host(env: Environment, key: string) {
  const value = env[key] ?? "localhost";
  if (!value.trim() || /\s|[/?#]/.test(value))
    throw new Error(`Invalid ${key}: expected a hostname or IP address`);
  return value;
}

export function readEnvironment(env: Environment) {
  const basePath = env.VITE_BASE_PATH ?? "/";
  if (!/^\/(?:[a-zA-Z0-9_-]+\/)*$/.test(basePath))
    throw new Error(
      "Invalid VITE_BASE_PATH: expected an absolute path ending with /",
    );
  const purposeIds = [
    ...new Set(
      (env.VITE_FINANCING_PURPOSES ?? "working-capital,equipment")
        .split(",")
        .map((value) => value.trim()),
    ),
  ];
  if (
    purposeIds.length === 0 ||
    purposeIds.some((id) => !["working-capital", "equipment"].includes(id))
  )
    throw new Error(
      "Invalid VITE_FINANCING_PURPOSES: expected supported purpose IDs",
    );
  return {
    api: {
      baseUrl: pathPrefix(env.VITE_API_BASE_URL ?? "/api", "VITE_API_BASE_URL"),
      currentUserPath: pathPrefix(
        env.VITE_CURRENT_USER_PATH ?? "/users/me",
        "VITE_CURRENT_USER_PATH",
      ),
      timeoutMs: positiveInteger(env, "VITE_API_TIMEOUT_MS", 15000, 120000),
      proxyTarget: httpUrl(
        env.VITE_API_PROXY_TARGET ?? "http://localhost:8080",
        "VITE_API_PROXY_TARGET",
      ),
      proxyPath: pathPrefix(
        env.VITE_API_PROXY_PATH ?? "/api",
        "VITE_API_PROXY_PATH",
      ),
    },
    keycloak: {
      url: httpUrl(
        env.VITE_KEYCLOAK_URL ?? "http://localhost:8081",
        "VITE_KEYCLOAK_URL",
      ),
      realm: identifier(
        env.VITE_KEYCLOAK_REALM ?? "crednexus",
        "VITE_KEYCLOAK_REALM",
      ),
      clientId: identifier(
        env.VITE_KEYCLOAK_CLIENT_ID ?? "crednexus-frontend",
        "VITE_KEYCLOAK_CLIENT_ID",
      ),
      minimumValiditySeconds: positiveInteger(
        env,
        "VITE_TOKEN_MIN_VALIDITY_SECONDS",
        30,
        300,
      ),
      initializationTimeoutMs: positiveInteger(
        env,
        "VITE_AUTH_TIMEOUT_MS",
        20000,
        120000,
      ),
    },
    locale: choice(env, "VITE_APP_LOCALE", "ru", ["ru", "en"]),
    basePath,
    server: {
      host: host(env, "VITE_DEV_HOST"),
      port: positiveInteger(env, "VITE_DEV_PORT", 5173, 65535),
      strictPort:
        choice(env, "VITE_STRICT_PORT", "true", ["true", "false"]) === "true",
    },
    preview: {
      host: host(env, "VITE_PREVIEW_HOST"),
      port: positiveInteger(env, "VITE_PREVIEW_PORT", 4173, 65535),
      strictPort:
        choice(env, "VITE_STRICT_PORT", "true", ["true", "false"]) === "true",
    },
    creditInputLimits: {
      company: positiveInteger(env, "VITE_COMPANY_MAX_LENGTH", 255, 1000),
      comment: positiveInteger(env, "VITE_COMMENT_MAX_LENGTH", 500, 10000),
      amountIntegerDigits: positiveInteger(
        env,
        "VITE_AMOUNT_INTEGER_DIGITS",
        17,
        30,
      ),
      amountFractionDigits: positiveInteger(
        env,
        "VITE_AMOUNT_FRACTION_DIGITS",
        2,
        8,
      ),
      legalInnDigits: positiveInteger(env, "VITE_LEGAL_INN_DIGITS", 10, 32),
      soleInnDigits: positiveInteger(env, "VITE_SOLE_INN_DIGITS", 12, 32),
    },
    purposeIds,
  };
}

function pathPrefix(value: string, key: string) {
  if (!/^\/(?:[a-zA-Z0-9_-]+\/?)+$/.test(value))
    throw new Error(`Invalid ${key}: expected an absolute API path`);
  return value.replace(/\/$/, "");
}

function httpUrl(value: string, key: string) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`Invalid ${key}: expected an HTTP(S) URL`);
  }
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  )
    throw new Error(
      `Invalid ${key}: expected an HTTP(S) URL without credentials, query or fragment`,
    );
  return value.replace(/\/$/, "");
}

function identifier(value: string, key: string) {
  if (!/^[a-zA-Z0-9_.-]+$/.test(value))
    throw new Error(`Invalid ${key}: expected a non-empty identifier`);
  return value;
}
