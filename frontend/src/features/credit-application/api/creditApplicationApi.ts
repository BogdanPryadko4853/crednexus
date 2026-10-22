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
  minTermMonths: number;
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

export function loadLoanApplications(api: ApiClient) {
  return api.request<LoanApplicationResponse[]>("/loan-applications");
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
