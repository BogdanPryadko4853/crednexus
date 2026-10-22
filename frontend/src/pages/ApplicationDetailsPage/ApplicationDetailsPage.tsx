import { useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import { Alert, Button, Card, Heading, PageState, StatusBadge, Text, TextField, SelectField } from "../../components";
import { useAuth } from "../../auth";
import { useLocale } from "../../i18n";
import type { MessageKey } from "../../i18n";
import { ApiError } from "../../api/httpClient";
import { routes } from "../../config/routes";
import { acceptOffer, answerInformationRequest, declineOffer, downloadDocument, loadVerifications, loadDecision, loadDocuments, loadFinancialSnapshot, loadFulfillment, loadInformationRequests, loadLoanApplication, saveFinancialSnapshot, submitLoanApplication, updateLoanApplication, uploadDocument } from "../../features/credit-application/api/creditApplicationApi";
import type { VerificationResult, CreditDecision, DocumentResponse, Fulfillment, InformationRequest, LoanApplicationResponse } from "../../features/credit-application/api/creditApplicationApi";
import "./ApplicationDetailsPage.css";
import { getApplicationStage } from "./applicationProgress";

const stages = ["DRAFT", "SUBMITTED", "VERIFYING", "SCORING", "OFFERED"] as const;

function tone(status: string) {
  if (["REJECTED", "DECLINED", "EXPIRED"].includes(status)) return "negative" as const;
  if (["OFFERED", "ACCEPTED", "DISBURSED"].includes(status)) return "positive" as const;
  return "info" as const;
}

export function ApplicationDetailsPage() {
  const { applicationId } = useParams();
  const { api } = useAuth();
  const { t, locale } = useLocale();

  const [application, setApplication] = useState<LoanApplicationResponse | null>(null);
  const [error, setError] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(false);
  const [informationRequests, setInformationRequests] = useState<InformationRequest[]>([]);
  const [documents, setDocuments] = useState<DocumentResponse[]>([]);
  const [decision, setDecision] = useState<CreditDecision | null>(null);
  const [fulfillment, setFulfillment] = useState<Fulfillment | null>(null);
  const [answer, setAnswer] = useState<Record<string, string>>({});
  const [financial, setFinancial] = useState({ annualRevenue: "", annualExpenses: "", existingDebt: "", monthlyPayments: "", employeeCount: "", period: "" });
  const [financialSaved, setFinancialSaved] = useState(false);
  const [draft, setDraft] = useState({ requestedAmount: "", termMonths: "", purpose: "" });
  const [draftSaved, setDraftSaved] = useState(false);
  const [draftSaving, setDraftSaving] = useState(false);
  const [uploadType, setUploadType] = useState("OTHER");
  const [actionError, setActionError] = useState(false);
  const [revision, setRevision] = useState(0);
  const [verifications, setVerifications] = useState<VerificationResult[]>([]);
  const [resourceErrors, setResourceErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [requestDocumentId, setRequestDocumentId] = useState("");
  const reload = () => setRevision((value) => value + 1);

  useEffect(() => {
    if (!api || !applicationId) return;
    let active = true;
    setError(false);
    setLoaded(false);
    setResourceErrors([]);
    async function resource<T>(name: string, promise: Promise<T>, apply: (value: T) => void, optional = false) {
      try { const value = await promise; if (active) apply(value); }
      catch (error) {
        if (active && !(optional && error instanceof ApiError && error.status === 404)) {
          setResourceErrors((items) => [...items, name]);
        }
      }
    }
    void loadLoanApplication(api, applicationId).then((item) => {
      if (active) setApplication(item);
    }).catch(() => {
      if (active) setError(true);
    });
    void Promise.all([
      resource("requests", loadInformationRequests(api, applicationId), setInformationRequests),
      resource("documents", loadDocuments(api, applicationId), setDocuments),
      resource("decision", loadDecision(api, applicationId), setDecision, true),
      resource("fulfillment", loadFulfillment(api, applicationId), setFulfillment, true),
      resource("verifications", loadVerifications(api, applicationId), setVerifications),
      resource("financial", loadFinancialSnapshot(api, applicationId), (snapshot) => {
        setFinancial({ annualRevenue: String(snapshot.annualRevenue), annualExpenses: String(snapshot.annualExpenses),
          existingDebt: String(snapshot.existingDebt), monthlyPayments: String(snapshot.monthlyPayments),
          employeeCount: String(snapshot.employeeCount), period: snapshot.period });
      }, true),
    ]).finally(() => { if (active) setLoaded(true); });
    return () => { active = false; };
  }, [api, applicationId, revision]);

  useEffect(() => {
    if (application) {
      setDraft({ requestedAmount: String(application.requestedAmount), termMonths: String(application.termMonths), purpose: application.purpose });
    }
  }, [application]);

  if (error || !applicationId)
    return <PageState kind="error" title={t("application.detailsErrorTitle")} description={t("application.detailsErrorDescription")} action={<Button onClick={reload}>{t("application.retry")}</Button>} />;
  if (!application)
    return <PageState kind="loading" title={t("application.detailsLoading")} />;

  const currentStage = getApplicationStage(application.status);
  const isTerminal = ["REJECTED", "DECLINED", "EXPIRED", "DISBURSED"].includes(application.status);
  const id = applicationId;
  async function submit() {
    if (!api || busy) return;
    setSubmitting(true);
    setSubmitError(false);
    try {
      setApplication(await submitLoanApplication(api, id)); reload();
    } catch {
      setSubmitError(true);
    } finally {
      setSubmitting(false);
    }
  }
  async function saveFinancial() {
    if (!api || busy) return;
    setBusy(true); setActionError(false);
    try {
      await saveFinancialSnapshot(api, id, {
        annualRevenue: Number(financial.annualRevenue), annualExpenses: Number(financial.annualExpenses),
        existingDebt: Number(financial.existingDebt), monthlyPayments: Number(financial.monthlyPayments),
        employeeCount: Number(financial.employeeCount), period: financial.period,
      });
      setFinancialSaved(true);
    } catch { setActionError(true); } finally { setBusy(false); }
  }
  async function saveDraft() {
    if (!api || busy) return;
    setDraftSaving(true);
    setDraftSaved(false); setActionError(false);
    try {
      const updated = await updateLoanApplication(api, id, {
        requestedAmount: Number(draft.requestedAmount),
        termMonths: Number(draft.termMonths),
        purpose: draft.purpose.trim(),
      });
      setApplication(updated);
      setDraftSaved(true);
    } catch { setActionError(true); } finally { setDraftSaving(false); }
  }
  async function answerRequest(request: InformationRequest) {
    const value = answer[request.id]?.trim();
    if (!api || !value || busy) return; setBusy(true); setActionError(false);
    try {
      const updated = await answerInformationRequest(api, id, request.id, value);
      setInformationRequests((items) => items.map((item) => item.id === updated.id ? updated : item)); reload();
    } catch { setActionError(true); } finally { setBusy(false); }
  }
  async function offerAction(action: "accept" | "decline") {
    if (!api || busy) return;
    setBusy(true); setActionError(false);
    try {
      const result = action === "accept" ? await acceptOffer(api, id) : await declineOffer(api, id);
      setApplication((item) => item ? { ...item, status: result.applicationStatus } : item); reload();
    } catch { setActionError(true); } finally { setBusy(false); }
  }
  async function upload(file: File) {
    if (!api || busy) return;
    setBusy(true); setActionError(false);
    try {
      const uploaded = await uploadDocument(api, id, uploadType, file, requestDocumentId || undefined);
      setDocuments((items) => [uploaded, ...items]);
    } catch { setActionError(true); } finally { setBusy(false); }
  }
  async function download(document: DocumentResponse) {
    if (!api || busy) return;
    setBusy(true); setActionError(false);
    try {
      const blob = await downloadDocument(api, document.id);
      const url = URL.createObjectURL(blob);
      const anchor = window.document.createElement("a");
      anchor.href = url;
      anchor.download = document.fileName;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch { setActionError(true); } finally { setBusy(false); }
  }

  return (
    <section className="application-details">
      <Link className="application-details__back" to={routes.dashboard}>{t("application.detailsBack")}</Link>
      <div className="application-details__heading">
        <div>
          <Text muted>{t("application.detailsEyebrow")}</Text>
          <Heading level={1}>{t("application.detailsTitle")}</Heading>
        </div>
        <Button variant="secondary" onClick={reload}>{t("application.refresh")}</Button>
        <StatusBadge tone={tone(application.status)}>{t(`dashboard.status.${application.status}` as MessageKey)}</StatusBadge>
      </div>
      {!loaded && <Text muted>{t("application.detailsLoading")}</Text>}
      {resourceErrors.length > 0 && <Alert tone="negative" title={t("application.apiErrorTitle")}>
        {resourceErrors.map((name) => <Text key={name}>{t(`application.resource.${name}` as MessageKey)}</Text>)}
        <Button variant="secondary" onClick={reload}>{t("application.retry")}</Button>
      </Alert>}
      {submitError && <Alert tone="negative" title={t("application.submitErrorTitle")}>{t("application.submitErrorDescription")}</Alert>}
      {actionError && <Alert tone="negative" title={t("application.actionErrorTitle")}>{t("application.actionErrorDescription")}</Alert>}
      <Card title={t("application.detailsSummaryTitle")}>
        <dl className="application-details__summary">
          <div><dt>{t("application.summary.amount")}</dt><dd>{application.requestedAmount.toLocaleString(locale)} ₽</dd></div>
          <div><dt>{t("application.summary.term")}</dt><dd>{application.termMonths} {t("dashboard.months")}</dd></div>
          <div><dt>{t("application.summary.purpose")}</dt><dd>{application.purpose}</dd></div>
        </dl>
      </Card>
      {application.status === "DRAFT" && <Card title={t("application.editTitle")}>
        <div className="application-financial-grid">
          <TextField name="draftAmount" label={t("application.summary.amount")} inputMode="decimal" value={draft.requestedAmount} onChange={(event) => setDraft((current) => ({ ...current, requestedAmount: event.target.value }))} />
          <TextField name="draftTerm" label={t("application.summary.term")} inputMode="numeric" value={draft.termMonths} onChange={(event) => setDraft((current) => ({ ...current, termMonths: event.target.value }))} />
          <TextField name="draftPurpose" label={t("application.summary.purpose")} value={draft.purpose} onChange={(event) => setDraft((current) => ({ ...current, purpose: event.target.value }))} />
        </div>
        <Button disabled={!Number.isFinite(Number(draft.requestedAmount)) || Number(draft.requestedAmount) <= 0 || !Number.isInteger(Number(draft.termMonths)) || Number(draft.termMonths) < 1 || !draft.purpose.trim() || draft.purpose.trim().length > 255} loading={draftSaving} onClick={() => void saveDraft()}>{draftSaved ? t("application.draftSaved") : t("application.draftSave")}</Button>
      </Card>}
      <Card title={t("application.progressTitle")}>
        <ol className="application-progress">
          {stages.map((stage, index) => <li className={index === currentStage ? "is-current" : index < currentStage ? "is-complete" : ""} aria-current={index === currentStage ? "step" : undefined} key={stage}><span>{index + 1}</span>{t(`dashboard.status.${index === currentStage ? application.status : stage}` as MessageKey)}</li>)}
        </ol>
        {application.status === "DRAFT" && <Button loading={submitting} onClick={() => void submit()}>{t("application.submitAction")}</Button>}
        {isTerminal && <Text muted>{t("application.progressTerminal")}</Text>}
      </Card>
      <Card title={t("application.financialTitle")} subtitle={t("application.financialDescription")}>
        <div className="application-financial-grid">
          {(["annualRevenue", "annualExpenses", "existingDebt", "monthlyPayments", "employeeCount"] as const).map((field) => <TextField key={field} readOnly={application.status !== "DRAFT"} name={field} label={t(`application.financial.${field}` as MessageKey)} inputMode="decimal" value={financial[field]} onChange={(event) => { setFinancialSaved(false); setFinancial((current) => ({ ...current, [field]: event.target.value })); }} />)}
          <TextField name="period" readOnly={application.status !== "DRAFT"} label={t("application.financial.period")} value={financial.period} onChange={(event) => setFinancial((current) => ({ ...current, period: event.target.value }))} />
        </div>
        {application.status === "DRAFT" && <Button loading={busy} disabled={!financial.period.trim() || [financial.annualRevenue, financial.annualExpenses, financial.existingDebt, financial.monthlyPayments].some((value) => !value.trim() || !Number.isFinite(Number(value)) || Number(value) < 0) || !Number.isInteger(Number(financial.employeeCount)) || Number(financial.employeeCount) < 1} onClick={() => void saveFinancial()}>{financialSaved ? t("application.financialSaved") : t("application.financialSave")}</Button>}
      </Card>
{informationRequests.length > 0 && <Card title={t("application.requestsTitle")}>
        <div className="application-requests">{informationRequests.map((request) => <div className="application-request" key={request.id}><strong>{request.question}</strong>{request.answer && <Text>{request.answer}</Text>}{request.status === "OPEN" && <><TextField name={`answer-${request.id}`} label={t("application.answerLabel")} value={answer[request.id] ?? ""} onChange={(event) => setAnswer((current) => ({ ...current, [request.id]: event.target.value }))} /><Button size="sm" loading={busy} disabled={!answer[request.id]?.trim()} onClick={() => void answerRequest(request)}>{t("application.answerAction")}</Button></>}</div>)}</div>
      </Card>}
      <Card title={t("application.documentsTitle")}>
        <SelectField name="informationRequestDocument" label={t("application.documentRequest")} value={requestDocumentId} onChange={(event) => setRequestDocumentId(event.target.value)}><option value="">{t("application.documentGeneral")}</option>{informationRequests.filter((item) => item.status === "OPEN").map((item) => <option key={item.id} value={item.id}>{item.question}</option>)}</SelectField><div className="application-document-upload"><SelectField name="documentType" label={t("application.documentType")} value={uploadType} onChange={(event) => setUploadType(event.target.value)}><option value="OTHER">{t("application.documentOther")}</option><option value="FINANCIAL_STATEMENTS">{t("application.documentFinancial")}</option><option value="TAX_RETURN">{t("application.documentTax")}</option></SelectField><input aria-label={t("application.documentsTitle")} disabled={busy} type="file" accept="application/pdf,image/png,image/jpeg" onChange={(event) => { const file = event.target.files?.[0]; if (file) void upload(file); }} /></div>
        {loaded && !resourceErrors.includes("documents") && documents.length === 0 && <Text muted>{t("application.documentsEmpty")}</Text>}{documents.length > 0 && <ul className="application-document-list">{documents.map((document) => <li key={document.id}><button className="application-document-link" type="button" onClick={() => void download(document)}>{document.fileName}</button><StatusBadge tone="neutral">{t(`application.documentStatus.${document.status}` as MessageKey)}</StatusBadge></li>)}</ul>}
      </Card>
      <Card title={t("application.verificationsTitle")}>
        {loaded && !resourceErrors.includes("verifications") && verifications.length === 0 && <Text muted>{t("application.verificationsEmpty")}</Text>}
        {verifications.map((item) => <div className="application-request" key={item.id}><strong>{t(`application.verificationType.${item.type}` as MessageKey)}</strong><StatusBadge tone={item.status === "SUCCESS" ? "positive" : item.status === "PENDING" ? "info" : "negative"}>{t(`application.verificationStatus.${item.status}` as MessageKey)}</StatusBadge></div>)}
      </Card>
      {decision && <Card title={t("application.decisionTitle")}><Text>{t(`application.decisionType.${decision.decisionType}` as MessageKey)}</Text><Text>{decision.reason}</Text></Card>}
      {decision?.offer && application.status === "OFFERED" && <Card title={t("application.offerTitle")}><Text>{decision.offer.amount.toLocaleString(locale)} ₽ · {decision.offer.termMonths} {t("dashboard.months")} · {decision.offer.interestRate}%</Text><div className="application-offer-actions"><Button loading={busy} onClick={() => void offerAction("accept")}>{t("application.offerAccept")}</Button><Button loading={busy} variant="secondary" onClick={() => void offerAction("decline")}>{t("application.offerDecline")}</Button></div></Card>}
      {fulfillment && <Card title={t("application.fulfillmentTitle")}><Text>{fulfillment.contractNumber ?? t("application.fulfillmentPending")}</Text>{fulfillment.disbursementAmount && <Text>{fulfillment.disbursementAmount.toLocaleString(locale)} ₽</Text>}</Card>}
</section>
  );
}
