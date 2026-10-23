import {Button,Card,StatusBadge,Text} from "../../components";
import {useLocale} from "../../i18n";
import type {MessageKey} from "../../i18n";
import type {ReviewDetails} from "../../features/manual-review/api/manualReviewApi";
import {ScoringFactors} from "./ScoringFactors";
import {eventReason} from "../../features/credit-application/ui/eventReason";
type Props={details:ReviewDetails;latestStatus:string|undefined;busy:boolean;download:(id:string,name:string)=>Promise<void>;rerunChecks:()=>Promise<void>};
export function ReviewEvidence({details,latestStatus,busy,download,rerunChecks}:Props){const {t,locale}=useLocale();return <>      <Card title={t("application.financialTitle")}>
        {details.financialSnapshot ? (
          <dl className="manual-review__fields">
            {(
              [
                "annualRevenue",
                "annualExpenses",
                "existingDebt",
                "monthlyPayments",
                "employeeCount",
                "period",
              ] as const
            ).map((key) => (
              <div key={key}>
                <dt>{t(`application.financial.${key}` as MessageKey)}</dt>
                <dd>
                  {details.financialSnapshot![key].toLocaleString(locale)}
                </dd>
              </div>
            ))}
          </dl>
        ) : (
          <Text muted>{t("review.noData")}</Text>
        )}
      </Card>
      <Card title={t("application.verificationsTitle")}>
        {details.verifications.length === 0 && (
          <Text muted>{t("application.verificationsEmpty")}</Text>
        )}
        <ul className="manual-review__list">
          {details.verifications.map((item) => (
            <li className="manual-review__item" key={item.id}>
              <Text>
                {t(`application.verificationType.${item.type}` as MessageKey)}
              </Text>
              <StatusBadge
                tone={item.status === "SUCCESS" ? "positive" : "info"}
              >
                {t(
                  `application.verificationStatus.${item.status}` as MessageKey,
                )}
              </StatusBadge>
            </li>
          ))}
        </ul>
        {latestStatus && ["SUBMITTED", "VERIFYING"].includes(latestStatus) && (
          <Button
            variant="secondary"
            loading={busy}
            onClick={() => void rerunChecks()}
          >
            {t("review.rerunVerifications")}
          </Button>
        )}
      </Card>
      <Card title={t("review.scoring")}>
        {details.scoring ? (
          <>
            <Text>
              {t("review.score")}: {details.scoring.score}
            </Text>
            <Text>
              {t("review.risk")}:{" "}
              {t(`review.risk.${details.scoring.riskLevel}` as MessageKey)}
            </Text>
            <ScoringFactors factors={details.scoring.factors} />
          </>
        ) : (
          <Text muted>{t("review.noData")}</Text>
        )}
      </Card>
      <Card title={t("application.documentsTitle")}>
        {details.documents.length === 0 && (
          <Text muted>{t("application.documentsEmpty")}</Text>
        )}
        <ul className="manual-review__list">
          {details.documents.map((item) => (
            <li key={item.id}>
              <Button
                variant="ghost"
                disabled={busy}
                onClick={() => void download(item.id, item.fileName)}
              >
                {item.fileName}
              </Button>
            </li>
          ))}
        </ul>
      </Card>
      <Card title={t("application.requestsTitle")}>
        {details.informationRequests.length === 0 && (
          <Text muted>{t("review.noData")}</Text>
        )}
        <ul className="manual-review__list">
          {details.informationRequests.map((item) => (
            <li className="manual-review__item" key={item.id}>
              <strong>{item.question}</strong>
              <Text>{item.answer ?? t("review.waitingAnswer")}</Text>
            </li>
          ))}
        </ul>
      </Card>
      <Card title={t("review.history")}>
        <ol className="manual-review__list">
          {details.statusHistory.map((item) => (
            <li className="manual-review__item" key={item.id}>
              <Text>
                {new Date(item.occurredAt).toLocaleString(locale)} ·{" "}
                {t(`dashboard.status.${item.toStatus}` as MessageKey)}
              </Text>
              {item.reason && <Text>{eventReason(item.reason, item.toStatus, t)}</Text>}
              {item.actorName && <Text muted>{item.actorName}</Text>}
            </li>
          ))}
        </ol>
        {details.statusHistory.length === 0 && (
          <Text muted>{t("review.noData")}</Text>
        )}
      </Card>
      <Card title={t("review.decisions")}>
        {details.decisions.length === 0 && (
          <Text muted>{t("review.noData")}</Text>
        )}
        {details.decisions.map((item) => (
          <div className="manual-review__item" key={item.id}>
            <strong>
              {t(`application.decisionType.${item.decisionType}` as MessageKey)}
            </strong>
            <Text>{item.reason}</Text>
            {item.offer && (
              <Text>
                {item.offer.amount.toLocaleString(locale)} ·{" "}
                {item.offer.termMonths} {t("dashboard.months")} ·{" "}
                {item.offer.interestRate}%
              </Text>
            )}
          </div>
        ))}
      </Card>
</>;}
