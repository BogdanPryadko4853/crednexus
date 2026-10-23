import { useEffect, useState } from "react";
import {
  Alert,
  Button,
  Card,
  SelectField,
  Text,
  TextField,
  Icon,
} from "../../../components";
import { ApiError } from "../../../api/httpClient";
import { useAuth } from "../../../auth";
import { useLocale } from "../../../i18n";
import {
  emptyMonthlyHistory,
  monthlyMeasures,
  snapshotMeasures,
  validMlProfile,
  monthAt,
} from "../model/mlProfile";
import type { MlProfile, MonthlyObservation } from "../model/mlProfile";
import { workflowText } from "./workflowText";
import "./MlProfileForm.css";

type Props = {
  applicationId: string;
  readOnly: boolean;
  onReady: (ready: boolean) => void;
};
export function MlProfileForm({ applicationId, readOnly, onReady }: Props) {
  const { api } = useAuth();
  const { locale, t } = useLocale();
  const text = workflowText[locale];
  const lastMonth = new Date();
  lastMonth.setUTCDate(1);
  lastMonth.setUTCMonth(lastMonth.getUTCMonth() - 1);
  const [month, setMonth] = useState(lastMonth.toISOString().slice(0, 7));
  const [sector, setSector] = useState("");
  const [age, setAge] = useState("");
  const [legalForm, setLegalForm] = useState("OOO");
  const [businessState, setBusinessState] = useState<
    "active" | "distressed" | "restructuring"
  >("active");
  const [history, setHistory] = useState<MonthlyObservation[]>(() =>
    emptyMonthlyHistory(lastMonth.toISOString().slice(0, 7), 3),
  );
  const [snapshot, setSnapshot] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [missing, setMissing] = useState(false);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setLoadError(false);
    setMissing(false);
    onReady(false);
    void api
      .request<MlProfile>(
        `/loan-applications/${applicationId}/ml-scoring-profile`,
      )
      .then((profile) => {
        if (!active) return;
        setMonth(profile.as_of_month.slice(0, 7));
        setSector(profile.company.sector);
        setAge(String(profile.company.business_age_months));
        setHistory(profile.history);
        setLegalForm(profile.financial_snapshot.legal_form);
        setBusinessState(profile.financial_snapshot.business_state);
        setSnapshot(
          Object.fromEntries(
            snapshotMeasures.map((key) => [
              key,
              profile.financial_snapshot[key] == null ? "" : String(profile.financial_snapshot[key]),
            ]),
          ),
        );
        setSaved(true);
        onReady(validMlProfile(profile));
      })
      .catch((reason) => {
        if (!active) return;
        if (reason instanceof ApiError && reason.status === 404) setMissing(true);
        else setLoadError(true);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [api, applicationId, onReady, revision]);

  function edited() {
    setSaved(false);
    setError(false);
    onReady(false);
  }
  const profile: MlProfile = {
    as_of_month: `${month}-01`,
    company: { sector, business_age_months: Number(age) },
    history,
    financial_snapshot: {
      ...(Object.fromEntries(
        snapshotMeasures.map((key) => [
          key,
          snapshot[key]?.trim() ? Number(snapshot[key]) : NaN,
        ]),
      ) as Record<(typeof snapshotMeasures)[number], number>),
      month: `${month}-01`,
      legal_form: legalForm,
      business_state: businessState,
    },
  };
  const fieldErrors: Record<string, string | undefined> = {
    month:
      !month || !/^\d{4}-\d{2}$/.test(month) || `${month}-01` >= new Date().toISOString().slice(0, 7) + "-01"
        ? text.monthError
        : undefined,
    sector: !sector.trim() ? text.requiredError : undefined,
    age:
      !Number.isInteger(Number(age)) || Number(age) < 3 || Number(age) > 1200
        ? text.ageError
        : undefined,
  };
  for (const key of snapshotMeasures) {
    const value = Number(snapshot[key]);
    if (!snapshot[key]?.trim() || !Number.isFinite(value) || value < 0 || value > (key.endsWith("share") ? 1 : 1e15)) {
      fieldErrors[key] = key.endsWith("share") ? text.shareError : text.amountError;
    }
  }
  if (
    Number.isFinite(Number(snapshot.overdue_payables)) &&
    Number.isFinite(Number(snapshot.accounts_payable)) &&
    Number(snapshot.overdue_payables) > Number(snapshot.accounts_payable)
  ) {
    fieldErrors.overdue_payables = text.overdueError;
  }
  const valid = Object.values(fieldErrors).every((value) => !value) && validMlProfile(profile);
  async function save() {
    if (!valid || saving) return;
    setSaving(true);
    setError(false);
    try {
      await api.request(
        `/loan-applications/${applicationId}/ml-scoring-profile`,
        { method: "PUT", body: { profile } },
      );
      setSaved(true);
      onReady(true);
    } catch (reason) {
      if (reason instanceof ApiError && reason.status === 404) setLoadError(true);
      setError(true);
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <Card title={text.mlTitle}><Text muted>{t("common.loading")}</Text></Card>;
  if (loadError) return <Card title={text.mlTitle}><Alert tone="negative" title={t("application.apiErrorTitle")}>{t("workflow.apiUnavailable")}</Alert><Button variant="secondary" onClick={() => setRevision((value) => value + 1)}>{t("application.retry")}</Button></Card>;
  if (readOnly && missing) return <Card title={text.mlTitle}><Alert tone="attention" title={t("workflow.noProfile")}>{t("workflow.apiUnavailable")}</Alert><Button variant="secondary" onClick={() => setRevision((value) => value + 1)}>{t("application.retry")}</Button></Card>;

  return (
    <Card title={text.mlTitle} subtitle={text.mlHint}>
      {error && <Alert tone="negative" title={text.error} />}
      {missing && !saved && <Text muted>{t("workflow.noProfile")}</Text>}
      <fieldset
        disabled={readOnly || loading || saving}
        className="ml-profile__fieldset"
      >
        <h4>{t("workflow.profile.business")}</h4>
        <div className="application-financial-grid">
          <TextField
            label={text.month}
            type="month"
            required
            error={fieldErrors.month}
            value={month}
            onChange={(event) => {
              edited();
              const value = event.target.value;
              setMonth(value);
            }}
          />
          <SelectField
            label={text.sector}
            required
            error={fieldErrors.sector}
            value={sector}
            onChange={(event) => {
              edited();
              setSector(event.target.value);
            }}
          >
            <option value="">—</option>
            {Object.entries(
              locale === "ru"
                ? {
                    construction: "Строительство",
                    food_service: "Общепит",
                    hospitality: "Гостиницы",
                    manufacturing: "Производство",
                    professional_services: "Профессиональные услуги",
                    retail: "Розничная торговля",
                    transport: "Транспорт",
                    wholesale: "Оптовая торговля",
                  }
                : {
                    construction: "Construction",
                    food_service: "Food service",
                    hospitality: "Hospitality",
                    manufacturing: "Manufacturing",
                    professional_services: "Professional services",
                    retail: "Retail",
                    transport: "Transport",
                    wholesale: "Wholesale",
                  },
            ).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </SelectField>
          <TextField
            label={text.age}
            type="number"
            min={3}
            max={1200}
            required
            error={fieldErrors.age}
            value={age}
            onChange={(event) => {
              edited();
              setAge(event.target.value);
            }}
          />
          <SelectField
            label={text.legalForm}
            value={legalForm}
            onChange={(event) => {
              edited();
              setLegalForm(event.target.value);
            }}
          >
            <option value="OOO">ООО</option>
            <option value="IP">ИП</option>
          </SelectField>
          <SelectField
            label={text.businessState}
            value={businessState}
            onChange={(event) => {
              edited();
              setBusinessState(event.target.value as typeof businessState);
            }}
          >
            {(["active", "distressed", "restructuring"] as const).map(
              (state) => (
                <option value={state} key={state}>
                  {text[state]}
                </option>
              ),
            )}
          </SelectField>
        </div>
        {([
          { title: "workflow.profile.concentration", keys: ["largest_customer_share", "largest_channel_share"] },
          { title: "workflow.profile.debts", keys: ["accounts_receivable", "accounts_payable", "overdue_payables", "debt_outstanding", "loan_arrears", "existing_monthly_debt_service"] },
          { title: "workflow.profile.inventory", keys: ["inventory"] },
        ] as const).map((group) => <section className="ml-profile__group" key={group.title}><h4>{t(group.title)}</h4><div className="application-financial-grid">
          {group.keys.map((key) => (
            <TextField
              key={key}
              label={text[key]}
              hint={key.endsWith("share") ? t("workflow.profile.shareHint") : key === "accounts_receivable" ? t("workflow.profile.receivableHint") : key === "accounts_payable" ? t("workflow.profile.payableHint") : undefined}
              type="number"
              min={0}
              max={key.endsWith("share") ? 1 : 1e15}
              step={key.endsWith("share") ? "0.01" : "0.01"}
              required
              error={fieldErrors[key]}
              value={snapshot[key] ?? ""}
              onChange={(event) => {
                edited();
                setSnapshot((current) => ({
                  ...current,
                  [key]: event.target.value,
                }));
              }}
            />
          ))}
        </div></section>)}
        <section className="ml-profile__group">
          <h4>{t("workflow.profile.history")}</h4>
          <Text muted>{t("workflow.profile.historyHint")}</Text>
          {history.map((row, index) => <details className="ml-profile__month" key={row.month} open={history.length <= 3}>
            <summary><span>{row.month.slice(0, 7)}</span><Icon name="chevron" /></summary>
            {(row.month > `${month}-01` || (month && Number(age) >= 3 && row.month < monthAt(month, 1 - Number(age))) || monthlyMeasures.some((key) => row[key] !== null && (!Number.isFinite(row[key]) || row[key]! < 0 || row[key]! > 1e15))) && <Text role="alert">{t("workflow.profile.historyError")}</Text>}
            <div className="application-financial-grid">
                  {monthlyMeasures.map((key) => (
                      <TextField key={key}
                        label={`${text[key]} ${row.month.slice(0, 7)}`}
                        error={row[key] !== null && (!Number.isFinite(row[key]) || row[key]! < 0 || row[key]! > 1e15) ? text.amountError : undefined}
                        type="number"
                        min={0}
                        step="0.01"
                        value={row[key] ?? ""}
                        onChange={(event) => {
                          edited();
                          const value = event.target.value;
                          setHistory((current) =>
                            current.map((item, position) =>
                              position === index
                                ? {
                                    ...item,
                                    [key]: value === "" ? null : Number(value),
                                  }
                                : item,
                            ),
                          );
                        }}
                      />
                  ))}
            </div>
          </details>)}
        </section>
        {!readOnly && (
          <div className="application-offer-actions">
            <Button
              variant="secondary"
              disabled={!month || history.length >= 120}
              onClick={() => {
                edited();
                setHistory((current) => {
                  const wanted = emptyMonthlyHistory(month, Math.min(120, Math.max(3, current.length + 1)));
                  return [...current, ...wanted.filter((row) => !current.some((old) => old.month === row.month))].sort((a, b) => a.month.localeCompare(b.month)).slice(-120);
                });
              }}
            >
              {text.addMonth}
            </Button>
            <Button
              variant="ghost"
              disabled={history.length <= 3}
              onClick={() => {
                edited();
                setHistory((current) => current.slice(1));
              }}
            >
              {text.removeMonth}
            </Button>
          </div>
        )}
      </fieldset>
      {!readOnly && (
        <>
          <Text size="sm" muted>
            {text.invalid}
          </Text>
          <Button
            disabled={!valid || loading}
            loading={saving}
            onClick={() => void save()}
          >
            {saved ? text.saved : text.save}
          </Button>
        </>
      )}
    </Card>
  );
}
