import { Link } from "react-router";
import { useEffect, useState } from "react";
import { Card, Heading, PageState, StatusBadge, Text } from "../../components";
import { useAuth } from "../../auth";
import { useLocale } from "../../i18n";
import type { MessageKey } from "../../i18n";
import { routes } from "../../config/routes";
import { loadLoanApplications } from "../../features/credit-application/api/creditApplicationApi";
import type { LoanApplicationResponse } from "../../features/credit-application/api/creditApplicationApi";
import "./DashboardPage.css";
import { SetupCards } from "../../features/credit-application/ui/SetupCards";
import "../ApplicationDetailsPage/ApplicationDetailsPage.css";
import "../../features/credit-application/ui/MlProfileForm.css";

export function DashboardPage() {
  const { state, api } = useAuth();
  const { t } = useLocale();
  const [applications, setApplications] = useState<
    LoanApplicationResponse[] | null
  >(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    let active = true;
    if (!api) {
      setApplications([]);
      return () => {
        active = false;
      };
    }
    void loadLoanApplications(api)
      .then((items) => {
        if (active) setApplications(items);
      })
      .catch(() => {
        if (active) setError(true);
      });
    return () => {
      active = false;
    };
  }, [api]);
  if (state.status !== "authenticated") return null;
  return (
    <section className="cabinet-page">
      <div className="cabinet-page__heading">
        <Heading level={1}>
          {t("dashboard.welcome", { name: state.user.fullName })}
        </Heading>
        <Text muted>{t("dashboard.description")}</Text>
        <Link className="ui-button ui-button--primary" to={routes.creditApplication}>
          {t("dashboard.newApplicationAction")}
        </Link>
      </div>
      <Card title={t("dashboard.accountTitle")} subtitle={state.user.email}>
        <Link className="ui-button ui-button--secondary" to={routes.profile}>
          {t("dashboard.profileAction")}
        </Link>
      </Card>
      <SetupCards />
      {applications && (
        <div className="dashboard-stats" aria-label={t("dashboard.applicationsTitle")}>
          <Card title={t("dashboard.statsReview")}><strong>{applications.filter((item) => ["SUBMITTED", "VERIFYING", "SCORING", "MANUAL_REVIEW"].includes(item.status)).length}</strong></Card>
          <Card title={t("dashboard.statsAction")}><strong>{applications.filter((item) => item.status === "NEEDS_INFO").length}</strong></Card>
          <Card title={t("dashboard.statsOffers")}><strong>{applications.filter((item) => item.status === "OFFERED").length}</strong></Card>
        </div>
      )}
      <Card
        title={t("dashboard.applicationsTitle")}
        subtitle={t("dashboard.applicationsSubtitle")}
      >
        {error && (
          <PageState
            kind="error"
            title={t("dashboard.applicationsErrorTitle")}
            description={t("dashboard.applicationsErrorDescription")}
          />
        )}
        {!error && !applications && (
          <PageState
            kind="loading"
            title={t("dashboard.applicationsLoading")}
          />
        )}
        {!error && applications?.length === 0 && (
          <PageState
            kind="empty"
            title={t("dashboard.applicationsEmptyTitle")}
            description={t("dashboard.applicationsEmptyDescription")}
          />
        )}
        {applications && applications.length > 0 && (
          <div
            className="dashboard-applications"
            aria-label={t("dashboard.applicationsTitle")}
          >
            {applications.map((application) => (
              <Link
                className="dashboard-application"
                to={routes.applicationDetails(application.id)}
                key={application.id}
              >
                <div>
                  <strong>{application.purpose}</strong>
                  <Text size="sm" muted>
                    {application.requestedAmount.toLocaleString("ru-RU")} ₽ ·{" "}
                    {application.termMonths} {t("dashboard.months")}
                  </Text>
                </div>
                <StatusBadge
                  tone={
                    application.status === "REJECTED" ||
                    application.status === "DECLINED"
                      ? "negative"
                      : application.status === "OFFERED" ||
                          application.status === "ACCEPTED" ||
                          application.status === "DISBURSED"
                        ? "positive"
                        : "info"
                  }
                >
                  {t(`dashboard.status.${application.status}` as MessageKey)}
                </StatusBadge>
              </Link>
            ))}
          </div>
        )}
      </Card>
    </section>
  );
}
