import { useEffect, useRef, useState } from "react";
import { Alert, Button, Card, DataTable, Heading, PageState, TextField } from "../../components";
import { useAuth } from "../../auth";
import { useLocale } from "../../i18n";
import type { MessageKey } from "../../i18n";
import { createCreditProduct, loadCreditProduct, loadCreditProducts, updateCreditProduct } from "../../features/credit-application/api/creditApplicationApi";
import type { CreditProductAdmin } from "../../features/credit-application/api/creditApplicationApi";
import "./CreditProductsPage.css";
import { validMoney, validTerm, moneyValue } from "../../features/credit-application/model/inputValidation";

export function CreditProductsPage() {
  const { api } = useAuth();
  const { t } = useLocale();
  const [products, setProducts] = useState<CreditProductAdmin[] | null>(null);
  const [error, setError] = useState(false);
  const [form, setForm] = useState({ name: "", minAmount: "", maxAmount: "", minTermMonths: "", maxTermMonths: "", baseRate: "" });
  const [saving, setSaving] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<CreditProductAdmin | null>(null);
  const [editForm, setEditForm] = useState({ name: "", minAmount: "", maxAmount: "", minTermMonths: "", maxTermMonths: "", baseRate: "" });
  const [editSaved, setEditSaved] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const openSequence = useRef(0);
  function fieldErrors(values: typeof form) {
    return {
      name: !values.name.trim() || values.name.length > 255 ? t("workflow.textError") : undefined,
      minAmount: !validMoney(values.minAmount, false) ? t("workflow.moneyError") : undefined,
      maxAmount: !validMoney(values.maxAmount, false) || Number(values.maxAmount) < Number(values.minAmount) ? t("application.validation.productAmount") : undefined,
      minTermMonths: !validTerm(values.minTermMonths) ? t("workflow.termError") : undefined,
      maxTermMonths: !validTerm(values.maxTermMonths) || Number(values.maxTermMonths) < Number(values.minTermMonths) ? t("workflow.termError") : undefined,
      baseRate: !validMoney(values.baseRate) || Number(values.baseRate) > 999.99 ? t("workflow.moneyError") : undefined,
    };
  }
  useEffect(() => { if (!api) return; void loadCreditProducts(api).then(setProducts).catch(() => setError(true)); }, [api]);
  async function submit() {
    if (!api || saving) return;
    setAttempted(true);
    if (Object.values(fieldErrors(form)).some(Boolean)) return;
    setAttempted(false);
    setSaving(true); setError(false);
    try { const created = await createCreditProduct(api, { name: form.name.trim(), minAmount: moneyValue(form.minAmount), maxAmount: moneyValue(form.maxAmount), minTermMonths: Number(form.minTermMonths), maxTermMonths: Number(form.maxTermMonths), baseRate: moneyValue(form.baseRate), active: true }); setProducts((items) => [...(items ?? []), created]); setForm({ name: "", minAmount: "", maxAmount: "", minTermMonths: "", maxTermMonths: "", baseRate: "" }); } catch { setError(true); } finally { setSaving(false); }
  }
  async function toggle(product: CreditProductAdmin) {
    if (!api || saving) return;
    setSaving(true); setError(false);
    try { const updated = await updateCreditProduct(api, product.id, { active: !product.active }); setProducts((items) => items?.map((item) => item.id === updated.id ? updated : item) ?? null); } catch { setError(true); } finally { setSaving(false); }
  }
  async function openProduct(productId: string) {
    if (!api) return;
    const sequence = ++openSequence.current;
    setError(false);
    setEditSaved(false);
    try {
      const product = await loadCreditProduct(api, productId);
      if (sequence !== openSequence.current) return;
      setSelectedProduct(product);
      setEditForm({
        name: product.name,
        minAmount: String(product.minAmount ?? ""),
        maxAmount: String(product.maxAmount ?? ""),
        minTermMonths: String(product.minTermMonths),
        maxTermMonths: String(product.maxTermMonths ?? ""),
        baseRate: String(product.baseRate ?? ""),
      });
    } catch {
      setError(true);
    }
  }
  const editValid = !Object.values(fieldErrors(editForm)).some(Boolean);
  async function saveProduct() {
    if (!api || !selectedProduct || saving || !editValid) return;
    setSaving(true); setError(false); setEditSaved(false);
    try {
      const updated = await updateCreditProduct(api, selectedProduct.id, {
        name: editForm.name.trim(), minAmount: moneyValue(editForm.minAmount), maxAmount: moneyValue(editForm.maxAmount), minTermMonths: Number(editForm.minTermMonths), maxTermMonths: Number(editForm.maxTermMonths), baseRate: moneyValue(editForm.baseRate),
      });
      setSelectedProduct(updated);
      setProducts((items) => items?.map((item) => item.id === updated.id ? updated : item) ?? null);
      setEditSaved(true);
    } catch { setError(true); } finally { setSaving(false); }
  }
  if (!products && !error) return <PageState kind="loading" title={t("products.loading")} />;
  return <section className="cabinet-page products-page">
    <div className="cabinet-page__heading"><Heading level={1}>{t("products.title")}</Heading><p>{t("products.description")}</p></div>
    {error && <Alert tone="negative" title={t("products.error")} />}
    <Card title={t("products.createTitle")}>
      <div className="products-form">{([["name", "name"], ["minAmount", "minAmount"], ["maxAmount", "maxAmount"], ["minTermMonths", "minTerm"], ["maxTermMonths", "maxTerm"], ["baseRate", "rate"]] as const).map(([key, label]) => <TextField key={key} disabled={saving} maxLength={key === "name" ? 255 : 24} error={attempted ? fieldErrors(form)[key] : undefined} label={t(`products.${label}` as MessageKey)} value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} inputMode={key === "name" ? undefined : "decimal"} required />)}<Button loading={saving} onClick={() => void submit()}>{t("products.createAction")}</Button></div>
    </Card>
    <Card title={t("products.listTitle")}><p>{t("workflow.emptyInactiveCatalog")}</p><DataTable caption={t("products.listTitle")} rows={products ?? []} rowKey={(row) => row.id} emptyMessage={t("products.empty")} columns={[
      { key: "name", heading: t("products.name"), render: (row) => row.name },
      { key: "amount", heading: t("products.amount"), render: (row) => `${row.minAmount ?? 0}–${row.maxAmount ?? 0} ₽` },
      { key: "term", heading: t("products.term"), render: (row) => `${row.minTermMonths}–${row.maxTermMonths ?? row.minTermMonths} ${t("dashboard.months")}` },
      { key: "rate", heading: t("products.rate"), render: (row) => `${row.baseRate ?? 0}%` },
      { key: "active", heading: t("products.status"), render: (row) => <Button size="sm" variant="secondary" disabled={saving} onClick={() => void toggle(row)}>{row.active ? t("products.active") : t("products.inactive")}</Button> },
      { key: "actions", heading: t("products.actions"), render: (row) => <Button size="sm" variant="secondary" onClick={() => void openProduct(row.id)}>{t("products.editAction")}</Button> },
    ]} /></Card>
    {selectedProduct && <Card title={t("products.editTitle")} subtitle={selectedProduct.name}>
      <div className="products-form">{([['name', 'name'], ['minAmount', 'minAmount'], ['maxAmount', 'maxAmount'], ['minTermMonths', 'minTerm'], ['maxTermMonths', 'maxTerm'], ['baseRate', 'rate']] as const).map(([key, label]) => <TextField key={key} disabled={saving} maxLength={key === "name" ? 255 : 24} error={fieldErrors(editForm)[key]} label={t(`products.${label}` as MessageKey)} value={editForm[key]} onChange={(e) => { setEditSaved(false); setEditForm({ ...editForm, [key]: e.target.value }); }} inputMode={key === 'name' ? undefined : 'decimal'} required />)}</div>
      <Button loading={saving} disabled={!editValid} onClick={() => void saveProduct()}>{t("products.saveAction")}</Button>
      {editSaved && <Alert tone="positive" title={t("products.saved")} />}
    </Card>}
  </section>;
}
