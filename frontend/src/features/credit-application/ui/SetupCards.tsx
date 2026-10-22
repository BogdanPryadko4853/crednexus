import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import {
  Alert,
  Button,
  Card,
  SelectField,
  Text,
  TextField,
} from "../../../components";
import { useAuth } from "../../../auth";
import { useLocale } from "../../../i18n";
import { workflowText } from "./workflowText";
import { canReview } from "../../manual-review/api/manualReviewApi";
import type { CompanyOption } from "../api/creditApplicationApi";

export function SetupCards() {
  const { api, state } = useAuth();
  const { locale } = useLocale();
  const text = workflowText[locale];
  const [companies, setCompanies] = useState<CompanyOption[]>([]);
  const [revision, setRevision] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [saved, setSaved] = useState(false);
  const [limitsError, setLimitsError] = useState(false);

  useEffect(() => {
    if (!api) return;
    let active = true;
    void api
      .request<CompanyOption[]>("/companies")
      .then((items) => {
        if (active) setCompanies(items);
      })
      .catch(() => {
        if (active) setError(true);
      });
    return () => {
      active = false;
    };
  }, [api, revision]);

  async function create(
    event: FormEvent<HTMLFormElement>,
    kind: "company" | "product",
  ) {
    event.preventDefault();
    if (busy) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    let body: Record<string, unknown>;
    if (kind === "company") {
      body = Object.fromEntries(data.entries());
      body.status = "ACTIVE";
    } else {
      body = { name: data.get("name"), active: true };
      for (const key of [
        "minAmount",
        "maxAmount",
        "minTermMonths",
        "maxTermMonths",
        "baseRate",
      ])
        body[key] = Number(data.get(key));
      if (
        Number(body.minAmount) > Number(body.maxAmount) ||
        Number(body.minTermMonths) > Number(body.maxTermMonths)
      ) {
        setLimitsError(true);
        return;
      }
    }
    setBusy(true);
    setError(false);
    setSaved(false);
    setLimitsError(false);
    try {
      await api.request(
        kind === "company" ? "/companies" : "/credit-products",
        { method: "POST", body },
      );
      form.reset();
      setSaved(true);
      setRevision((value) => value + 1);
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {error && <Alert tone="negative" title={text.error} />}
      {saved && <Text role="status">{text.created}</Text>}
      <Card title={text.companies}>
        {companies.length === 0 ? (
          <Text muted>{text.noCompanies}</Text>
        ) : (
          <ul>
            {companies.map((company) => (
              <li key={company.id}>
                {company.name} · {company.inn}
              </li>
            ))}
          </ul>
        )}
        <details>
          <summary>{text.companyCreate}</summary>
          <form onSubmit={(event) => void create(event, "company")}>
            <fieldset disabled={busy} className="ml-profile__fieldset">
              <div className="application-financial-grid">
                <TextField
                  label={text.companyName}
                  name="name"
                  required
                  maxLength={255}
                />
                <TextField
                  label={text.inn}
                  name="inn"
                  required
                  pattern="[0-9]{10}([0-9]{2})?"
                  inputMode="numeric"
                />
                <TextField
                  label={text.ogrn}
                  name="ogrnOrOgrnip"
                  required
                  pattern="[0-9]{13}|[0-9]{15}"
                  inputMode="numeric"
                />
                <SelectField label={text.legalForm} name="legalForm">
                  <option value="OOO">ООО</option>
                  <option value="IP">ИП</option>
                </SelectField>
              </div>
              <Button type="submit" loading={busy}>
                {text.companyCreate}
              </Button>
            </fieldset>
          </form>
        </details>
      </Card>
      {state.status === "authenticated" && canReview(state.user.roles) && (
        <Card title={text.products}>
          <details>
            <summary>{text.productCreate}</summary>
            <form onSubmit={(event) => void create(event, "product")}>
              {limitsError && (
                <Text role="alert">
                  {locale === "ru"
                    ? "Минимум не может быть больше максимума."
                    : "Minimum cannot exceed maximum."}
                </Text>
              )}
              <fieldset disabled={busy} className="ml-profile__fieldset">
                <div className="application-financial-grid">
                  <TextField
                    label={text.name}
                    name="name"
                    required
                    maxLength={255}
                  />
                  {(
                    [
                      "minAmount",
                      "maxAmount",
                      "minTermMonths",
                      "maxTermMonths",
                      "baseRate",
                    ] as const
                  ).map((key) => (
                    <TextField
                      key={key}
                      label={
                        text[
                          key === "minTermMonths"
                            ? "minTerm"
                            : key === "maxTermMonths"
                              ? "maxTerm"
                              : key === "baseRate"
                                ? "rate"
                                : key
                        ]
                      }
                      name={key}
                      type="number"
                      required
                      min={
                        key === "baseRate"
                          ? "0.01"
                          : key.endsWith("Months")
                            ? 1
                            : "0.01"
                      }
                      max={
                        key === "baseRate"
                          ? 100
                          : key.endsWith("Months")
                            ? 1200
                            : 99999999999999999
                      }
                      step={key.endsWith("Months") ? 1 : "0.01"}
                    />
                  ))}
                </div>
                <Button type="submit" loading={busy}>
                  {text.productCreate}
                </Button>
              </fieldset>
            </form>
          </details>
        </Card>
      )}
    </>
  );
}
