import { useEffect, useRef, useState } from "react";
import { MlProfileForm } from "../../features/credit-application/ui/MlProfileForm";
import { workflowText } from "../../features/credit-application/ui/workflowText";
import { loadApplicationHistory } from "../../features/credit-application/api/creditApplicationApi";
import type { ApplicationHistory } from "../../features/credit-application/api/creditApplicationApi";
import { Link, useParams } from "react-router";
import {
  Alert,
  Button,
  Card,
  Heading,
  PageState,
  StatusBadge,
  Text,
  TextField,
  SelectField,
} from "../../components";
import { useAuth } from "../../auth";
import { useLocale } from "../../i18n";
import type { MessageKey } from "../../i18n";
import { ApiError } from "../../api/httpClient";
import { routes } from "../../config/routes";
import {
  acceptOffer,
  answerInformationRequest,
  declineOffer,
  downloadDocument,
  loadVerifications,
  loadDecision,
  loadDocuments,
  loadFinancialSnapshot,
  loadFulfillment,
  loadInformationRequests,
  loadLoanApplication,
  saveFinancialSnapshot,
  submitLoanApplication,
  updateLoanApplication,
  uploadDocument,
} from "../../features/credit-application/api/creditApplicationApi";
import type {
  VerificationResult,
  CreditDecision,
  DocumentResponse,
  Fulfillment,
  InformationRequest,
  LoanApplicationResponse,
} from "../../features/credit-application/api/creditApplicationApi";
import "./ApplicationDetailsPage.css";
import { getApplicationStage } from "./applicationProgress";

const stages = [
  "DRAFT",
  "SUBMITTED",
  "VERIFYING",
  "SCORING",
  "OFFERED",
  "AGREEMENT_PENDING",
  "DISBURSED",
] as const;

