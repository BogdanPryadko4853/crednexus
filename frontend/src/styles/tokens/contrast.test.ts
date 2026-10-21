import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const tokens = readFileSync("src/styles/tokens/colors.css", "utf8");

function color(name: string) {
  const value = tokens.match(new RegExp(`${name}:\\s*(#[0-9a-f]+)`, "i"))?.[1];
  if (!value) throw new Error(`Missing color token: ${name}`);
  const hex =
    value.length === 4
      ? value
          .slice(1)
          .split("")
          .map((char) => char + char)
          .join("")
      : value.slice(1);
  const rgb = [0, 2, 4].map(
    (offset) => parseInt(hex.slice(offset, offset + 2), 16) / 255,
  );
  const linear = rgb.map((channel) =>
    channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
  );
  return 0.2126 * linear[0]! + 0.7152 * linear[1]! + 0.0722 * linear[2]!;
}

describe("Text contrast in the design system", () => {
  it.each([
    ["--color-text", "--color-surface"],
    ["--color-text-secondary", "--color-surface"],
    ["--color-text-secondary", "--color-background"],
    ["--color-surface", "--color-action"],
    ["--color-surface", "--color-action-hover"],
    ["--color-positive", "--color-positive-soft"],
    ["--color-negative", "--color-negative-soft"],
    ["--color-info", "--color-info-soft"],
    ["--color-attention", "--color-attention-soft"],
  ])("%s on %s meets the 4.5:1 threshold", (foreground, background) => {
    const values = [color(foreground), color(background)].sort((a, b) => b - a);
    expect((values[0]! + 0.05) / (values[1]! + 0.05)).toBeGreaterThanOrEqual(
      4.5,
    );
  });
});
