import { useEffect, useState } from "react";
import { Alert, Button, Card, DataTable, Heading, PageState, TextField } from "../../components";
import { useAuth } from "../../auth";
import { useLocale } from "../../i18n";
import type { MessageKey } from "../../i18n";
import { createCreditProduct, loadCreditProducts, updateCreditProduct } from "../../features/credit-application/api/creditApplicationApi";
import type { CreditProductAdmin } from "../../features/credit-application/api/creditApplicationApi";
import "./CreditProductsPage.css";

export function CreditProductsPage() {
  const { api } = useAuth();
  const { t } = useLocale();
  const [products, setProducts] = useState<CreditProductAdmin[] | null>(null);
  const [error, setError] = useState(false);
  const [form, setForm] = useState({ name: "", minAmount: "", maxAmount: "", minTermMonths: "", maxTermMonths: "", baseRate: "" });
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (!api) return; void loadCreditProducts(api).then(setProducts).catch(() => setError(true)); }, [api]);
  async function submit() {
    if (!api || saving) return;
    setSaving(true); setError(false);
    try { const created = await createCreditProduct(api, { name: form.name, minAmount: Number(form.minAmount), maxAmount: Number(form.maxAmount), minTermMonths: Number(form.minTermMonths), maxTermMonths: Number(form.maxTermMonths), baseRate: Number(form.baseRate), active: true }); setProducts((items) => [...(items ?? []), created]); setForm({ name: "", minAmount: "", maxAmount: "", minTermMonths: "", maxTermMonths: "", baseRate: "" }); } catch { setError(true); } finally { setSaving(false); }
  }
  async function toggle(product: CreditProductAdmin) {
    if (!api || saving) return;
    setSaving(true); setError(false);
    try { const updated = await updateCreditProduct(api, product.id, { active: !product.active }); setProducts((items) => items?.map((item) => item.id === updated.id ? updated : item) ?? null); } catch { setError(true); } finally { setSaving(false); }
  }
  if (!products && !error) return <PageState kind="loading" title={t("products.loading")} />;
  const valid = form.name.trim() && Number(form.minAmount) > 0 && Number(form.maxAmount) >= Number(form.minAmount) && Number(form.minTermMonths) > 0 && Number(form.maxTermMonths) >= Number(form.minTermMonths) && Number(form.baseRate) >= 0;
  return <section className="cabinet-page products-page">
    <div className="cabinet-page__heading"><Heading level={1}>{t("products.title")}</Heading><p>{t("products.description")}</p></div>
    {error && <Alert tone="negative" title={t("products.error")} />}
    <Card title={t("products.createTitle")}>
      <div className="products-form">{([["name", "name"], ["minAmount", "minAmount"], ["maxAmount", "maxAmount"], ["minTermMonths", "minTerm"], ["maxTermMonths", "maxTerm"], ["baseRate", "rate"]] as const).map(([key, label]) => <TextField key={key} label={t(`products.${label}` as MessageKey)} value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} inputMode={key === "name" ? undefined : "decimal"} required />)}<Button loading={saving} disabled={!valid} onClick={() => void submit()}>{t("products.createAction")}</Button></div>
    </Card>
    <Card title={t("products.listTitle")}><DataTable caption={t("products.listTitle")} rows={products ?? []} rowKey={(row) => row.id} emptyMessage={t("products.empty")} columns={[
      { key: "name", heading: t("products.name"), render: (row) => row.name },
      { key: "amount", heading: t("products.amount"), render: (row) => `${row.minAmount ?? 0}–${row.maxAmount ?? 0} ₽` },
      { key: "term", heading: t("products.term"), render: (row) => `${row.minTermMonths}–${row.maxTermMonths ?? row.minTermMonths} ${t("dashboard.months")}` },
      { key: "rate", heading: t("products.rate"), render: (row) => `${row.baseRate ?? 0}%` },
      { key: "active", heading: t("products.status"), render: (row) => <Button size="sm" variant="secondary" disabled={saving} onClick={() => void toggle(row)}>{row.active ? t("products.active") : t("products.inactive")}</Button> },
    ]} /></Card>
  </section>;
}
