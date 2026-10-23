import { ApplicationFinancials } from "./ApplicationFinancials";
import { ApplicationReview } from "./ApplicationReview";
import { ApplicationOutcome } from "./ApplicationOutcome";
import { ApplicationDocuments } from "./ApplicationDocuments";
import { apiErrorKey } from "../../api/errorMessage";
import { ApplicationNavigation, applicationSections } from "./ApplicationNavigation";
import { useEffect, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { Link, useParams, useSearchParams } from "react-router";
import { Alert, Button, Card, Heading, Modal, PageState, StatusBadge, Text, TextField } from "../../components";
import { useAuth } from "../../auth";
import { useLocale } from "../../i18n";
import type { MessageKey } from "../../i18n";
import { routes } from "../../config/routes";
import { MlProfileForm } from "../../features/credit-application/ui/MlProfileForm";
import { acceptOffer, answerInformationRequest, declineOffer, downloadDocument, saveFinancialSnapshot, submitLoanApplication, updateLoanApplication, uploadDocument, loadCreditProduct } from "../../features/credit-application/api/creditApplicationApi";
import type { DocumentResponse, InformationRequest, LoanApplicationResponse, CreditProductAdmin } from "../../features/credit-application/api/creditApplicationApi";
import { validMoney, validTerm, moneyValue } from "../../features/credit-application/model/inputValidation";
import { useApplicationData } from "./useApplicationData";
import { getApplicationStage } from "./applicationProgress";
import "./ApplicationDetailsPage.css";

function tone(status: string) {
  if (["REJECTED", "DECLINED", "EXPIRED"].includes(status))
    return "negative" as const;
  if (["OFFERED", "ACCEPTED", "DISBURSED"].includes(status))
    return "positive" as const;
  return "info" as const;
}

export function ApplicationDetailsPage() {
  const { applicationId } = useParams();
  return <ApplicationDetails key={applicationId} applicationId={applicationId} />;
}

function ApplicationDetails({ applicationId }: { applicationId: string | undefined }) {
  const { api } = useAuth();
  const { t, locale } = useLocale();
  const [mlReady, setMlReady] = useState(false);
  const [search, setSearch] = useSearchParams();
  const steps: Record<string, string> = { parameters: "application-summary", financial: "application-financial", documents: "application-documents", review: "application-review", decision: "application-decision", outcome: "application-fulfillment" };
  const selectedSection = steps[search.get("step") ?? "parameters"] ?? "application-summary";
  function setSelectedSection(section: string) {
    const next = new URLSearchParams(search);
    next.set("step", Object.keys(steps).find((key) => steps[key] === section) ?? "parameters");
    next.delete("created");
    setSearch(next, { replace: true });
  }
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [draftSaving, setDraftSaving] = useState(false);
  const [draftSaved, setDraftSaved] = useState(false);
  const [financialSaved, setFinancialSaved] = useState(false);
  const [financial, setFinancial] = useState({ annualRevenue: "", annualExpenses: "", existingDebt: "", monthlyPayments: "", employeeCount: "", period: "" });
  const [draft, setDraft] = useState({ requestedAmount: "", termMonths: "", purpose: "" });
  const [answer, setAnswer] = useState<Record<string, string>>({});
  const [actionError, setActionError] = useState<MessageKey | null>(null);
  const [now, setNow] = useState(Date.now());
  const [requestDocumentId, setRequestDocumentId] = useState("");
  const [offerConfirmation, setOfferConfirmation] = useState<"accept" | "decline" | null>(null);
  const [product, setProduct] = useState<CreditProductAdmin | null>(null);
  const draftDirtyRef = useRef(false);
  const financialDirtyRef = useRef(false);
  const uploadType = "SUPPORTING_DOCUMENT";
  const { data, setResource, errors, loaded, refreshing, reload: refresh } = useApplicationData(applicationId, selectedSection, busy || submitting || draftSaving);
  const { application, requests: informationRequests, documents, decision, fulfillment, verifications, history, financial: snapshot } = data;
  const reload = () => refresh();
  const error = errors.application !== undefined;
  const resourceErrors = Object.keys(errors).filter((key) => key !== "application");
  const setApplication: Dispatch<SetStateAction<LoanApplicationResponse | null>> = (value) => setResource("application", value);
  const setDocuments: Dispatch<SetStateAction<DocumentResponse[]>> = (value) => setResource("documents", value);
  const setInformationRequests: Dispatch<SetStateAction<InformationRequest[]>> = (value) => setResource("requests", value);
  useEffect(() => {
    if (!snapshot || financialDirtyRef.current) return;
    setFinancial({ annualRevenue: String(snapshot.annualRevenue), annualExpenses: String(snapshot.annualExpenses), existingDebt: String(snapshot.existingDebt), monthlyPayments: String(snapshot.monthlyPayments), employeeCount: String(snapshot.employeeCount), period: snapshot.period });
    setFinancialSaved(true);
  }, [snapshot]);
  useEffect(() => {
    if (!application || draftDirtyRef.current) return;
    setDraft({ requestedAmount: String(application.requestedAmount), termMonths: String(application.termMonths), purpose: application.purpose });
  }, [application]);
  useEffect(() => {
    if (!application?.productId) return;
    let active = true;
    void loadCreditProduct(api, application.productId).then((value) => { if (active) setProduct(value); }).catch(() => { if (active) setProduct(null); });
    return () => { active = false; };
  }, [api, application?.productId]);
  useEffect(() => {
    if (application?.status !== "OFFERED") return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [application?.status]);

  if (error || !applicationId)
    return (
      <PageState
        kind="error"
        title={t("application.detailsErrorTitle")}
        description={t("application.detailsErrorDescription")}
        action={<Button onClick={reload}>{t("application.retry")}</Button>}
      />
    );
  if (!application)
    return <PageState kind="loading" title={t("application.detailsLoading")} />;

  const currentStage = getApplicationStage(application.status);
  const completedSections = new Set(
    applicationSections
      .filter((section) => {
        if (section.key === "summary") return application.status !== "DRAFT" || draftSaved;
        if (section.key === "financial")
          return !resourceErrors.includes("financial") && financialSaved && mlReady;
        if (section.key === "documents")
          return !resourceErrors.includes("documents") && documents.length > 0 && !informationRequests.some((item) => item.status === "OPEN" && item.requiresDocument);
        if (section.key === "review")
          return !resourceErrors.includes("verifications") && currentStage > 3;
        if (section.key === "decision")
          return !resourceErrors.includes("decision") && decision != null;
        return !resourceErrors.includes("fulfillment") && (application.status === "DISBURSED" || fulfillment?.disbursedAt != null);
      })
      .map((section) => section.id),
  );
  const isTerminal = ["REJECTED", "DECLINED", "EXPIRED", "DISBURSED"].includes(
    application.status,
  );
  const draftErrors = {
    requestedAmount: !validMoney(draft.requestedAmount, false) ? t("workflow.moneyError") : product && (Number(draft.requestedAmount) < (product.minAmount ?? 0) || Number(draft.requestedAmount) > (product.maxAmount ?? Infinity)) ? t("application.validation.productAmount") : undefined,
    termMonths: !validTerm(draft.termMonths) ? t("workflow.termError") : product && (Number(draft.termMonths) < product.minTermMonths || Number(draft.termMonths) > (product.maxTermMonths ?? Infinity)) ? t("application.validation.productTerm") : undefined,
    purpose: !draft.purpose.trim() || draft.purpose.trim().length > 255 ? t("workflow.textError") : undefined,
  };
  const financialErrors = Object.fromEntries(Object.entries(financial).map(([key,value]) => [key,
    key === "period" ? (!value.trim() || value.length > 255 ? t("workflow.textError") : undefined)
    : key === "employeeCount" ? (!/^\d+$/.test(value) || Number(value) > 2147483647 ? t("workflow.termError") : undefined)
    : !validMoney(value) ? t("workflow.moneyError") : undefined]));
  const id = applicationId;
  const draftDirty =
    draft.requestedAmount !== String(application.requestedAmount) ||
    draft.termMonths !== String(application.termMonths) ||
    draft.purpose !== application.purpose;
  const offerExpired =
    !!decision?.offer?.expiresAt && Date.parse(decision.offer.expiresAt) <= now;
  async function submit() {
    if (!api || busy || submitting) return;
    setSubmitting(true);
    setSubmitError(false);
    try {
      setApplication(await submitLoanApplication(api, id));
      refresh(["application", "requests", "verifications", "history"]);
    } catch {
      setSubmitError(true);
    } finally {
      setSubmitting(false);
    }
  }
  async function saveFinancial() {
    if (!api || busy) return;
    setBusy(true);
    setActionError(null);
    try {
      const savedSnapshot = await saveFinancialSnapshot(api, id, {
        annualRevenue: moneyValue(financial.annualRevenue),
        annualExpenses: moneyValue(financial.annualExpenses),
        existingDebt: moneyValue(financial.existingDebt),
        monthlyPayments: moneyValue(financial.monthlyPayments),
        employeeCount: Number(financial.employeeCount),
        period: financial.period,
      });
      setResource("financial", savedSnapshot);
      financialDirtyRef.current = false;
      setFinancialSaved(true);
    } catch (reason) {
      setFinancialSaved(false);
      setActionError(apiErrorKey(reason));
    } finally {
      setBusy(false);
    }
  }
  async function saveDraft() {
    if (!api || busy || draftSaving) return;
    setDraftSaving(true);
    setDraftSaved(false);
    setActionError(null);
    try {
      const updated = await updateLoanApplication(api, id, {
        requestedAmount: moneyValue(draft.requestedAmount),
        termMonths: Number(draft.termMonths),
        purpose: draft.purpose.trim(),
      });
      setApplication(updated);
      draftDirtyRef.current = false;
      setDraftSaved(true);
      setSelectedSection("application-financial");
    } catch (reason) {
      setActionError(apiErrorKey(reason));
    } finally {
      setDraftSaving(false);
    }
  }
  async function answerRequest(request: InformationRequest) {
    const value = answer[request.id]?.trim();
    if (!api || !value || busy) return;
    setBusy(true);
    setActionError(null);
    try {
      const updated = await answerInformationRequest(
        api,
        id,
        request.id,
        value,
      );
      setInformationRequests((items) =>
        items.map((item) => (item.id === updated.id ? updated : item)),
      );
      refresh(["application", "requests", "history"]);
    } catch (reason) {
      setActionError(apiErrorKey(reason));
    } finally {
      setBusy(false);
    }
  }
  async function offerAction(action: "accept" | "decline") {
    if (!api || busy || offerExpired || application?.status !== "OFFERED") return;
    setBusy(true);
    setActionError(null);
    try {
      const result =
        action === "accept"
          ? await acceptOffer(api, id)
          : await declineOffer(api, id);
      setApplication((item) =>
        item ? { ...item, status: result.applicationStatus } : item,
      );
      setOfferConfirmation(null);
      refresh(["application", "decision", "fulfillment", "history"]);
    } catch (reason) {
      setActionError(apiErrorKey(reason));
    } finally {
      setBusy(false);
    }
  }
  async function upload(file: File) {
    if (!api || busy) return;
    setBusy(true);
    setActionError(null);
    try {
      const uploaded = await uploadDocument(
        api,
        id,
        uploadType,
        file,
        requestDocumentId || undefined,
      );
      setDocuments((items) => [uploaded, ...items]);
      setRequestDocumentId("");
      refresh(["application", "requests", "documents", "history"]);
    } catch (reason) {
      setActionError(apiErrorKey(reason));
    } finally {
      setBusy(false);
    }
  }
  async function download(document: DocumentResponse) {
    if (!api || busy) return;
    setBusy(true);
    setActionError(null);
    try {
      const blob = await downloadDocument(api, document.id);
      const url = URL.createObjectURL(blob);
      const anchor = window.document.createElement("a");
      anchor.href = url;
      anchor.download = document.fileName;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (reason) {
      setActionError(apiErrorKey(reason));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="application-details">
      <Link className="application-details__back" to={routes.dashboard}>
        {t("application.detailsBack")}
      </Link>
      <div className="application-details__heading">
        <div>
          <Text muted>{t("application.detailsEyebrow")}</Text>
          <Heading level={1}>{t("application.detailsTitle")}</Heading>
        </div>
        <Button variant="secondary" disabled={refreshing} onClick={reload}>
          {t("application.refresh")}
        </Button>
        <StatusBadge tone={tone(application.status)}>
          {t(`dashboard.status.${application.status}` as MessageKey)}
        </StatusBadge>
      </div>
      {!loaded && <Text muted>{t("application.detailsLoading")}</Text>}
      {resourceErrors.filter((key) => key !== "fulfillment" || selectedSection === "application-fulfillment").length > 0 && (
        <Alert tone="negative" title={t("application.apiErrorTitle")}>
          {resourceErrors.filter((key) => key !== "fulfillment" || selectedSection === "application-fulfillment").map((name) => (
            <Text key={name}>
              {t(`application.resource.${name}` as MessageKey)}
              {errors[name as keyof typeof errors] === 404 && <span> · {t("workflow.apiUnavailable")}</span>}
            </Text>
          ))}
          <Button variant="secondary" onClick={reload}>
            {t("application.retry")}
          </Button>
        </Alert>
      )}
      {submitError && (
        <Alert tone="negative" title={t("application.submitErrorTitle")}>
          {t("application.submitErrorDescription")}
        </Alert>
      )}
      {actionError && (
        <Alert tone="negative" title={t("application.actionErrorTitle")}>
          {t(actionError ?? "application.actionErrorDescription")}
        </Alert>
      )}
      {search.get("created") === "1" && <Alert tone="positive" title={t("workflow.draftCreated")} />}
      <Card title={t("workflow.next")}><Text>{t(("workflow.status." + application.status) as MessageKey)}</Text>
        {["DRAFT", "NEEDS_INFO", "OFFERED", "ACCEPTED", "AGREEMENT_PENDING"].includes(application.status) && <Button variant="secondary" onClick={() => setSelectedSection(application.status === "DRAFT" ? (!financialSaved || !mlReady ? "application-financial" : "application-review") : application.status === "NEEDS_INFO" ? "application-documents" : application.status === "OFFERED" ? "application-decision" : "application-fulfillment")}>
          {t(application.status === "DRAFT" ? (!financialSaved || !mlReady ? "application.workflow.financial" : "application.workflow.review") : application.status === "NEEDS_INFO" ? "application.workflow.documents" : application.status === "OFFERED" ? "application.workflow.decision" : "application.workflow.fulfillment")}
        </Button>}
      </Card>
      <ApplicationNavigation selectedSection={selectedSection} setSelectedSection={setSelectedSection} completedSections={completedSections} />
      <div role="tabpanel" id="application-summary-panel" aria-labelledby="application-summary-tab" hidden={selectedSection !== "application-summary"} className="application-section-panel">
      <Card id="application-summary" title={t("application.detailsSummaryTitle")}>
        <dl className="application-details__summary">
          <div>
            <dt>{t("application.summary.amount")}</dt>
            <dd>{application.requestedAmount.toLocaleString(locale)} ₽</dd>
          </div>
          <div>
            <dt>{t("application.summary.term")}</dt>
            <dd>
              {application.termMonths} {t("dashboard.months")}
            </dd>
          </div>
          <div>
            <dt>{t("application.summary.purpose")}</dt>
            <dd>{application.purpose === "working_capital" ? t("application.purposes.workingCapital") : application.purpose === "equipment" ? t("application.purposes.equipment") : application.purpose === "refinance" ? t("application.purposes.refinance") : application.purpose}</dd>
          </div>
        </dl>
      </Card>
      {application.status === "DRAFT" && (
        <Card title={t("application.editTitle")}>
          <div className="application-financial-grid">
            <TextField
              disabled={draftSaving}
              error={draftErrors.requestedAmount}
              name="draftAmount"
              label={t("application.summary.amount")}
              inputMode="decimal"
              value={draft.requestedAmount}
              onChange={(event) => {
                draftDirtyRef.current = true;
                setDraftSaved(false);
                setDraft((current) => ({
                  ...current,
                  requestedAmount: event.target.value,
                }));
              }}
            />
            <TextField
              disabled={draftSaving}
              error={draftErrors.termMonths}
              name="draftTerm"
              label={t("application.summary.term")}
              inputMode="numeric"
              value={draft.termMonths}
              onChange={(event) => {
                draftDirtyRef.current = true;
                setDraftSaved(false);
                setDraft((current) => ({
                  ...current,
                  termMonths: event.target.value,
                }));
              }}
            />
            <TextField
              disabled={draftSaving}
              maxLength={255} error={draftErrors.purpose}
              name="draftPurpose"
              label={t("application.summary.purpose")}
              value={draft.purpose}
              onChange={(event) => {
                draftDirtyRef.current = true;
                setDraftSaved(false);
                setDraft((current) => ({
                  ...current,
                  purpose: event.target.value,
                }));
              }}
            />
          </div>
          <Button
            disabled={Object.values(draftErrors).some(Boolean)}
            loading={draftSaving}
            onClick={() => void saveDraft()}
          >
            {draftSaved
              ? t("application.draftSaved")
              : t("application.draftSave")}
          </Button>
        </Card>
      )}
      </div>
      <ApplicationReview selectedSection={selectedSection} application={application} snapshot={snapshot} currentStage={currentStage} financialSaved={financialSaved} mlReady={mlReady} draftDirty={draftDirty} busy={busy} draftSaving={draftSaving} submitting={submitting} submit={submit} isTerminal={isTerminal} verifications={verifications} history={history} loaded={loaded} resourceErrors={resourceErrors} />
      <div role="tabpanel" id="application-financial-panel" aria-labelledby="application-financial-tab" hidden={selectedSection !== "application-financial"} className="application-section-panel">
      <ApplicationFinancials values={financial} errors={financialErrors} readOnly={application.status !== "DRAFT"} busy={busy} saved={financialSaved} onSave={saveFinancial} onChange={(field,value) => {financialDirtyRef.current=true;setFinancialSaved(false);setFinancial((current)=>({...current,[field]:value}));}} />
      <MlProfileForm
        applicationId={applicationId}
        readOnly={application.status !== "DRAFT"}
        onReady={setMlReady}
      />
      </div>
      <div role="tabpanel" id="application-documents-panel" aria-labelledby="application-documents-tab" hidden={selectedSection !== "application-documents"} className="application-section-panel">
      <ApplicationDocuments informationRequests={informationRequests} documents={documents} answer={answer} setAnswer={setAnswer} busy={busy} requestDocumentId={requestDocumentId} setRequestDocumentId={setRequestDocumentId} loaded={loaded} resourceErrors={resourceErrors} answerRequest={answerRequest} download={download} upload={upload} />
      </div>
      <ApplicationOutcome selectedSection={selectedSection} decision={decision} fulfillment={fulfillment} application={application} offerExpired={offerExpired} busy={busy} setOfferConfirmation={setOfferConfirmation} />
      <Modal open={offerConfirmation !== null} onClose={() => { if (!busy) setOfferConfirmation(null); }} title={t("workflow.offerConfirm")}
        footer={<><Button variant="secondary" disabled={busy} onClick={() => setOfferConfirmation(null)}>{t("application.actions.back")}</Button><Button loading={busy} disabled={offerExpired || application.status !== "OFFERED"} onClick={() => { if (offerConfirmation) void offerAction(offerConfirmation); }}>{t("application.actions.confirm")}</Button></>}>
        <Text>{t(offerConfirmation === "accept" ? "workflow.offerAcceptHint" : "workflow.offerDeclineHint")}</Text>
        {decision?.offer && <Text>{decision.offer.amount.toLocaleString(locale)} ₽ · {decision.offer.termMonths} {t("dashboard.months")} · {decision.offer.interestRate}%</Text>}
        {actionError && <Alert tone="negative" title={t("application.actionErrorTitle")} />}
      </Modal>
    </section>
  );
}
