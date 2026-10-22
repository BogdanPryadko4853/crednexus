import { useEffect, useState } from "react";
import { Alert, Card, Heading, Icon, PageState, Text } from "../../../../components";
import { useAuth } from "../../../../auth/AuthProvider";
import { useLocale } from "../../../../i18n";
import { createLoanApplication, loadCreditApplicationOptions } from "../../api/creditApplicationApi";
import type { CompanyOption, CreditProductOption } from "../../api/creditApplicationApi";
import type { CreditRequest } from "../../model/creditRequest";
import { CreditRequestForm } from "../CreditRequestForm";
import "../../../../styles/layout/credit-cabinet.css";
import "./CreditApplicationPage.css";

export function CreditApplicationPage() {
  const { t } = useLocale();
  const { api } = useAuth();
  const [options, setOptions] = useState<{ companies: CompanyOption[]; products: CreditProductOption[] } | null>(null);
  const [loadError, setLoadError] = useState(false);
  useEffect(() => {
    let active = true;
    void loadCreditApplicationOptions(api).then((next) => {
      if (active) setOptions(next);
    }).catch(() => {
      if (active) setLoadError(true);
    });
    return () => { active = false; };
  }, [api]);
  async function submitDraft(values: CreditRequest) {
    if (!options) throw new Error("Credit application options are unavailable");
    const company = options.companies.find((item) => item.inn === values.inn);
    const product = options.products[0];
    if (!company || !product) throw new Error("Credit application options are unavailable");
    await createLoanApplication(api, company.id, {
      productId: product.id,
      requestedAmount: Number(values.amount.replace(/\s/g, "").replace(",", ".")),
      termMonths: product.minTermMonths,
      purpose: values.purpose,
    });
  }
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
          {loadError && <Alert tone="negative" title={t("application.apiErrorTitle")}>{t("application.apiErrorDescription")}</Alert>}
          {!options && !loadError && <PageState kind="loading" title={t("application.loadingTitle")} />}
          <CreditRequestForm
            availableCompanies={options?.companies}
            hasCreditProducts={options ? options.products.length > 0 : undefined}
            onConfirm={options ? submitDraft : undefined}
          />
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
