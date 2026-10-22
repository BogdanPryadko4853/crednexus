import type { MessageKey } from "../../../i18n";
import { config } from "../../../config";

// Input format constraints, not product eligibility limits. Product limits belong to the API.
export const CREDIT_INPUT_LIMITS = config.creditInputLimits;

export const FINANCING_PURPOSES = [
  { value: "working-capital", labelKey: "application.purposes.workingCapital" },
  { value: "equipment", labelKey: "application.purposes.equipment" },
] as const satisfies readonly { value: string; labelKey: MessageKey }[];

export const availableFinancingPurposes = FINANCING_PURPOSES.filter(
  ({ value }) => config.purposeIds.includes(value),
);

export type CreditRequest = {
  company: string;
  inn: string;
  amount: string;
  purpose: string;
  comment: string;
};
export type CreditRequestErrors = Partial<
  Record<keyof CreditRequest, MessageKey>
>;

export function createEmptyCreditRequest(): CreditRequest {
  return { company: "", inn: "", amount: "", purpose: "", comment: "" };
}

const innPattern = new RegExp(
  `^(\\d{${CREDIT_INPUT_LIMITS.legalInnDigits}}|\\d{${CREDIT_INPUT_LIMITS.soleInnDigits}})$`,
);
const amountPattern = new RegExp(
  `^\\d{1,${CREDIT_INPUT_LIMITS.amountIntegerDigits}}([.,]\\d{1,${CREDIT_INPUT_LIMITS.amountFractionDigits}})?$`,
);

export function validateCreditRequest(
  values: CreditRequest,
): CreditRequestErrors {
  const errors: CreditRequestErrors = {};
  if (!values.company.trim()) errors.company = "application.validation.company";
  if (!innPattern.test(values.inn)) errors.inn = "application.validation.inn";
  const amount = values.amount.replace(/\s/g, "");
  if (!amountPattern.test(amount) || !/[1-9]/.test(amount))
    errors.amount = "application.validation.amount";
  if (!availableFinancingPurposes.some(({ value }) => value === values.purpose))
    errors.purpose = "application.validation.purpose";
  return errors;
}
