export const monthlyMeasures = [
  "sales",
  "cash_inflow",
  "operating_cash_outflow",
  "cash_balance",
  "operating_expense",
] as const;
export const snapshotMeasures = [
  "largest_customer_share",
  "largest_channel_share",
  "accounts_receivable",
  "accounts_payable",
  "overdue_payables",
  "debt_outstanding",
  "loan_arrears",
  "inventory",
  "existing_monthly_debt_service",
] as const;

export type MonthlyObservation = { month: string } & Record<
  (typeof monthlyMeasures)[number],
  number | null
>;
export type MlProfile = {
  as_of_month: string;
  company: { sector: string; business_age_months: number };
  history: MonthlyObservation[];
  financial_snapshot: {
    month: string;
    legal_form: string;
    business_state: "active" | "distressed" | "restructuring";
  } & Record<(typeof snapshotMeasures)[number], number>;
};

export function monthAt(month: string, offset: number): string {
  const date = new Date(`${month}-01T00:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + offset);
  return date.toISOString().slice(0, 10);
}

export function emptyMonthlyHistory(
  month: string,
  count: number,
): MonthlyObservation[] {
  return Array.from({ length: count }, (_, index) => ({
    month: monthAt(month, index - count + 1),
    sales: null,
    cash_inflow: null,
    operating_cash_outflow: null,
    cash_balance: null,
    operating_expense: null,
  }));
}

export function validMlProfile(profile: MlProfile): boolean {
  const month = profile.as_of_month;
  if (!/^\d{4}-\d{2}-01$/.test(month) || !Number.isFinite(Date.parse(month)))
    return false;
  const currentMonth = new Date().toISOString().slice(0, 7) + "-01";
  if (
    month >= currentMonth ||
    !profile.company.sector.trim() ||
    !Number.isInteger(profile.company.business_age_months) ||
    profile.company.business_age_months < 3 ||
    profile.company.business_age_months > 1200
  )
    return false;
  if (
    profile.history.length < 3 ||
    profile.history.length > 120 ||
    new Set(profile.history.map((row) => row.month)).size !==
      profile.history.length
  )
    return false;
  if (
    profile.history.some(
      (row) =>
        row.month > month ||
        row.month <
          monthAt(month.slice(0, 7), 1 - profile.company.business_age_months) ||
        monthlyMeasures.some(
          (key) =>
            row[key] !== null &&
            (!Number.isFinite(row[key]) || row[key]! < 0 || row[key]! > 1e15),
        ),
    )
  )
    return false;
  const recent = [0, -1, -2].map((offset) =>
    profile.history.find(
      (row) => row.month === monthAt(month.slice(0, 7), offset),
    ),
  );
  if (
    recent.some((row) => !row) ||
    monthlyMeasures.some((key) => recent.every((row) => row?.[key] === null))
  )
    return false;
  const snapshot = profile.financial_snapshot;
  return (
    snapshot.month === month &&
    ["IP", "OOO"].includes(snapshot.legal_form) &&
    snapshotMeasures.every(
      (key) =>
        Number.isFinite(snapshot[key]) &&
        snapshot[key] >= 0 &&
        snapshot[key] <= (key.endsWith("share") ? 1 : 1e15),
    ) &&
    snapshot.overdue_payables <= snapshot.accounts_payable
  );
}
