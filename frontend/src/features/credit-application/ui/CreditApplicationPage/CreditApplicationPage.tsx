import { Card, Heading, Icon, Text } from "../../../../components";
import { useLocale } from "../../../../i18n";
import { CreditRequestForm } from "../CreditRequestForm";
import "../../../../styles/layout/credit-cabinet.css";
import "./CreditApplicationPage.css";

export function CreditApplicationPage() {
  const { t } = useLocale();
  return (
    <section className="credit-page">
      <div className="credit-page__heading">
        <p className="credit-eyebrow">{t("application.eyebrow")}</p>
        <Heading level={1} size="xl">
          {t("application.title")}
        </Heading>
        <Text size="lg" muted>
          {t("application.intro")}
        </Text>
      </div>
      <div className="credit-page__columns">
        <Card
          title={t("application.formTitle")}
          subtitle={t("application.requiredHint")}
        >
          <CreditRequestForm />
        </Card>
        <aside
          className="credit-page__aside"
          aria-label={t("application.infoLabel")}
        >
          <Card title={t("application.infoTitle")}>
            <ul className="credit-requirements">
              <li>
                <Icon name="company" />
                <div>
                  <strong>{t("application.companyHeading")}</strong>
                  <Text size="sm" muted>
                    {t("application.companyInfo")}
                  </Text>
                </div>
              </li>
              <li>
                <Icon name="file" />
                <div>
                  <strong>{t("application.financingHeading")}</strong>
                  <Text size="sm" muted>
                    {t("application.financingInfo")}
                  </Text>
                </div>
              </li>
              <li>
                <Icon name="check" />
                <div>
                  <strong>{t("application.checkHeading")}</strong>
                  <Text size="sm" muted>
                    {t("application.checkInfo")}
                  </Text>
                </div>
              </li>
            </ul>
          </Card>
        </aside>
      </div>
    </section>
  );
}
