// Validate the representation before converting it to the API's numeric fields.
export function normalizedMoney(value: string): string {
  return value.trim().replace(/\s/g, "").replace(",", ".");
}

export function validMoney(value: string, allowZero = true): boolean {
  const normalized = normalizedMoney(value);
  if (!/^\d{1,17}(?:\.\d{1,2})?$/.test(normalized)) return false;
  const [whole = "0", fraction = ""] = normalized.split(".");
  const cents = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
  // Reject values that cannot survive the existing numeric JSON contract precisely.
  const [numericWhole = "0", numericFraction = ""] = String(Number(normalized)).split(".");
  if (!/^\d+$/.test(numericWhole) || !/^\d{0,2}$/.test(numericFraction)) return false;
  const representedCents = BigInt(numericWhole) * 100n + BigInt(numericFraction.padEnd(2, "0"));
  return (allowZero || cents > 0n) && cents <= BigInt(Number.MAX_SAFE_INTEGER) && representedCents === cents;
}

export function moneyValue(value: string): number {
  if (!validMoney(value)) throw new Error("Invalid monetary input");
  return Number(normalizedMoney(value));
}

export function validTerm(value: string): boolean {
  return /^\d+$/.test(value.trim()) && Number.isSafeInteger(Number(value)) && Number(value) > 0 && Number(value) <= 2147483647;
}
