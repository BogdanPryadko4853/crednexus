import type { ApiClient } from "../../../api/types";

export type CompanyOption = {
  id: string;
  inn: string;
  name: string;
  currentUserCanApply: boolean;
  ogrnOrOgrnip?: string;
  legalForm?: string;
  status?: string;
  currentUserRole?: string;
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
  createdById: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  version: number;
};
export type InformationRequest = {
  id: string;
  question: string;
  status: string;
  answer?: string;
  answeredAt?: string;
  requiresDocument?: boolean;
  requirementCode?: string;
};
export type DocumentResponse = {
  id: string;
  documentType: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  status: string;
  createdAt: string;
  informationRequestId?: string;
};
export type CreditDecision = {
  id: string;
  decisionType: string;
  reason: string;
  decidedAt?: string;
  policyVersion?: string;
  offer?: CreditOffer;
};
export type CreditOffer = {
  id: string;
  amount: number;
  termMonths: number;
  interestRate: number;
  status: string;
  expiresAt?: string;
};
export type Fulfillment = {
  applicationStatus: string;
  agreementId?: string;
  contractNumber?: string;
  agreementStatus?: string;
  signedAt?: string;
  disbursementId?: string;
  disbursementAmount?: number;
  disbursementStatus?: string;
  disbursedAt?: string;
};
export type FinancialSnapshot = {
  id?: string;
  applicationId?: string;
  annualRevenue: number;
  annualExpenses: number;
  existingDebt: number;
  monthlyPayments: number;
  employeeCount: number;
  period: string;
};
export type VerificationResult = {
  id: string;
  type: string;
  status: string;
  source: string;
  checkedAt?: string;
  payload?: { outcome?: string; message?: string };
};

export type ApplicationHistory = {
  id: string;
  fromStatus: string;
  toStatus: string;
  occurredAt: string;
  reason?: string;
  actorName?: string;
};
export function loadApplicationHistory(api: ApiClient, applicationId: string) {
  return api.request<ApplicationHistory[]>(
    `/loan-applications/${applicationId}/history`,
  );
}

export function loadVerifications(api: ApiClient, applicationId: string) {
  return api.request<VerificationResult[]>(
    `/loan-applications/${applicationId}/verifications`,
  );
}

export function runVerifications(api: ApiClient, applicationId: string) {
  return api.request<void>(
    `/loan-applications/${applicationId}/verifications/run`,
    { method: "POST" },
  );
}

export function loadLoanApplications(api: ApiClient) {
  return api.request<LoanApplicationResponse[]>("/loan-applications");
}

export function loadLoanApplication(api: ApiClient, applicationId: string) {
  return api.request<LoanApplicationResponse>(
    `/loan-applications/${applicationId}`,
  );
}

export type UpdateDraftRequest = Partial<CreateDraftRequest>;

export function updateLoanApplication(
  api: ApiClient,
  applicationId: string,
  request: UpdateDraftRequest,
) {
  return api.request<LoanApplicationResponse>(
    `/loan-applications/${applicationId}`,
    { method: "PATCH", body: request },
  );
}

export function submitLoanApplication(api: ApiClient, applicationId: string) {
  return api.request<LoanApplicationResponse>(
    `/loan-applications/${applicationId}/submit`,
    { method: "POST" },
  );
}

export function loadInformationRequests(api: ApiClient, applicationId: string) {
  return api.request<InformationRequest[]>(
    `/loan-applications/${applicationId}/information-requests`,
  );
}
export function answerInformationRequest(
  api: ApiClient,
  applicationId: string,
  requestId: string,
  answer: string,
) {
  return api.request<InformationRequest>(
    `/loan-applications/${applicationId}/information-requests/${requestId}/answer`,
    { method: "POST", body: { answer } },
  );
}
export function loadDocuments(api: ApiClient, applicationId: string) {
  return api.request<DocumentResponse[]>(
    `/loan-applications/${applicationId}/documents`,
  );
}

export function downloadDocument(api: ApiClient, documentId: string) {
  return api.download(`/documents/${documentId}/download`);
}
export function uploadDocument(
  api: ApiClient,
  applicationId: string,
  type: string,
  file: File,
  informationRequestId?: string,
) {
  const body = new FormData();
  body.set("type", type);
  body.set("file", file);
  if (informationRequestId)
    body.set("informationRequestId", informationRequestId);
  return api.request<DocumentResponse>(
    `/loan-applications/${applicationId}/documents`,
    { method: "POST", body },
  );
}
export function loadDecision(api: ApiClient, applicationId: string) {
  return api.request<CreditDecision>(
    `/loan-applications/${applicationId}/decision`,
  );
}
export function acceptOffer(api: ApiClient, applicationId: string) {
  return api.request<{ applicationStatus: string; offer: CreditOffer }>(
    `/loan-applications/${applicationId}/offer/accept`,
    { method: "POST" },
  );
}
export function declineOffer(api: ApiClient, applicationId: string) {
  return api.request<{ applicationStatus: string; offer: CreditOffer }>(
    `/loan-applications/${applicationId}/offer/decline`,
    { method: "POST" },
  );
}
export function loadFulfillment(api: ApiClient, applicationId: string) {
  return api.request<Fulfillment>(
    `/loan-applications/${applicationId}/fulfillment`,
  );
}

export function retryFulfillment(api: ApiClient, applicationId: string) {
  return api.request<void>(
    `/loan-applications/${applicationId}/fulfillment/retry`,
    { method: "POST" },
  );
}
export function saveFinancialSnapshot(
  api: ApiClient,
  applicationId: string,
  snapshot: Omit<FinancialSnapshot, "id" | "applicationId">,
) {
  return api.request<FinancialSnapshot>(
    `/loan-applications/${applicationId}/financial-snapshot`,
    { method: "PUT", body: snapshot },
  );
}

export function loadFinancialSnapshot(api: ApiClient, applicationId: string) {
  return api.request<FinancialSnapshot>(
    `/loan-applications/${applicationId}/financial-snapshot`,
  );
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

export function loadCreditProducts(api: ApiClient) {
  return api.request<CreditProductAdmin[]>("/credit-products");
}

export function createCompany(api: ApiClient, body: { inn: string; ogrnOrOgrnip: string; name: string; legalForm: string; status: string }) {
  return api.request<CompanyOption>("/companies", { method: "POST", body });
}

export function loadCompany(api: ApiClient, companyId: string) {
  return api.request<CompanyOption>(`/companies/${companyId}`);
}

export type CreditProductAdmin = CreditProductOption & { active: boolean };
export function createCreditProduct(api: ApiClient, body: { name: string; minAmount: number; maxAmount: number; minTermMonths: number; maxTermMonths: number; baseRate: number; active: boolean }) {
  return api.request<CreditProductAdmin>("/credit-products", { method: "POST", body });
}

export function updateCreditProduct(api: ApiClient, productId: string, body: Partial<{ name: string; minAmount: number; maxAmount: number; minTermMonths: number; maxTermMonths: number; baseRate: number; active: boolean }>) {
  return api.request<CreditProductAdmin>(`/credit-products/${productId}`, { method: "PATCH", body });
}

export function loadCreditProduct(api: ApiClient, productId: string) {
  return api.request<CreditProductAdmin>(`/credit-products/${productId}`);
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
