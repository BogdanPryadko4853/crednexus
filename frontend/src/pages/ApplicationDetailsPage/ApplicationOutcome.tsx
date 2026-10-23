import { Button, Card, Text } from "../../components";
import {useLocale} from "../../i18n";
import type {MessageKey} from "../../i18n";
import {workflowText} from "../../features/credit-application/ui/workflowText";
import type {CreditDecision,Fulfillment} from "../../features/credit-application/api/creditApplicationApi";
type Props={selectedSection:string;decision:CreditDecision|null;fulfillment:Fulfillment|null;application:{status:string};offerExpired:boolean;busy:boolean;setOfferConfirmation:(action:"accept"|"decline")=>void};
export function ApplicationOutcome({selectedSection,decision,fulfillment,application,offerExpired,busy,setOfferConfirmation}:Props){
const {t,locale}=useLocale();const text=workflowText[locale];return <>      <div role="tabpanel" id="application-decision-panel" aria-labelledby="application-decision-tab" hidden={selectedSection !== "application-decision"} className="application-section-panel">
      {!decision && <Card><Text muted>{t("application.workflow.decisionPending")}</Text></Card>}
      {decision && (
        <Card id="application-decision" title={t("application.decisionTitle")}>
          <Text>
            {t(
              `application.decisionType.${decision.decisionType}` as MessageKey,
            )}
          </Text>
          <Text>{decision.reason}</Text>
        </Card>
      )}
      {decision?.offer && (
        <Card title={t("application.offerTitle")}>
          <Text>
            {decision.offer.amount.toLocaleString(locale)} ₽ ·{" "}
            {decision.offer.termMonths} {t("dashboard.months")} ·{" "}
            {decision.offer.interestRate}%
          </Text>
          {decision.offer.expiresAt && (
            <Text muted>
              {text.expires}:{" "}
              {new Date(decision.offer.expiresAt).toLocaleString(locale)}
            </Text>
          )}
          {application.status === "OFFERED" && (
            <>
              {offerExpired && <Text>{text.expired}</Text>}
              <div className="application-offer-actions">
                <Button
                  disabled={offerExpired}
                  loading={busy}
                  onClick={() => setOfferConfirmation("accept")}
                >
                  {t("application.offerAccept")}
                </Button>
                <Button
                  disabled={offerExpired}
                  loading={busy}
                  variant="secondary"
                  onClick={() => setOfferConfirmation("decline")}
                >
                  {t("application.offerDecline")}
                </Button>
              </div>
            </>
          )}
        </Card>
      )}
      </div>
      <div role="tabpanel" id="application-fulfillment-panel" aria-labelledby="application-fulfillment-tab" hidden={selectedSection !== "application-fulfillment"} className="application-section-panel">
      {!fulfillment && <Card><Text muted>{t("application.fulfillmentPending")}</Text></Card>}
      {fulfillment && (
        <Card id="application-fulfillment" title={t("application.fulfillmentTitle")}>
          <Text muted>{text.simulation}</Text>
          {fulfillment.agreementStatus && <Text>{t(`workflow.fulfillment.${fulfillment.agreementStatus}` as MessageKey)}</Text>}
          {fulfillment.disbursementStatus && <Text>{t(`workflow.fulfillment.${fulfillment.disbursementStatus}` as MessageKey)}</Text>}
          <Text>
            {fulfillment.contractNumber ?? t("application.fulfillmentPending")}
          </Text>
          {fulfillment.signedAt && (
            <Text>{new Date(fulfillment.signedAt).toLocaleString(locale)}</Text>
          )}
          {fulfillment.disbursementAmount != null && (
            <Text>
              {fulfillment.disbursementAmount.toLocaleString(locale)} ₽
            </Text>
          )}
          {fulfillment.disbursedAt && (
            <Text>
              {new Date(fulfillment.disbursedAt).toLocaleString(locale)}
            </Text>
          )}
        </Card>
      )}
      </div>
</>;
}
