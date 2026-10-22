import { describe, expect, it } from "vitest";
import { getApplicationStage } from "./applicationProgress";

describe("application progress", () => {
  it.each([
    ["DRAFT", 0], ["SUBMITTED", 1], ["VERIFYING", 2], ["NEEDS_INFO", 2],
    ["SCORING", 3], ["MANUAL_REVIEW", 3], ["REJECTED", 3], ["OFFERED", 4],
    ["ACCEPTED", 4], ["AGREEMENT_PENDING", 4], ["DISBURSED", 4],
    ["DECLINED", 4], ["EXPIRED", 4], ["UNKNOWN", -1],
  ])("maps %s to stage %s", (status, stage) => {
    expect(getApplicationStage(status)).toBe(stage);
  });
});
