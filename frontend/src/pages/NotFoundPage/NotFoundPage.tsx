import { Link } from "react-router";
import { Heading, Text } from "../../components";
import { useLocale } from "../../i18n";

export function NotFoundPage() {
  const { t } = useLocale();
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col items-start justify-center gap-6 px-6">
      <Heading level={1}>{t("common.notFoundTitle")}</Heading>
      <Text muted>{t("common.notFoundDescription")}</Text>
      <Link className="ui-button ui-button--primary" to="/">
        {t("common.goHome")}
      </Link>
    </main>
  );
}
