import type { MessageKey } from "../../../i18n";

// Present system-generated fulfilment events consistently; preserve individual bank decisions.
export function eventReason(reason: string, status: string, translate: (key: MessageKey) => string): string {
  if (status === "AGREEMENT_PENDING") return translate("workflow.status.AGREEMENT_PENDING");
  if (status === "DISBURSED") return translate("workflow.status.DISBURSED");
  return reason;
}
