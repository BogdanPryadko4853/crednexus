import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  delete window.__CREDNEXUS_ENV__;
  vi.resetModules();
});

describe("Container runtime settings", () => {
  it("overrides build settings without rebuilding assets", async () => {
    window.__CREDNEXUS_ENV__ = {
      VITE_APP_LOCALE: "en",
      VITE_COMMENT_MAX_LENGTH: "750",
    };
    vi.resetModules();
    const { config } = await import("./index");
    expect(config.locale).toBe("en");
    expect(config.creditInputLimits.comment).toBe(750);
  });
});
