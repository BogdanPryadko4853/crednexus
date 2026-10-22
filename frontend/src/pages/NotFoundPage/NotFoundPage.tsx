import { Link } from "react-router";
import { routes } from "../../config/routes";
import { Heading, Text } from "../../components";
import { useLocale } from "../../i18n";
import "./NotFoundPage.css";

export function NotFoundPage() {
  const { t } = useLocale();
  return (
    <main className="not-found-page">
      <Heading level={1}>{t("common.notFoundTitle")}</Heading>
      <Text muted>{t("common.notFoundDescription")}</Text>
      <Link className="ui-button ui-button--primary" to={routes.home}>
        {t("common.goHome")}
      </Link>
    </main>
  );
}
