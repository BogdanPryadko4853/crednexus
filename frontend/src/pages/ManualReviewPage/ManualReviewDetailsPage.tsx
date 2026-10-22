import { useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import { Alert, Button, Card, Heading, Modal, PageState, SelectField, StatusBadge, Text, TextField } from "../../components";
import { useAuth } from "../../auth";
import { useLocale } from "../../i18n";
import type { MessageKey } from "../../i18n";
import { routes } from "../../config/routes";
import { ApiError } from "../../api/httpClient";
import { downloadDocument, loadFulfillment, retryFulfillment, runVerifications } from "../../features/credit-application/api/creditApplicationApi";
import type { Fulfillment } from "../../features/credit-application/api/creditApplicationApi";
import { loadReviewDetails, makeManualDecision, requestReviewInformation } from "../../features/manual-review/api/manualReviewApi";
import type { ManualDecision, ReviewDetails } from "../../features/manual-review/api/manualReviewApi";
import "./ManualReviewPage.css";

export function ManualReviewDetailsPage() {
  const { applicationId } = useParams();
  const { api } = useAuth();
  const { t, locale } = useLocale();
  const [details, setDetails] = useState<ReviewDetails | null>(null);
  const [error, setError] = useState(false);
  const [revision, setRevision] = useState(0);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [fulfillment, setFulfillment] = useState<Fulfillment | null>(null);
  const [operationMessage, setOperationMessage] = useState<string | null>(null);
  const [action, setAction] = useState<ManualDecision["action"]>("APPROVE");
  const [reason, setReason] = useState("");
  const [question, setQuestion] = useState("");
  const [terms, setTerms] = useState({ amount: "", termMonths: "", interestRate: "" });
  const [confirmation, setConfirmation] = useState<"decision" | "question" | null>(null);
  const reload = () => setRevision((value) => value + 1);
  useEffect(() => {
    if (!api || !applicationId) return;
    let active = true;
    setError(false); setDetails(null);
    void Promise.all([
      loadReviewDetails(api, applicationId),
      loadFulfillment(api, applicationId).catch(() => null),
    ]).then(([value, status]) => {
      if (!active) return;
      setDetails(value);
      setFulfillment(status);
    }).catch(() => { if (active) setError(true); });
    return () => { active = false; };
  }, [api, applicationId, revision]);
  const latestStatus = details?.statusHistory.at(-1)?.toStatus;
  const editable = !completed && latestStatus === "MANUAL_REVIEW";
  const termsValid = Object.values(terms).every((value) => value.trim() && Number.isFinite(Number(value)) && Number(value) > 0) && Number.isInteger(Number(terms.termMonths));
  async function confirm() {
    if (!api || !applicationId || !confirmation || busy) return;
    setBusy(true); setActionError(false); setConflict(false);
    try {
      if (confirmation === "question") await requestReviewInformation(api, applicationId, question.trim());
      else await makeManualDecision(api, applicationId, { action, reason: reason.trim(), ...(action === "COUNTER_OFFER" ? { amount: Number(terms.amount), termMonths: Number(terms.termMonths), interestRate: Number(terms.interestRate) } : {}) });
      setConfirmation(null); setCompleted(true); reload();
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) { setConflict(true); setConfirmation(null); reload(); }
      else setActionError(true);
    } finally { setBusy(false); }
  }
  async function download(id: string, fileName: string) {
    if (!api || busy) return;
    setBusy(true); setActionError(false);
    try {
      const url = URL.createObjectURL(await downloadDocument(api, id));
      const anchor = document.createElement("a"); anchor.href = url; anchor.download = fileName;
      anchor.click(); URL.revokeObjectURL(url);
    } catch { setActionError(true); } finally { setBusy(false); }
  }
  async function rerunChecks() {
    if (!api || !applicationId || busy) return;
    setBusy(true); setActionError(false); setOperationMessage(null);
    try {
      await runVerifications(api, applicationId);
      setOperationMessage(t("review.verificationsStarted"));
      reload();
    } catch { setActionError(true); } finally { setBusy(false); }
  }
  async function retryProcessing() {
    if (!api || !applicationId || busy) return;
    setBusy(true); setActionError(false); setOperationMessage(null);
    try {
      await retryFulfillment(api, applicationId);
      setOperationMessage(t("review.fulfillmentRetryStarted"));
      reload();
    } catch { setActionError(true); } finally { setBusy(false); }
  }
  if (error || !applicationId) return <PageState kind="error" title={t("application.detailsErrorTitle")} action={<Button onClick={reload}>{t("application.retry")}</Button>} />;
  if (!details) return <PageState kind="loading" title={t("application.detailsLoading")} />;
  return <section className="manual-review">
    <Link to={routes.review}>{t("review.back")}</Link>
    <div className="manual-review__heading"><Heading level={1}>{details.company.name}</Heading><Button variant="secondary" onClick={reload}>{t("application.refresh")}</Button></div>
    {completed && <Alert tone="positive" title={t("review.saved")} />}
    {operationMessage && <Alert tone="positive" title={operationMessage} />}
    {conflict && <Alert tone="negative" title={t("review.conflict")} />}
    {actionError && <Alert tone="negative" title={t("application.actionErrorTitle")} />}
    <Card title={t("application.detailsSummaryTitle")}>
      <Text>{t("application.summary.inn")}: {details.company.inn}</Text>
      {details.company.ogrnOrOgrnip && <Text>{t("review.registration")}: {details.company.ogrnOrOgrnip}</Text>}
      <Text>{t("application.summary.amount")}: {details.application.requestedAmount.toLocaleString(locale)}</Text>
      <Text>{t("application.summary.term")}: {details.application.requestedTermMonths} {t("dashboard.months")}</Text>
      <Text>{t("application.summary.purpose")}: {details.application.purpose}</Text>
      {latestStatus && <StatusBadge tone="info">{t(`dashboard.status.${latestStatus}` as MessageKey)}</StatusBadge>}
    </Card>
    <Card title={t("application.financialTitle")}>
      {details.financialSnapshot ? <dl className="manual-review__fields">{(["annualRevenue", "annualExpenses", "existingDebt", "monthlyPayments", "employeeCount", "period"] as const).map((key) => <div key={key}><dt>{t(`application.financial.${key}` as MessageKey)}</dt><dd>{details.financialSnapshot![key].toLocaleString(locale)}</dd></div>)}</dl> : <Text muted>{t("review.noData")}</Text>}
    </Card>
    <Card title={t("application.verificationsTitle")}>
      {details.verifications.length === 0 && <Text muted>{t("application.verificationsEmpty")}</Text>}
      <ul className="manual-review__list">{details.verifications.map((item) => <li className="manual-review__item" key={item.id}><Text>{t(`application.verificationType.${item.type}` as MessageKey)}</Text><StatusBadge tone={item.status === "SUCCESS" ? "positive" : "info"}>{t(`application.verificationStatus.${item.status}` as MessageKey)}</StatusBadge></li>)}</ul>
      {latestStatus === "MANUAL_REVIEW" && <Button variant="secondary" loading={busy} onClick={() => void rerunChecks()}>{t("review.rerunVerifications")}</Button>}
    </Card>
    <Card title={t("review.scoring")}>
      {details.scoring ? <><Text>{t("review.score")}: {details.scoring.score}</Text><Text>{t("review.risk")}: {t(`review.risk.${details.scoring.riskLevel}` as MessageKey)}</Text></> : <Text muted>{t("review.noData")}</Text>}
    </Card>
    <Card title={t("application.documentsTitle")}>
      {details.documents.length === 0 && <Text muted>{t("application.documentsEmpty")}</Text>}
      <ul className="manual-review__list">{details.documents.map((item) => <li key={item.id}><Button variant="ghost" disabled={busy} onClick={() => void download(item.id, item.fileName)}>{item.fileName}</Button></li>)}</ul>
    </Card>
    <Card title={t("application.requestsTitle")}>
      {details.informationRequests.length === 0 && <Text muted>{t("review.noData")}</Text>}
      <ul className="manual-review__list">{details.informationRequests.map((item) => <li className="manual-review__item" key={item.id}><strong>{item.question}</strong><Text>{item.answer ?? t("review.waitingAnswer")}</Text></li>)}</ul>
    </Card>
    <Card title={t("review.history")}>
      <ol className="manual-review__list">{details.statusHistory.map((item) => <li className="manual-review__item" key={item.id}><Text>{new Date(item.occurredAt).toLocaleString(locale)} · {t(`dashboard.status.${item.toStatus}` as MessageKey)}</Text>{item.reason && <Text>{item.reason}</Text>}{item.actorName && <Text muted>{item.actorName}</Text>}</li>)}</ol>
      {details.statusHistory.length === 0 && <Text muted>{t("review.noData")}</Text>}
    </Card>
    <Card title={t("review.decisions")}>
      {details.decisions.length === 0 && <Text muted>{t("review.noData")}</Text>}
      {details.decisions.map((item) => <div className="manual-review__item" key={item.id}><strong>{t(`application.decisionType.${item.decisionType}` as MessageKey)}</strong><Text>{item.reason}</Text>{item.offer && <Text>{item.offer.amount.toLocaleString(locale)} · {item.offer.termMonths} {t("dashboard.months")} · {item.offer.interestRate}%</Text>}</div>)}
    </Card>
    {fulfillment && <Card title={t("application.fulfillmentTitle")}>
      <Text>{fulfillment.agreementStatus ?? t("application.fulfillmentPending")}</Text>
      {fulfillment.disbursementStatus && <Text>{fulfillment.disbursementStatus}</Text>}
      {(fulfillment.agreementStatus === "FAILED" || fulfillment.disbursementStatus === "FAILED") && <Button variant="secondary" loading={busy} onClick={() => void retryProcessing()}>{t("review.retryFulfillment")}</Button>}
    </Card>}
    {editable && <>
      <Card title={t("review.request")}><TextField name="question" label={t("review.question")} value={question} onChange={(event) => setQuestion(event.target.value)} /><Button disabled={!question.trim() || busy} onClick={() => setConfirmation("question")}>{t("review.request")}</Button></Card>
      <Card title={t("review.decision")}>
        <SelectField name="action" label={t("review.action")} value={action} onChange={(event) => setAction(event.target.value as ManualDecision["action"])}>{(["APPROVE", "COUNTER_OFFER", "REJECT"] as const).map((value) => <option key={value} value={value}>{t(`review.action.${value}` as MessageKey)}</option>)}</SelectField>
        <TextField name="reason" label={t("review.reason")} value={reason} onChange={(event) => setReason(event.target.value)} />
        {action === "COUNTER_OFFER" && <div className="manual-review__fields">{(["amount", "termMonths", "interestRate"] as const).map((key) => <TextField key={key} name={key} label={t(`review.terms.${key}` as MessageKey)} inputMode="decimal" value={terms[key]} onChange={(event) => setTerms((current) => ({ ...current, [key]: event.target.value }))} />)}</div>}
        <Button disabled={!reason.trim() || busy || (action === "COUNTER_OFFER" && !termsValid)} onClick={() => setConfirmation("decision")}>{t("review.decision")}</Button>
      </Card>
    </>}
    <Modal open={confirmation !== null} title={t("review.confirm")} onClose={() => { if (!busy) setConfirmation(null); }} footer={<div className="manual-review__actions"><Button variant="secondary" disabled={busy} onClick={() => setConfirmation(null)}>{t("application.actions.back")}</Button><Button loading={busy} onClick={() => void confirm()}>{t("application.actions.confirm")}</Button></div>}>
      <Text>{confirmation === "question" ? question : t(`review.action.${action}` as MessageKey)}</Text>
      {confirmation === "decision" && <><Text>{reason}</Text>{action === "COUNTER_OFFER" && <Text>{terms.amount} · {terms.termMonths} {t("dashboard.months")} · {terms.interestRate}%</Text>}</>}
      {actionError && <Alert tone="negative" title={t("application.actionErrorTitle")} />}
    </Modal>
  </section>;
}
