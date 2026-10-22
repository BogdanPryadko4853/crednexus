import { useEffect, useState } from "react";
import { Alert, Button, Card, DataTable, Heading, PageState, TextField } from "../../components";
import { useAuth } from "../../auth";
import { useLocale } from "../../i18n";
import { createCompany } from "../../features/credit-application/api/creditApplicationApi";
import type { CompanyOption } from "../../features/credit-application/api/creditApplicationApi";
import "./CompaniesPage.css";

export function CompaniesPage() {
  const { api } = useAuth();
  const { t } = useLocale();
  const [companies, setCompanies] = useState<CompanyOption[] | null>(null);
  const [error, setError] = useState(false);
  const [form, setForm] = useState({ name: "", inn: "", ogrnOrOgrnip: "", legalForm: "", status: "ACTIVE" });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  useEffect(() => { if (!api) return; void api.request<CompanyOption[]>("/companies").then(setCompanies).catch(() => setError(true)); }, [api]);
  async function submit() {
    if (!api || saving) return;
    setSaving(true); setSaved(false); setError(false);
    try { const created = await createCompany(api, form); setCompanies((items) => [...(items ?? []), created]); setForm({ name: "", inn: "", ogrnOrOgrnip: "", legalForm: "", status: "ACTIVE" }); setSaved(true); } catch { setError(true); } finally { setSaving(false); }
  }
  if (!companies && !error) return <PageState kind="loading" title={t("companies.loading")} />;
  return <section className="cabinet-page companies-page">
    <div className="cabinet-page__heading"><Heading level={1}>{t("companies.title")}</Heading><p>{t("companies.description")}</p></div>
    {error && <Alert tone="negative" title={t("companies.error")} />}
    {saved && <Alert tone="positive" title={t("companies.saved")} />}
    <Card title={t("companies.createTitle")} subtitle={t("companies.requiredHint")}>
      <div className="companies-form">
        <TextField label={t("companies.name")} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
        <TextField label={t("companies.inn")} value={form.inn} onChange={(e) => setForm({ ...form, inn: e.target.value })} required inputMode="numeric" />
        <TextField label={t("companies.ogrn")} value={form.ogrnOrOgrnip} onChange={(e) => setForm({ ...form, ogrnOrOgrnip: e.target.value })} required inputMode="numeric" />
        <TextField label={t("companies.legalForm")} value={form.legalForm} onChange={(e) => setForm({ ...form, legalForm: e.target.value })} required />
        <Button loading={saving} disabled={!form.name.trim() || !form.inn.trim() || !form.ogrnOrOgrnip.trim() || !form.legalForm.trim()} onClick={() => void submit()}>{t("companies.createAction")}</Button>
      </div>
    </Card>
    <Card title={t("companies.listTitle")}>
      <DataTable caption={t("companies.listTitle")} rows={companies ?? []} rowKey={(row) => row.id} emptyMessage={t("companies.empty")} columns={[
        { key: "name", heading: t("companies.name"), render: (row) => row.name },
        { key: "inn", heading: t("companies.inn"), render: (row) => row.inn },
        { key: "status", heading: t("companies.status"), render: (row) => row.status ?? "—" },
      ]} />
    </Card>
  </section>;
}
