import { Text } from "../../components";
import { useLocale } from "../../i18n";

export function ScoringFactors({ factors }: { factors: Record<string, unknown> | undefined }) {
  const { locale, t } = useLocale();
  if (!factors) return null;
  const names: Record<string, string> = locale === "ru"
    ? { profitability: "Рентабельность", paymentBurden: "Платёжная нагрузка", existingDebtToRevenue: "Долг к выручке", requestedAmountToRevenue: "Сумма кредита к выручке", creditHistory: "Кредитная история" }
    : { profitability: "Profitability", paymentBurden: "Payment burden", existingDebtToRevenue: "Debt to revenue", requestedAmountToRevenue: "Loan to revenue", creditHistory: "Credit history" };
  const values: Record<string, string> = locale === "ru" ? { POSITIVE: "Положительная", ADVERSE: "Негативная", MISSING: "Нет данных", NEUTRAL: "Нейтральная" } : { POSITIVE: "Positive", ADVERSE: "Adverse", MISSING: "Missing", NEUTRAL: "Neutral" };
  const rows = Array.isArray(factors.factors) ? factors.factors.filter((value): value is Record<string, unknown> => typeof value === "object" && value !== null) : [];
  const probability = typeof factors.default_next12m === "number" && Number.isFinite(factors.default_next12m) ? factors.default_next12m : null;
  return <section><h4>{t("workflow.riskFactors")}</h4>{probability != null && <Text>{locale === "ru" ? "Вероятность неплатежа в течение года" : "Probability of default within a year"}: {(probability * 100).toLocaleString(locale, { maximumFractionDigits: 2 })}%</Text>}{rows.length === 0 && probability == null ? <Text muted>{t("review.noData")}</Text> : <ul>{rows.map((row, index) => {
    const name = typeof row.name === "string" ? row.name : "";
    return <li key={index}>{names[name] ?? t("workflow.riskFactors")}: {typeof row.value === "number" ? row.value.toLocaleString(locale) : values[String(row.value)] ?? t("review.noData")}{typeof row.delta === "number" ? ` (${row.delta > 0 ? "+" : ""}${row.delta})` : ""}</li>;
  })}</ul>}</section>;
}