const applicationSections = [
  { id: "application-summary", key: "summary" },
  { id: "application-financial", key: "financial" },
  { id: "application-documents", key: "documents" },
  { id: "application-review", key: "review" },
  { id: "application-decision", key: "decision" },
  { id: "application-fulfillment", key: "fulfillment" },
] as const;

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
  const text = workflowText[locale];
  const [mlReady, setMlReady] = useState(false);
  const [selectedSection, setSelectedSection] = useState("application-summary");
  const [history, setHistory] = useState<ApplicationHistory[]>([]);

  const [application, setApplication] =
    useState<LoanApplicationResponse | null>(null);
  const [error, setError] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(false);
  const [informationRequests, setInformationRequests] = useState<
    InformationRequest[]
  >([]);
  const [documents, setDocuments] = useState<DocumentResponse[]>([]);
  const [decision, setDecision] = useState<CreditDecision | null>(null);
  const [fulfillment, setFulfillment] = useState<Fulfillment | null>(null);
  const [answer, setAnswer] = useState<Record<string, string>>({});
  const [financial, setFinancial] = useState({
    annualRevenue: "",
    annualExpenses: "",
    existingDebt: "",
    monthlyPayments: "",
    employeeCount: "",
    period: "",
  });
  const [financialSaved, setFinancialSaved] = useState(false);
  const [draft, setDraft] = useState({
    requestedAmount: "",
    termMonths: "",
    purpose: "",
  });
  const [draftSaved, setDraftSaved] = useState(false);
  const [draftSaving, setDraftSaving] = useState(false);
  const uploadType = "SUPPORTING_DOCUMENT";
  const [fileError, setFileError] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [actionError, setActionError] = useState(false);
  const [revision, setRevision] = useState(0);
  const [verifications, setVerifications] = useState<VerificationResult[]>([]);
  const [resourceErrors, setResourceErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [requestDocumentId, setRequestDocumentId] = useState("");
  const draftDirtyRef = useRef(false);
  const financialDirtyRef = useRef(false);
  const loadedApplicationIdRef = useRef<string | undefined>(undefined);
  const reload = () => setRevision((value) => value + 1);

  useEffect(() => {
    if (!api || !applicationId) return;
    let active = true;
    setError(false);
    if (loadedApplicationIdRef.current !== applicationId) {
      loadedApplicationIdRef.current = applicationId;
      setResourceErrors([]);
      setLoaded(false);
      draftDirtyRef.current = false;
      financialDirtyRef.current = false;
    }
    async function resource<T>(
      name: string,
      promise: Promise<T>,
      apply: (value: T) => void,
      optional = false,
    ) {
      try {
        const value = await promise;
        if (active) {
          apply(value);
          setResourceErrors((items) => items.filter((item) => item !== name));
        }
      } catch (error) {
        if (
          active &&
          !(optional && error instanceof ApiError && error.status === 404)
        ) {
          setResourceErrors((items) => items.includes(name) ? items : [...items, name]);
        } else if (active) {
          setResourceErrors((items) => items.filter((item) => item !== name));
        }
      }
    }
    void loadLoanApplication(api, applicationId)
      .then((item) => {
        if (active) setApplication(item);
      })
      .catch(() => {
        if (active) setError(true);
      });
    void Promise.all([
      resource(
        "requests",
        loadInformationRequests(api, applicationId),
        setInformationRequests,
      ),
      resource("documents", loadDocuments(api, applicationId), setDocuments),
      resource("decision", loadDecision(api, applicationId), setDecision, true),
      resource(
        "fulfillment",
        loadFulfillment(api, applicationId),
        setFulfillment,
        true,
      ),
      resource(
        "verifications",
        loadVerifications(api, applicationId),
        setVerifications,
      ),
      resource(
        "financial",
        loadFinancialSnapshot(api, applicationId),
        (snapshot) => {
          if (!financialDirtyRef.current) {
            setFinancial({
              annualRevenue: String(snapshot.annualRevenue),
              annualExpenses: String(snapshot.annualExpenses),
              existingDebt: String(snapshot.existingDebt),
              monthlyPayments: String(snapshot.monthlyPayments),
              employeeCount: String(snapshot.employeeCount),
              period: snapshot.period,
            });
            setFinancialSaved(true);
          }
        },
        true,
      ),
      resource(
        "history",
        loadApplicationHistory(api, applicationId),
        setHistory,
        true,
      ),
    ]).finally(() => {
      if (active) setLoaded(true);
    });
    return () => {
      active = false;
    };
  }, [api, applicationId, revision]);

  useEffect(() => {
    if (
      !loaded ||
      !application ||
      ![
        "SUBMITTED",
        "VERIFYING",
        "SCORING",
        "OFFERED",
        "ACCEPTED",
        "AGREEMENT_PENDING",
        "MANUAL_REVIEW",
        "NEEDS_INFO",
      ].includes(application.status)
    )
      return;
    const timer = window.setInterval(() => {
      if (!busy && !submitting && !draftSaving && !window.document.hidden) {
        // Keep user-entered answers intact while refreshing the server state.
        setRevision((value) => value + 1);
      }
    }, 5000);
    return () => window.clearInterval(timer);
  }, [application?.status, loaded, busy, submitting, draftSaving]);

  useEffect(() => {
    if (application?.status !== "OFFERED") return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [application?.status]);

  useEffect(() => {
    if (application && !draftDirtyRef.current) {
      setDraft({
        requestedAmount: String(application.requestedAmount),
        termMonths: String(application.termMonths),
        purpose: application.purpose,
      });
    }
  }, [application]);

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
          return !resourceErrors.includes("financial") && (currentStage >= 2 || (financialSaved && mlReady));
        if (section.key === "documents")
          return !resourceErrors.includes("documents") && (documents.length > 0 || currentStage >= 3);
        if (section.key === "review")
          return !resourceErrors.includes("verifications") && currentStage > 3;
        if (section.key === "decision")
          return !resourceErrors.includes("decision") && currentStage > 4;
        return !resourceErrors.includes("fulfillment") && (application.status === "DISBURSED" || fulfillment?.disbursedAt != null);
      })
      .map((section) => section.id),
  );
  const isTerminal = ["REJECTED", "DECLINED", "EXPIRED", "DISBURSED"].includes(
    application.status,
  );
  const id = applicationId;
  const draftDirty =
    draft.requestedAmount !== String(application.requestedAmount) ||
    draft.termMonths !== String(application.termMonths) ||
    draft.purpose !== application.purpose;
  const offerExpired =
    !!decision?.offer?.expiresAt && Date.parse(decision.offer.expiresAt) <= now;
  async function submit() {
    if (!api || busy) return;
    setSubmitting(true);
    setSubmitError(false);
    try {
      setApplication(await submitLoanApplication(api, id));
      reload();
    } catch {
      setSubmitError(true);
    } finally {
      setSubmitting(false);
    }
  }
  async function saveFinancial() {
    if (!api || busy) return;
    setBusy(true);
    setActionError(false);
    try {
      await saveFinancialSnapshot(api, id, {
        annualRevenue: Number(financial.annualRevenue),
        annualExpenses: Number(financial.annualExpenses),
        existingDebt: Number(financial.existingDebt),
        monthlyPayments: Number(financial.monthlyPayments),
        employeeCount: Number(financial.employeeCount),
        period: financial.period,
      });
      financialDirtyRef.current = false;
      setFinancialSaved(true);
    } catch {
      setFinancialSaved(false);
      setActionError(true);
    } finally {
      setBusy(false);
    }
  }
  async function saveDraft() {
    if (!api || busy) return;
    setDraftSaving(true);
    setDraftSaved(false);
    setActionError(false);
    try {
      const updated = await updateLoanApplication(api, id, {
        requestedAmount: Number(draft.requestedAmount),
        termMonths: Number(draft.termMonths),
        purpose: draft.purpose.trim(),
      });
      setApplication(updated);
      draftDirtyRef.current = false;
      setDraftSaved(true);
      setSelectedSection("application-financial");
    } catch {
      setActionError(true);
    } finally {
      setDraftSaving(false);
    }
  }
  async function answerRequest(request: InformationRequest) {
    const value = answer[request.id]?.trim();
    if (!api || !value || busy) return;
    setBusy(true);
    setActionError(false);
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
      reload();
    } catch {
      setActionError(true);
    } finally {
      setBusy(false);
    }
  }
  async function offerAction(action: "accept" | "decline") {
    if (!api || busy) return;
    setBusy(true);
    setActionError(false);
    try {
      const result =
        action === "accept"
          ? await acceptOffer(api, id)
          : await declineOffer(api, id);
      setApplication((item) =>
        item ? { ...item, status: result.applicationStatus } : item,
      );
      reload();
    } catch {
      setActionError(true);
    } finally {
      setBusy(false);
    }
  }
  async function upload(file: File) {
    if (!api || busy) return;
    setBusy(true);
    setActionError(false);
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
      reload();
    } catch {
      setActionError(true);
    } finally {
      setBusy(false);
    }
  }
  async function download(document: DocumentResponse) {
    if (!api || busy) return;
    setBusy(true);
    setActionError(false);
    try {
      const blob = await downloadDocument(api, document.id);
      const url = URL.createObjectURL(blob);
      const anchor = window.document.createElement("a");
      anchor.href = url;
      anchor.download = document.fileName;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch {
      setActionError(true);
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
        <Button variant="secondary" onClick={reload}>
          {t("application.refresh")}
        </Button>
        <StatusBadge tone={tone(application.status)}>
          {t(`dashboard.status.${application.status}` as MessageKey)}
        </StatusBadge>
      </div>
      {!loaded && <Text muted>{t("application.detailsLoading")}</Text>}
      {resourceErrors.length > 0 && (
        <Alert tone="negative" title={t("application.apiErrorTitle")}>
          {resourceErrors.map((name) => (
            <Text key={name}>
              {name === "history"
                ? text.history
                : t(`application.resource.${name}` as MessageKey)}
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
          {t("application.actionErrorDescription")}
        </Alert>
      )}
      <nav className="application-section-nav" aria-label={t("application.workflowTitle")}>
        <div className="application-section-nav__heading">
          <div>
            <Text muted>{t("application.workflowTitle")}</Text>
            <p>{t("application.workflowDescription")}</p>
          </div>
          <span className="application-section-nav__hint">{t("application.workflowHint")}</span>
        </div>
        <ol role="tablist" aria-label={t("application.workflowTitle")}>
          {applicationSections.map((section, index) => (
            <li key={section.id}>
              <button type="button" role="tab" id={`${section.id}-tab`}
                className={completedSections.has(section.id) ? "is-complete" : undefined}
                aria-selected={selectedSection === section.id} aria-controls={`${section.id}-panel`}
                tabIndex={selectedSection === section.id ? 0 : -1}
                onKeyDown={(event) => {
                  const offset = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
                  const target = event.key === "Home" ? applicationSections[0] : event.key === "End" ? applicationSections[applicationSections.length - 1] : offset ? applicationSections[(index + offset + applicationSections.length) % applicationSections.length] : null;
                  if (!target) return;
                  event.preventDefault();
                  setSelectedSection(target.id);
                  window.document.getElementById(`${target.id}-tab`)?.focus();
                }}
                onClick={() => setSelectedSection(section.id)}>
                <span aria-hidden="true">{completedSections.has(section.id) ? "✓" : index + 1}</span>
                {t(`application.workflow.${section.key}` as MessageKey)}
              </button>
            </li>
          ))}
        </ol>
      </nav>
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
            <dd>{application.purpose}</dd>
          </div>
        </dl>
      </Card>
      {application.status === "DRAFT" && (
        <Card title={t("application.editTitle")}>
          <div className="application-financial-grid">
            <TextField
              name="draftAmount"
              label={t("application.summary.amount")}
              inputMode="decimal"
              value={draft.requestedAmount}
              onChange={(event) => {
                draftDirtyRef.current = true;
                setDraft((current) => ({
                  ...current,
                  requestedAmount: event.target.value,
                }));
              }}
            />
            <TextField
              name="draftTerm"
              label={t("application.summary.term")}
              inputMode="numeric"
              value={draft.termMonths}
              onChange={(event) => {
                draftDirtyRef.current = true;
                setDraft((current) => ({
                  ...current,
                  termMonths: event.target.value,
                }));
              }}
            />
            <TextField
              name="draftPurpose"
              label={t("application.summary.purpose")}
              value={draft.purpose}
              onChange={(event) => {
                draftDirtyRef.current = true;
                setDraft((current) => ({
                  ...current,
                  purpose: event.target.value,
                }));
              }}
            />
          </div>
          <Button
            disabled={
              !Number.isFinite(Number(draft.requestedAmount)) ||
              Number(draft.requestedAmount) <= 0 ||
              !Number.isInteger(Number(draft.termMonths)) ||
              Number(draft.termMonths) < 1 ||
              !draft.purpose.trim() ||
              draft.purpose.trim().length > 255
            }
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
      <div role="tabpanel" id="application-review-panel" aria-labelledby="application-review-tab" hidden={selectedSection !== "application-review"} className="application-section-panel">
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
      <div role="tabpanel" id="application-financial-panel" aria-labelledby="application-financial-tab" hidden={selectedSection !== "application-financial"} className="application-section-panel">
      <Card
        id="application-financial"
        title={t("application.financialTitle")}
        subtitle={t("application.financialDescription")}
      >
        <div className="application-financial-grid">
          {(
            [
              "annualRevenue",
              "annualExpenses",
              "existingDebt",
              "monthlyPayments",
              "employeeCount",
            ] as const
          ).map((field) => (
            <TextField
              key={field}
              readOnly={application.status !== "DRAFT"}
              name={field}
              label={t(`application.financial.${field}` as MessageKey)}
              inputMode="decimal"
              value={financial[field]}
              onChange={(event) => {
                setFinancialSaved(false);
                financialDirtyRef.current = true;
                setFinancial((current) => ({
                  ...current,
                  [field]: event.target.value,
                }));
              }}
            />
          ))}
          <TextField
            name="period"
            readOnly={application.status !== "DRAFT"}
            label={t("application.financial.period")}
            value={financial.period}
            onChange={(event) => {
              setFinancialSaved(false);
              financialDirtyRef.current = true;
              setFinancial((current) => ({
                ...current,
                period: event.target.value,
              }));
            }}
          />
        </div>
        {application.status === "DRAFT" && (
          <Button
            loading={busy}
            disabled={
              !financial.period.trim() ||
              [
                financial.annualRevenue,
                financial.annualExpenses,
                financial.existingDebt,
                financial.monthlyPayments,
              ].some(
                (value) =>
                  !value.trim() ||
                  !Number.isFinite(Number(value)) ||
                  Number(value) < 0,
              ) ||
              !financial.employeeCount.trim() ||
              !Number.isInteger(Number(financial.employeeCount)) ||
              Number(financial.employeeCount) < 0
            }
            onClick={() => void saveFinancial()}
          >
            {financialSaved
              ? t("application.financialSaved")
              : t("application.financialSave")}
          </Button>
        )}
      </Card>
      <MlProfileForm
        applicationId={applicationId}
        readOnly={application.status !== "DRAFT"}
        onReady={setMlReady}
      />
      </div>
      <div role="tabpanel" id="application-documents-panel" aria-labelledby="application-documents-tab" hidden={selectedSection !== "application-documents"} className="application-section-panel">
      {informationRequests.length > 0 && (
        <Card id="application-documents" title={t("application.requestsTitle")}>
          <div className="application-requests">
            {informationRequests.map((request) => (
              <div className="application-request" key={request.id}>
                <strong>{request.question}</strong>
                {request.answer && <Text>{request.answer}</Text>}
                {request.status === "OPEN" &&
                  (request.requiresDocument ? (
                    <>
                      <Text muted>{text.documentRequired}</Text>
                      <Button
                        variant="secondary"
                        onClick={() => {
                          setRequestDocumentId(request.id);
                          window.document
                            .getElementById("document-upload")
                            ?.scrollIntoView({
                              behavior: "smooth",
                              block: "center",
                            });
                        }}
                      >
                        {t("application.documentsTitle")}
                      </Button>
                    </>
                  ) : (
                    <>
                      <TextField
                        name={`answer-${request.id}`}
                        label={t("application.answerLabel")}
                        value={answer[request.id] ?? ""}
                        onChange={(event) =>
                          setAnswer((current) => ({
                            ...current,
                            [request.id]: event.target.value,
                          }))
                        }
                      />
                      <Button
                        size="sm"
                        loading={busy}
                        disabled={!answer[request.id]?.trim()}
                        onClick={() => void answerRequest(request)}
                      >
                        {t("application.answerAction")}
                      </Button>
                    </>
                  ))}
              </div>
            ))}
          </div>
        </Card>
      )}
      <Card title={t("application.documentsTitle")}>
        <SelectField
          name="informationRequestDocument"
          label={t("application.documentRequest")}
          value={requestDocumentId}
          onChange={(event) => setRequestDocumentId(event.target.value)}
        >
          <option value="">{t("application.documentGeneral")}</option>
          {informationRequests
            .filter((item) => item.status === "OPEN" && item.requiresDocument)
            .map((item) => (
              <option key={item.id} value={item.id}>
                {item.question}
              </option>
            ))}
        </SelectField>
        <Text muted>{text.fileHint}</Text>
        {fileError && <Alert tone="negative" title={text.fileError} />}
        <div className="application-document-upload" id="document-upload">
          <input
            aria-label={t("application.documentsTitle")}
            disabled={busy}
            type="file"
            accept="application/pdf,image/png,image/jpeg"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (!file) return;
              if (
                !["application/pdf", "image/png", "image/jpeg"].includes(
                  file.type,
                ) ||
                file.size <= 0 ||
                file.size > 10 * 1024 * 1024
              ) {
                setFileError(true);
                return;
              }
              setFileError(false);
              void upload(file);
            }}
          />
        </div>
        {loaded &&
          !resourceErrors.includes("documents") &&
          documents.length === 0 && (
            <Text muted>{t("application.documentsEmpty")}</Text>
          )}
        {documents.length > 0 && (
          <ul className="application-document-list">
            {documents.map((document) => (
              <li key={document.id}>
                <button
                  className="application-document-link"
                  type="button"
                  onClick={() => void download(document)}
                >
                  {document.fileName}
                </button>
                <StatusBadge tone="neutral">
                  {t(
                    `application.documentStatus.${document.status}` as MessageKey,
                  )}
                </StatusBadge>
              </li>
            ))}
          </ul>
        )}
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
      <div role="tabpanel" id="application-decision-panel" aria-labelledby="application-decision-tab" hidden={selectedSection !== "application-decision"} className="application-section-panel">
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
                  onClick={() => void offerAction("accept")}
                >
                  {t("application.offerAccept")}
                </Button>
                <Button
                  disabled={offerExpired}
                  loading={busy}
                  variant="secondary"
                  onClick={() => void offerAction("decline")}
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
      <div hidden={selectedSection !== "application-review"} className="application-section-panel">
      <Card title={text.history}>
        {history.length === 0 && <Text muted>{text.emptyHistory}</Text>}
        <ol className="application-requests">
          {history.map((item) => (
            <li className="application-request" key={item.id}>
              <Text>
                {new Date(item.occurredAt).toLocaleString(locale)} ·{" "}
                {t(`dashboard.status.${item.toStatus}` as MessageKey)}
              </Text>
              {item.reason && <Text>{item.reason}</Text>}
            </li>
          ))}
        </ol>
      </Card>
      </div>
    </section>
  );
}
