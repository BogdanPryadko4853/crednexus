import { ApiError } from "../../api/httpClient";

const record = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const numeric = (value: unknown) => typeof value === "number" && Number.isFinite(value);
const validOffer = (value: unknown) => record(value) && ["amount", "termMonths", "interestRate"].every((field) => numeric(value[field]));
export function validateResource(key: string, value: unknown): void {
  let valid = true;
  if (["requests", "documents", "verifications", "history"].includes(key)) {
    valid = Array.isArray(value) && value.every((row: unknown) => record(row) && typeof row.id === "string"
      && (key !== "requests" || (typeof row.question === "string" && typeof row.status === "string"))
      && (key !== "documents" || (typeof row.fileName === "string" && typeof row.status === "string"))
      && (key !== "verifications" || (typeof row.type === "string" && typeof row.status === "string"))
      && (key !== "history" || (typeof row.toStatus === "string" && typeof row.occurredAt === "string")));
  } else if (key === "application") valid = record(value) && typeof value.id === "string" && typeof value.status === "string" && typeof value.purpose === "string" && numeric(value.requestedAmount) && numeric(value.termMonths);
  else if (key === "financial" && value !== null) valid = record(value) && ["annualRevenue", "annualExpenses", "existingDebt", "monthlyPayments", "employeeCount"].every((field) => numeric(value[field])) && typeof value.period === "string";
  else if (key === "decision" && value !== null) valid = record(value) && typeof value.decisionType === "string" && typeof value.reason === "string" && (value.offer == null || validOffer(value.offer));
  else if (key === "fulfillment" && value !== null) valid = record(value) && typeof value.applicationStatus === "string";
  if (!valid) throw new ApiError("invalidResponse");
}
