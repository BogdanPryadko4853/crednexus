import type { ApiClient } from "../../../api/types";
import type { CreditDecision, DocumentResponse, FinancialSnapshot, InformationRequest, VerificationResult } from "../../credit-application/api/creditApplicationApi";

export type ReviewApplication = { id: string; companyName: string; requestedAmount: number; requestedTermMonths: number; purpose: string };
export type ReviewHistory = { id: string; fromStatus: string | null; toStatus: string; occurredAt: string; reason?: string; actorName?: string };
export type ReviewDetails = {
  application: ReviewApplication;
  company: { name: string; inn: string; ogrnOrOgrnip?: string; legalForm?: string; status?: string };
  financialSnapshot: FinancialSnapshot | null;
  verifications: VerificationResult[];
  scoring: { score: number; riskLevel: string; modelVersion: string; calculatedAt: string } | null;
  documents: DocumentResponse[];
  informationRequests: InformationRequest[];
  statusHistory: ReviewHistory[];
  decisions: CreditDecision[];
};
export type ManualDecision = { action: "APPROVE" | "COUNTER_OFFER" | "REJECT"; reason: string; amount?: number; termMonths?: number; interestRate?: number };
const base = "/manual-review/loan-applications";
export const canReview = (roles: readonly string[]) => roles.some((role) => role === "ADMIN" || role === "BANK_EMPLOYEE");
export const loadReviewQueue = (api: ApiClient) => api.request<ReviewApplication[]>(base);
export const loadReviewDetails = (api: ApiClient, id: string) => api.request<ReviewDetails>(`${base}/${id}/details`);
export const makeManualDecision = (api: ApiClient, id: string, body: ManualDecision) => api.request<CreditDecision>(`${base}/${id}/decision`, { method: "POST", body });
export const requestReviewInformation = (api: ApiClient, id: string, question: string) => api.request<void>(`${base}/${id}/information-requests`, { method: "POST", body: { question } });
