import { useEffect, useState } from "react";
import { Alert, Button, Card, Heading, Icon, PageState, Text, TextField } from "../../components";
import { useAuth } from "../../auth";
import { useLocale } from "../../i18n";
import type { MessageKey } from "../../i18n";
import { createCompany, loadCompany } from "../../features/credit-application/api/creditApplicationApi";
import type { CompanyOption } from "../../features/credit-application/api/creditApplicationApi";
import "./CompaniesPage.css";

export function CompaniesPage() {
  const { api } = useAuth();
  const { t } = useLocale();
  const [companies, setCompanies] = useState<CompanyOption[] | null>(null);
  const [error, setError] = useState(false);
  const [selectedCompany, setSelectedCompany] = useState<CompanyOption | null>(null);
  const [form, setForm] = useState({ name: "", inn: "", ogrnOrOgrnip: "", legalForm: "" });
  const [saving, setSaving] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const valid = {
    name: !!form.name.trim() && form.name.trim().length <= 255,
    inn: /^(\d{10}|\d{12})$/.test(form.inn.trim()),
    ogrnOrOgrnip: /^(\d{13}|\d{15})$/.test(form.ogrnOrOgrnip.trim()),
    legalForm: !!form.legalForm.trim() && form.legalForm.trim().length <= 255,
  };
  useEffect(() => { if (!api) return; void api.request<CompanyOption[]>("/companies").then(setCompanies).catch(() => setError(true)); }, [api]);
  async function showCompany(companyId: string) {
    if (!api) return;
    if (selectedCompany?.id === companyId) {
      setSelectedCompany(null);
      return;
    }
    setError(false);
    try {
      setSelectedCompany(await loadCompany(api, companyId));
    } catch {
      setError(true);
    }
  }
  async function submitCompany() {
    if (!api || saving) return;
    setAttempted(true);
    if (Object.values(valid).some((value) => !value)) return;
    setSaving(true);
    setError(false);
    try {
      const created = await createCompany(api, {
        name: form.name.trim(), inn: form.inn.trim(),
        ogrnOrOgrnip: form.ogrnOrOgrnip.trim(), legalForm: form.legalForm.trim(), status: "ACTIVE",
      });
      setCompanies((items) => [...(items ?? []), created]);
      setForm({ name: "", inn: "", ogrnOrOgrnip: "", legalForm: "" });
      setAttempted(false);
    } catch {
      setError(true);
    } finally {
      setSaving(false);
    }
  }
  if (!companies && !error) return <PageState kind="loading" title={t("companies.loading")} />;
  return <section className="cabinet-page companies-page">
    <div className="cabinet-page__heading"><Heading level={1}>{t("companies.title")}</Heading><p>{t("companies.description")}</p></div>
    {error && <Alert tone="negative" title={t("companies.error")} />}
    <Card title={t("companies.listTitle")}>
      {(companies ?? []).length === 0 ? <Text muted>{t("companies.empty")}</Text> : <div className="companies-list">
        {(companies ?? []).map((company) => {
          const expanded = selectedCompany?.id === company.id;
          return <details className="companies-list__item" key={company.id} open={expanded}>
            <summary onClick={(event) => { event.preventDefault(); void showCompany(company.id); }}>
              <span>{company.name}</span>
              <Icon name="chevron" className="companies-list__chevron" />
            </summary>
            {expanded && <div className="companies-list__details" id={`company-${company.id}`}>
              <dl className="companies-details">
                <div><dt>{t("companies.inn")}</dt><dd>{selectedCompany.inn}</dd></div>
                <div><dt>{t("companies.ogrn")}</dt><dd>{selectedCompany.ogrnOrOgrnip ?? "—"}</dd></div>
                <div><dt>{t("companies.legalForm")}</dt><dd>{selectedCompany.legalForm ?? "—"}</dd></div>
                <div><dt>{t("companies.role")}</dt><dd>{selectedCompany.currentUserRole ? t(`companies.roles.${["OWNER", "REPRESENTATIVE", "MEMBER", "ADMIN", "BANK_EMPLOYEE", "CLIENT"].includes(selectedCompany.currentUserRole) ? selectedCompany.currentUserRole : "unknown"}` as MessageKey) : "—"}</dd></div>
              </dl>
            </div>}
          </details>;
        })}
      </div>}
    </Card>
    <Card>
      <details className="companies-create">
        <summary>
          {t("companies.createTitle")}
          <Icon name="chevron" className="companies-list__chevron" />
        </summary>
        <Text muted>{t("companies.requiredHint")}</Text>
        <div className="companies-form">
          <TextField label={t("companies.name")} maxLength={255} error={attempted && !valid.name ? t("companies.validation.name") : undefined} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required />
          <TextField label={t("companies.inn")} maxLength={12} error={attempted && !valid.inn ? t("companies.validation.inn") : undefined} value={form.inn} onChange={(event) => setForm({ ...form, inn: event.target.value })} inputMode="numeric" required />
          <TextField label={t("companies.ogrn")} maxLength={15} error={attempted && !valid.ogrnOrOgrnip ? t("companies.validation.ogrn") : undefined} value={form.ogrnOrOgrnip} onChange={(event) => setForm({ ...form, ogrnOrOgrnip: event.target.value })} inputMode="numeric" required />
          <TextField label={t("companies.legalForm")} maxLength={255} error={attempted && !valid.legalForm ? t("companies.validation.legalForm") : undefined} value={form.legalForm} onChange={(event) => setForm({ ...form, legalForm: event.target.value })} required />
        </div>
        <Button loading={saving} onClick={() => void submitCompany()}>
          {t("companies.createAction")}
        </Button>
      </details>
    </Card>
  </section>;
}
