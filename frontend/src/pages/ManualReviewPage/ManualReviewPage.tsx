import { useEffect, useState } from "react";
import { Link } from "react-router";
import { Button, Card, DataTable, Heading, PageState } from "../../components";
import { useAuth } from "../../auth";
import { useLocale } from "../../i18n";
import { routes } from "../../config/routes";
import { loadReviewQueue } from "../../features/manual-review/api/manualReviewApi";
import type { ReviewApplication } from "../../features/manual-review/api/manualReviewApi";
import "./ManualReviewPage.css";

export function ManualReviewPage() {
  const { api } = useAuth();
  const { t, locale } = useLocale();
  const [rows, setRows] = useState<ReviewApplication[] | null>(null);
  const [error, setError] = useState(false);
  const [revision, setRevision] = useState(0);
  const reload = () => setRevision((value) => value + 1);
  useEffect(() => {
    if (!api) return;
    let active = true;
    setError(false); setRows(null);
    void loadReviewQueue(api).then((items) => { if (active) setRows(items); }).catch(() => { if (active) setError(true); });
    return () => { active = false; };
  }, [api, revision]);
  return <section className="manual-review">
    <div className="manual-review__heading"><Heading level={1}>{t("review.title")}</Heading><Button variant="secondary" onClick={reload}>{t("application.refresh")}</Button></div>
    {error ? <PageState kind="error" title={t("application.apiErrorTitle")} action={<Button onClick={reload}>{t("application.retry")}</Button>} />
      : rows === null ? <PageState kind="loading" title={t("application.detailsLoading")} />
      : <Card title={t("review.queue")}><DataTable caption={t("review.queue")} rows={rows} rowKey={(row) => row.id} emptyMessage={t("review.empty")} columns={[
        { key: "company", heading: t("application.summary.company"), render: (row) => <Link className="manual-review__link" to={routes.reviewDetails(row.id)}>{row.companyName}</Link> },
        { key: "amount", heading: t("application.summary.amount"), render: (row) => row.requestedAmount.toLocaleString(locale) },
        { key: "term", heading: t("application.summary.term"), render: (row) => `${row.requestedTermMonths} ${t("dashboard.months")}` },
        { key: "purpose", heading: t("application.summary.purpose"), render: (row) => row.purpose },
      ]} /></Card>}
  </section>;
}
