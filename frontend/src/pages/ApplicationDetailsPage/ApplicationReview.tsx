import {Button,Card,StatusBadge,Text} from "../../components";
import {useLocale} from "../../i18n";
import type {MessageKey} from "../../i18n";
import {workflowText} from "../../features/credit-application/ui/workflowText";
import {eventReason} from "../../features/credit-application/ui/eventReason";
import type {LoanApplicationResponse,FinancialSnapshot,VerificationResult,ApplicationHistory} from "../../features/credit-application/api/creditApplicationApi";
const stages = [
  "DRAFT",
  "SUBMITTED",
  "VERIFYING",
  "SCORING",
  "OFFERED",
  "AGREEMENT_PENDING",
  "DISBURSED",
] as const;


type Props={selectedSection:string;application:LoanApplicationResponse;snapshot:FinancialSnapshot|null;currentStage:number;financialSaved:boolean;mlReady:boolean;draftDirty:boolean;busy:boolean;draftSaving:boolean;submitting:boolean;submit:()=>Promise<void>;isTerminal:boolean;verifications:VerificationResult[];history:ApplicationHistory[];loaded:boolean;resourceErrors:string[]};
export function ApplicationReview({selectedSection,application,snapshot,currentStage,financialSaved,mlReady,draftDirty,busy,draftSaving,submitting,submit,isTerminal,verifications,history,loaded,resourceErrors}:Props){const {t,locale}=useLocale();const text=workflowText[locale];return <>      <div role="tabpanel" id="application-review-panel" aria-labelledby="application-review-tab" hidden={selectedSection !== "application-review"} className="application-section-panel">
      <Card title={t("application.progressTitle")}>
        <ol className="application-progress">
          {stages.map((stage, index) => (
            <li
              className={
                index === currentStage
                  ? "is-current"
                  : index < currentStage
                    ? "is-complete"
                    : ""
              }
              aria-current={index === currentStage ? "step" : undefined}
              key={stage}
            >
              <span>{index + 1}</span>
              {t(
                `dashboard.status.${index === currentStage ? application.status : stage}` as MessageKey,
              )}
            </li>
          ))}
        </ol>
        {application.status === "DRAFT" && (
          <>
            <dl className="application-details__summary">
              <div><dt>{t("application.summary.amount")}</dt><dd>{application.requestedAmount.toLocaleString(locale)} ₽</dd></div>
              <div><dt>{t("application.summary.term")}</dt><dd>{application.termMonths} {t("dashboard.months")}</dd></div>
              <div><dt>{t("application.summary.purpose")}</dt><dd>{application.purpose}</dd></div>
              <div><dt>{t("application.financial.annualRevenue")}</dt><dd>{snapshot?.annualRevenue.toLocaleString(locale) ?? "—"}</dd></div>
              <div><dt>{t("application.financial.existingDebt")}</dt><dd>{snapshot?.existingDebt.toLocaleString(locale) ?? "—"}</dd></div>
            </dl>
            <Text muted>{text.ready}</Text>
            <ul>
              <li>
                {financialSaved ? "✓" : "○"} {t("application.financialTitle")}
              </li>
              <li>
                {mlReady ? "✓" : "○"} {text.mlTitle}
              </li>
              <li>
                {!draftDirty ? "✓" : "○"} {t("application.detailsSummaryTitle")}
              </li>
            </ul>
            <Button
              disabled={
                !financialSaved || !mlReady || draftDirty || busy || draftSaving
              }
              loading={submitting}
              onClick={() => void submit()}
            >
              {t("application.submitAction")}
            </Button>
          </>
        )}
        {isTerminal && <Text muted>{t("application.progressTerminal")}</Text>}
      </Card>
      </div>
      <div hidden={selectedSection !== "application-review"} className="application-section-panel">
      <Card title={t("application.verificationsTitle")}>
        {loaded &&
          !resourceErrors.includes("verifications") &&
          verifications.length === 0 && (
            <Text muted>{t("application.verificationsEmpty")}</Text>
          )}
        {verifications.map((item) => (
          <div className="application-request" key={item.id}>
            <strong>
              {t(`application.verificationType.${item.type}` as MessageKey)}
            </strong>
            <StatusBadge
              tone={
                item.status === "SUCCESS"
                  ? "positive"
                  : item.status === "PENDING"
                    ? "info"
                    : "negative"
              }
            >
              {t(`application.verificationStatus.${item.status}` as MessageKey)}
            </StatusBadge>
          </div>
        ))}
      </Card>
      </div>
      <div hidden={selectedSection !== "application-review"} className="application-section-panel">
      <Card title={text.history}>
        {history.length === 0 && !resourceErrors.includes("history") && <Text muted>{text.emptyHistory}</Text>}
        <ol className="application-requests">
          {history.map((item) => (
            <li className="application-request" key={item.id}>
              <Text>
                {new Date(item.occurredAt).toLocaleString(locale)} ·{" "}
                {t(`dashboard.status.${item.toStatus}` as MessageKey)}
              </Text>
              {item.reason && <Text>{eventReason(item.reason, item.toStatus, t)}</Text>}
            </li>
          ))}
        </ol>
      </Card>
      </div>
</>;}
