import { Link } from "react-router";
import { Card, Heading, Text } from "../../components";
import { useAuth } from "../../auth";
import { useLocale } from "../../i18n";
import { routes } from "../../config/routes";

export function DashboardPage() {
  const { state } = useAuth();
  const { t } = useLocale();
  if (state.status !== "authenticated") return null;
  return (
    <section className="cabinet-page">
      <div className="cabinet-page__heading">
        <Heading level={1}>
          {t("dashboard.welcome", { name: state.user.fullName })}
        </Heading>
        <Text muted>{t("dashboard.description")}</Text>
      </div>
      <Card title={t("dashboard.accountTitle")} subtitle={state.user.email}>
        <Link className="ui-button ui-button--secondary" to={routes.profile}>
          {t("dashboard.profileAction")}
        </Link>
      </Card>
    </section>
  );
}
