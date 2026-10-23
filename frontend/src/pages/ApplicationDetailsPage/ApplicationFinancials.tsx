import { Button, Card, TextField } from "../../components";
import { useLocale } from "../../i18n";
import type { MessageKey } from "../../i18n";

export type FinancialValues = { annualRevenue: string; annualExpenses: string; existingDebt: string; monthlyPayments: string; employeeCount: string; period: string };
type Props = { values: FinancialValues; errors: Record<string, string | undefined>; readOnly: boolean; busy: boolean; saved: boolean; onChange: (field: keyof FinancialValues, value: string) => void; onSave: () => Promise<void> };
export function ApplicationFinancials({ values, errors, readOnly, busy, saved, onChange, onSave }: Props) {
  const { t } = useLocale();
  return <Card id="application-financial" title={t("application.financialTitle")} subtitle={t("application.financialDescription")}>
    <div className="application-financial-grid">
      {(Object.keys(values) as (keyof FinancialValues)[]).map((field) => <TextField key={field} name={field} label={t(`application.financial.${field}` as MessageKey)} value={values[field]} readOnly={readOnly} disabled={busy} error={!readOnly ? errors[field] : undefined} maxLength={field === "period" ? 255 : 24} inputMode={field === "period" ? undefined : "decimal"} onChange={(event) => onChange(field, event.target.value)} />)}
    </div>
    {!readOnly && <Button loading={busy} disabled={Object.values(errors).some(Boolean)} onClick={() => void onSave()}>{t(saved ? "application.financialSaved" : "application.financialSave")}</Button>}
  </Card>;
}
