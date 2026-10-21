import { describe, expect, it } from "vitest";
import { readEnvironment } from "./readEnvironment";

describe("Environment configuration", () => {
  it("starts with defaults without an env file", () => {
    const config = readEnvironment({});
    expect(config.locale).toBe("ru");
    expect(config.server.port).toBe(5173);
    expect(config.creditInputLimits.comment).toBe(500);
  });
  it("overrides locale, paths, server settings and form constraints", () => {
    const config = readEnvironment({
      VITE_APP_LOCALE: "en",
      VITE_BASE_PATH: "/portal/",
      VITE_DEV_HOST: "0.0.0.0",
      VITE_DEV_PORT: "5200",
      VITE_PREVIEW_PORT: "4200",
      VITE_STRICT_PORT: "false",
      VITE_COMMENT_MAX_LENGTH: "750",
      VITE_AMOUNT_FRACTION_DIGITS: "3",
      VITE_FINANCING_PURPOSES: "equipment",
    });
    expect(config.locale).toBe("en");
    expect(config.basePath).toBe("/portal/");
    expect(config.server).toEqual({
      host: "0.0.0.0",
      port: 5200,
      strictPort: false,
    });
    expect(config.preview.port).toBe(4200);
    expect(config.creditInputLimits.comment).toBe(750);
    expect(config.creditInputLimits.amountFractionDigits).toBe(3);
    expect(config.purposeIds).toEqual(["equipment"]);
  });
  it.each([
    ["VITE_APP_LOCALE", "de"],
    ["VITE_DEV_PORT", "NaN"],
    ["VITE_PREVIEW_PORT", "65536"],
    ["VITE_COMMENT_MAX_LENGTH", "0"],
    ["VITE_AMOUNT_FRACTION_DIGITS", "2.5"],
    ["VITE_BASE_PATH", "//other-host/"],
    ["VITE_STRICT_PORT", "yes"],
    ["VITE_FINANCING_PURPOSES", "unknown"],
  ])("rejects an invalid %s override with an English error", (key, value) => {
    expect(() => readEnvironment({ [key]: value })).toThrow(`Invalid ${key}`);
  });
});
