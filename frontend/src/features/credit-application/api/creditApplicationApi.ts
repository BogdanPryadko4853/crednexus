import type { ApiClient } from "../../../api/types";

export type CompanyOption = {
  id: string;
  inn: string;
  name: string;
  currentUserCanApply: boolean;
};

export type CreditProductOption = {
  id: string;
  name: string;
  minAmount?: number;
  maxAmount?: number;
  minTermMonths: number;
  maxTermMonths?: number;
  baseRate?: number;
};

export type CreateDraftRequest = {
  productId: string;
  requestedAmount: number;
  termMonths: number;
  purpose: string;
};

export type LoanApplicationResponse = CreateDraftRequest & {
  id: string;
  companyId: string;
  status: string;
  createdAt?: string;
  updatedAt?: string;
};
export type InformationRequest = { id: string; question: string; status: string; answer?: string; answeredAt?: string };
export type DocumentResponse = { id: string; documentType: string; fileName: string; contentType: string; sizeBytes: number; status: string; createdAt: string; informationRequestId?: string };
export type CreditDecision = { id: string; decisionType: string; reason: string; decidedAt?: string; policyVersion?: string; offer?: CreditOffer };
export type CreditOffer = { id: string; amount: number; termMonths: number; interestRate: number; status: string; expiresAt?: string };
export type Fulfillment = { applicationStatus: string; agreementId?: string; contractNumber?: string; agreementStatus?: string; signedAt?: string; disbursementId?: string; disbursementAmount?: number; disbursementStatus?: string; disbursedAt?: string };
export type FinancialSnapshot = { id?: string; applicationId?: string; annualRevenue: number; annualExpenses: number; existingDebt: number; monthlyPayments: number; employeeCount: number; period: string };

export function loadLoanApplications(api: ApiClient) {
  return api.request<LoanApplicationResponse[]>("/loan-applications");
}

export function loadLoanApplication(api: ApiClient, applicationId: string) {
  return api.request<LoanApplicationResponse>(`/loan-applications/${applicationId}`);
}

export function submitLoanApplication(api: ApiClient, applicationId: string) {
  return api.request<LoanApplicationResponse>(
    `/loan-applications/${applicationId}/submit`,
    { method: "POST" },
  );
}

export function loadInformationRequests(api: ApiClient, applicationId: string) {
  return api.request<InformationRequest[]>(`/loan-applications/${applicationId}/information-requests`);
}
export function answerInformationRequest(api: ApiClient, applicationId: string, requestId: string, answer: string) {
  return api.request<InformationRequest>(`/loan-applications/${applicationId}/information-requests/${requestId}/answer`, { method: "POST", body: { answer } });
}
export function loadDocuments(api: ApiClient, applicationId: string) {
  return api.request<DocumentResponse[]>(`/loan-applications/${applicationId}/documents`);
}
export function uploadDocument(api: ApiClient, applicationId: string, type: string, file: File, informationRequestId?: string) {
  const body = new FormData();
  body.set("type", type);
  body.set("file", file);
  if (informationRequestId) body.set("informationRequestId", informationRequestId);
  return api.request<DocumentResponse>(`/loan-applications/${applicationId}/documents`, { method: "POST", body });
}
export function loadDecision(api: ApiClient, applicationId: string) {
  return api.request<CreditDecision>(`/loan-applications/${applicationId}/decision`);
}
export function acceptOffer(api: ApiClient, applicationId: string) {
  return api.request<{ applicationStatus: string; offer: CreditOffer }>(`/loan-applications/${applicationId}/offer/accept`, { method: "POST" });
}
export function declineOffer(api: ApiClient, applicationId: string) {
  return api.request<{ applicationStatus: string; offer: CreditOffer }>(`/loan-applications/${applicationId}/offer/decline`, { method: "POST" });
}
export function loadFulfillment(api: ApiClient, applicationId: string) {
  return api.request<Fulfillment>(`/loan-applications/${applicationId}/fulfillment`);
}
export function saveFinancialSnapshot(api: ApiClient, applicationId: string, snapshot: Omit<FinancialSnapshot, "id" | "applicationId">) {
  return api.request<FinancialSnapshot>(`/loan-applications/${applicationId}/financial-snapshot`, { method: "PUT", body: snapshot });
}

export async function loadCreditApplicationOptions(api: ApiClient) {
  const [companies, products] = await Promise.all([
    api.request<CompanyOption[]>("/companies"),
    api.request<CreditProductOption[]>("/credit-products"),
  ]);
  return {
    companies: companies.filter((company) => company.currentUserCanApply),
    products,
  };
}

export function createLoanApplication(
  api: ApiClient,
  companyId: string,
  request: CreateDraftRequest,
) {
  return api.request<LoanApplicationResponse>(
    `/companies/${companyId}/loan-applications`,
    { method: "POST", body: request },
  );
}
