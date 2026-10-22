import { describe, expect, it } from "vitest";
import { emptyMonthlyHistory, validMlProfile } from "./mlProfile";
import type { MlProfile } from "./mlProfile";

function profile(): MlProfile {
  return {
    as_of_month: "2025-12-01",
    company: { sector: "retail", business_age_months: 36 },
    history: emptyMonthlyHistory("2025-12", 3).map((row) => ({
      ...row,
      sales: 1000000,
      cash_inflow: 900000,
      operating_cash_outflow: 500000,
      operating_expense: 600000,
      cash_balance: 200000,
    })),
    financial_snapshot: {
      month: "2025-12-01",
      legal_form: "OOO",
      business_state: "active",
      largest_customer_share: 0.2,
      largest_channel_share: 0.3,
      accounts_receivable: 100000,
      accounts_payable: 50000,
      overdue_payables: 0,
      debt_outstanding: 0,
      loan_arrears: 0,
      inventory: 10000,
      existing_monthly_debt_service: 0,
    },
  };
}

describe("ML profile validation", () => {
  it("creates empty observations without inventing revenue or zero balances", () => {
    expect(emptyMonthlyHistory("2025-01", 3)).toEqual([
      {
        month: "2024-11-01",
        sales: null,
        cash_inflow: null,
        operating_cash_outflow: null,
        cash_balance: null,
        operating_expense: null,
      },
      {
        month: "2024-12-01",
        sales: null,
        cash_inflow: null,
        operating_cash_outflow: null,
        cash_balance: null,
        operating_expense: null,
      },
      {
        month: "2025-01-01",
        sales: null,
        cash_inflow: null,
        operating_cash_outflow: null,
        cash_balance: null,
        operating_expense: null,
      },
    ]);
  });
  it("accepts a complete profile and known zero values", () => {
    const value = profile();
    value.history[0]!.cash_balance = 0;
    expect(validMlProfile(value)).toBe(true);
  });
  it("allows unknown observations but requires each measure in the last three months", () => {
    const value = profile();
    value.history[0]!.sales = null;
    expect(validMlProfile(value)).toBe(true);
    value.history.forEach((row) => {
      row.sales = null;
    });
    expect(validMlProfile(value)).toBe(false);
  });
  it("rejects incomplete history, invalid shares, overdue payables and future months", () => {
    const short = profile();
    short.history.pop();
    expect(validMlProfile(short)).toBe(false);
    const share = profile();
    share.financial_snapshot.largest_channel_share = 2;
    expect(validMlProfile(share)).toBe(false);
    const debt = profile();
    debt.financial_snapshot.overdue_payables = 50001;
    expect(validMlProfile(debt)).toBe(false);
    const future = profile();
    future.as_of_month = "2099-01-01";
    expect(validMlProfile(future)).toBe(false);
  });
});
