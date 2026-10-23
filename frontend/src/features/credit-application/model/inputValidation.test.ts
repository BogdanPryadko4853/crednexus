import { expect, it } from "vitest";
import { moneyValue, validMoney, validTerm } from "./inputValidation";

it.each(["1.234", "-1", "1e6", "Infinity", "90071992547409.91", "99999999999999999.99", ""])("rejects amounts that cannot be sent precisely: %s", (value) => expect(validMoney(value)).toBe(false));
it("accepts decimal commas and distinguishes zero from positive amounts", () => {
  expect(moneyValue("1 234,50")).toBe(1234.5);
  expect(validMoney("0")).toBe(true);
  expect(validMoney("0", false)).toBe(false);
  expect(validMoney("0.29")).toBe(true);
});
it.each(["6.5", "0", "-1", "1e2", "2147483648", ""])("rejects an invalid whole-month term: %s", (value) => expect(validTerm(value)).toBe(false));
