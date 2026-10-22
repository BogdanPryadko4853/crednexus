import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { Alert, Button, Card, Heading, PageState, StatusBadge, Text, TextField, SelectField } from "../../components";
import { useAuth } from "../../auth";
import { useLocale } from "../../i18n";
import type { MessageKey } from "../../i18n";
import { routes } from "../../config/routes";
import { acceptOffer, answerInformationRequest, declineOffer, loadDecision, loadDocuments, loadFulfillment, loadInformationRequests, loadLoanApplication, saveFinancialSnapshot, submitLoanApplication, uploadDocument } from "../../features/credit-application/api/creditApplicationApi";
import type { CreditDecision, DocumentResponse, Fulfillment, InformationRequest, LoanApplicationResponse } from "../../features/credit-application/api/creditApplicationApi";
import "./ApplicationDetailsPage.css";

const stages = ["DRAFT", "SUBMITTED", "VERIFYING", "SCORING", "OFFERED"] as const;

function tone(status: string) {
  if (["REJECTED", "DECLINED", "EXPIRED"].includes(status)) return "negative" as const;
  if (["OFFERED", "ACCEPTED", "DISBURSED"].includes(status)) return "positive" as const;
  return "info" as const;
}

export function ApplicationDetailsPage() {
  const { applicationId } = useParams();
  const { api } = useAuth();
  const { t } = useLocale();
  const navigate = useNavigate();
  const [application, setApplication] = useState<LoanApplicationResponse | null>(null);
  const [error, setError] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(false);
  const [informationRequests, setInformationRequests] = useState<InformationRequest[]>([]);
  const [documents, setDocuments] = useState<DocumentResponse[]>([]);
  const [decision, setDecision] = useState<CreditDecision | null>(null);
  const [fulfillment, setFulfillment] = useState<Fulfillment | null>(null);
  const [answer, setAnswer] = useState<Record<string, string>>({});
  const [financial, setFinancial] = useState({ annualRevenue: "", annualExpenses: "", existingDebt: "", monthlyPayments: "", employeeCount: "", period: "2026-Q3" });
  const [financialSaved, setFinancialSaved] = useState(false);
  const [uploadType, setUploadType] = useState("OTHER");
  const [actionError, setActionError] = useState(false);

  useEffect(() => {
    if (!api || !applicationId) return;
    let active = true;
    void loadLoanApplication(api, applicationId).then((item) => {
      if (active) setApplication(item);
    }).catch(() => {
      if (active) setError(true);
    });
    void loadInformationRequests(api, applicationId).then(setInformationRequests).catch(() => undefined);
    void loadDocuments(api, applicationId).then(setDocuments).catch(() => undefined);
    void loadDecision(api, applicationId).then(setDecision).catch(() => undefined);
    void loadFulfillment(api, applicationId).then(setFulfillment).catch(() => undefined);
    return () => { active = false; };
  }, [api, applicationId]);

  if (error || !applicationId)
    return <PageState kind="error" title={t("application.detailsErrorTitle")} description={t("application.detailsErrorDescription")} />;
  if (!application)
    return <PageState kind="loading" title={t("application.detailsLoading")} />;

  const currentStage = stages.indexOf(application.status as (typeof stages)[number]);
  const isTerminal = ["REJECTED", "DECLINED", "EXPIRED", "DISBURSED"].includes(application.status);
  const id = applicationId;
  async function submit() {
    if (!api) return;
    setSubmitting(true);
    setSubmitError(false);
    try {
      setApplication(await submitLoanApplication(api, id));
    } catch {
      setSubmitError(true);
    } finally {
      setSubmitting(false);
    }
  }
  async function saveFinancial() {
    if (!api) return;
    try {
      await saveFinancialSnapshot(api, id, {
        annualRevenue: Number(financial.annualRevenue), annualExpenses: Number(financial.annualExpenses),
        existingDebt: Number(financial.existingDebt), monthlyPayments: Number(financial.monthlyPayments),
        employeeCount: Number(financial.employeeCount), period: financial.period,
      });
      setFinancialSaved(true);
    } catch { setActionError(true); }
  }
  async function answerRequest(request: InformationRequest) {
    const value = answer[request.id]?.trim();
    if (!api || !value) return;
    try {
      const updated = await answerInformationRequest(api, id, request.id, value);
      setInformationRequests((items) => items.map((item) => item.id === updated.id ? updated : item));
    } catch { setActionError(true); }
  }
  async function offerAction(action: "accept" | "decline") {
    if (!api) return;
    try {
      const result = action === "accept" ? await acceptOffer(api, id) : await declineOffer(api, id);
      setApplication((item) => item ? { ...item, status: result.applicationStatus } : item);
    } catch { setActionError(true); }
  }
  async function upload(file: File) {
    if (!api) return;
    try {
      const uploaded = await uploadDocument(api, id, uploadType, file);
      setDocuments((items) => [uploaded, ...items]);
    } catch { setActionError(true); }
  }

  return (
    <section className="application-details">
      <Link className="application-details__back" to={routes.dashboard}>{t("application.detailsBack")}</Link>
      <div className="application-details__heading">
        <div>
          <Text muted>{t("application.detailsEyebrow")}</Text>
          <Heading level={1}>{t("application.detailsTitle")}</Heading>
        </div>
        <StatusBadge tone={tone(application.status)}>{t(`dashboard.status.${application.status}` as MessageKey)}</StatusBadge>
      </div>
      {submitError && <Alert tone="negative" title={t("application.submitErrorTitle")}>{t("application.submitErrorDescription")}</Alert>}
      {actionError && <Alert tone="negative" title={t("application.actionErrorTitle")}>{t("application.actionErrorDescription")}</Alert>}
      <Card title={t("application.detailsSummaryTitle")}>
        <dl className="application-details__summary">
          <div><dt>{t("application.summary.amount")}</dt><dd>{application.requestedAmount.toLocaleString("ru-RU")} ₽</dd></div>
          <div><dt>{t("application.summary.term")}</dt><dd>{application.termMonths} {t("dashboard.months")}</dd></div>
          <div><dt>{t("application.summary.purpose")}</dt><dd>{application.purpose}</dd></div>
        </dl>
      </Card>
      <Card title={t("application.progressTitle")}>
        <ol className="application-progress">
          {stages.map((stage, index) => <li className={index <= currentStage ? "is-active" : ""} key={stage}><span>{index + 1}</span>{t(`dashboard.status.${stage}` as MessageKey)}</li>)}
        </ol>
        {application.status === "DRAFT" && <Button loading={submitting} onClick={() => void submit()}>{t("application.submitAction")}</Button>}
        {isTerminal && <Text muted>{t("application.progressTerminal")}</Text>}
      </Card>
      {application.status === "DRAFT" && <Card title={t("application.financialTitle")} subtitle={t("application.financialDescription")}>
        <div className="application-financial-grid">
          {(["annualRevenue", "annualExpenses", "existingDebt", "monthlyPayments", "employeeCount"] as const).map((field) => <TextField key={field} name={field} label={t(`application.financial.${field}` as MessageKey)} inputMode="decimal" value={financial[field]} onChange={(event) => setFinancial((current) => ({ ...current, [field]: event.target.value }))} />)}
          <TextField name="period" label={t("application.financial.period")} value={financial.period} onChange={(event) => setFinancial((current) => ({ ...current, period: event.target.value }))} />
        </div>
        <Button onClick={() => void saveFinancial()}>{financialSaved ? t("application.financialSaved") : t("application.financialSave")}</Button>
      </Card>}
      {informationRequests.length > 0 && <Card title={t("application.requestsTitle")}>
        <div className="application-requests">{informationRequests.map((request) => <div className="application-request" key={request.id}><strong>{request.question}</strong>{request.status === "OPEN" && <><TextField name={`answer-${request.id}`} label={t("application.answerLabel")} value={answer[request.id] ?? ""} onChange={(event) => setAnswer((current) => ({ ...current, [request.id]: event.target.value }))} /><Button size="sm" onClick={() => void answerRequest(request)}>{t("application.answerAction")}</Button></>}</div>)}</div>
      </Card>}
      <Card title={t("application.documentsTitle")}>
        <div className="application-document-upload"><SelectField name="documentType" label={t("application.documentType")} value={uploadType} onChange={(event) => setUploadType(event.target.value)}><option value="OTHER">{t("application.documentOther")}</option><option value="FINANCIAL_STATEMENTS">{t("application.documentFinancial")}</option><option value="TAX_RETURN">{t("application.documentTax")}</option></SelectField><input type="file" accept="application/pdf,image/png,image/jpeg" onChange={(event) => { const file = event.target.files?.[0]; if (file) void upload(file); }} /></div>
        {documents.length > 0 && <ul className="application-document-list">{documents.map((document) => <li key={document.id}>{document.fileName}<StatusBadge tone="neutral">{document.status}</StatusBadge></li>)}</ul>}
      </Card>
      {decision?.offer && application.status === "OFFERED" && <Card title={t("application.offerTitle")}><Text>{decision.offer.amount.toLocaleString("ru-RU")} ₽ · {decision.offer.termMonths} {t("dashboard.months")} · {decision.offer.interestRate}%</Text><div className="application-offer-actions"><Button onClick={() => void offerAction("accept")}>{t("application.offerAccept")}</Button><Button variant="secondary" onClick={() => void offerAction("decline")}>{t("application.offerDecline")}</Button></div></Card>}
      {fulfillment && <Card title={t("application.fulfillmentTitle")}><Text>{fulfillment.contractNumber ?? t("application.fulfillmentPending")}</Text>{fulfillment.disbursementAmount && <Text>{fulfillment.disbursementAmount.toLocaleString("ru-RU")} ₽</Text>}</Card>}
      {application.status === "DRAFT" && <Button variant="secondary" onClick={() => navigate(routes.creditApplication)}>{t("application.editAction")}</Button>}
    </section>
  );
}
