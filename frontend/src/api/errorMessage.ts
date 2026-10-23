import { ApiError } from "./httpClient";
import type { MessageKey } from "../i18n";

export function apiErrorKey(error: unknown): MessageKey {
  if (error instanceof ApiError && [400, 403, 404, 409].includes(error.status)) return `workflow.error.${error.status}` as MessageKey;
  return "application.apiErrorDescription";
}
