import { useEffect, useState } from "react";
import {
  Alert,
  Button,
  Card,
  SelectField,
  Text,
  TextField,
} from "../../../components";
import { ApiError } from "../../../api/httpClient";
import { useAuth } from "../../../auth";
import { useLocale } from "../../../i18n";
import {
  emptyMonthlyHistory,
  monthlyMeasures,
  snapshotMeasures,
  validMlProfile,
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
  const { locale } = useLocale();
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

  useEffect(() => {
    let active = true;
    setLoading(true);
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
              String(profile.financial_snapshot[key]),
            ]),
          ),
        );
        setSaved(true);
        onReady(validMlProfile(profile));
      })
      .catch((reason) => {
        if (active && !(reason instanceof ApiError && reason.status === 404))
          setError(true);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [api, applicationId, onReady]);

  function edited() {
    setSaved(false);
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
    if (!Number.isFinite(value) || value < 0 || (key.endsWith("share") && value > 1)) {
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
    } catch {
      setError(true);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card title={text.mlTitle} subtitle={text.mlHint}>
      {error && <Alert tone="negative" title={text.error} />}
      <fieldset
        disabled={readOnly || loading || saving}
        className="ml-profile__fieldset"
      >
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
              setHistory(
                value
                  ? emptyMonthlyHistory(value, Math.max(3, history.length))
                  : [],
              );
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
          {snapshotMeasures.map((key) => (
            <TextField
              key={key}
              label={text[key]}
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
        </div>
        <div className="ml-profile__table-wrap">
          <table className="ml-profile__table">
            <caption>{text.mlTitle}</caption>
            <thead>
              <tr>
                <th scope="col">{text.month}</th>
                {monthlyMeasures.map((key) => (
                  <th scope="col" key={key}>
                    {text[key]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {history.map((row, index) => (
                <tr key={row.month}>
                  <th scope="row">{row.month.slice(0, 7)}</th>
                  {monthlyMeasures.map((key) => (
                    <td key={key}>
                      <input
                        aria-label={`${text[key]} ${row.month.slice(0, 7)}`}
                        className="ui-control"
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
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!readOnly && (
          <div className="application-offer-actions">
            <Button
              variant="secondary"
              disabled={!month || history.length >= 120}
              onClick={() => {
                edited();
                setHistory(
                  emptyMonthlyHistory(
                    month,
                    history.length ? history.length + 1 : 3,
                  ).map(
                    (row) =>
                      history.find((old) => old.month === row.month) ?? row,
                  ),
                );
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
