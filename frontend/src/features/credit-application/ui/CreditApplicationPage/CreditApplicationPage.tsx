import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { Alert, Card, Heading, PageState, Text } from "../../../../components";
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
  const navigate = useNavigate();
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
  async function submitDraft(values: CreditRequest, productId?: string) {
    if (!options) throw new Error("Credit application options are unavailable");
    const company = options.companies.find((item) => item.inn === values.inn);
    const product = options.products.find((item) => item.id === productId) ?? options.products[0];
    if (!company || !product) throw new Error("Credit application options are unavailable");
    const created = await createLoanApplication(api, company.id, {
      productId: product.id,
      requestedAmount: Number(values.amount.replace(/\s/g, "").replace(",", ".")),
      termMonths: product.minTermMonths,
      purpose: values.purpose,
    });
    navigate(`/applications/${created.id}`);
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
            {...(options ? {
              availableCompanies: options.companies,
              availableProducts: options.products,
              hasCreditProducts: options.products.length > 0,
              onConfirm: submitDraft,
            } : {})}
          />
        </Card>
      </div>
    </section>
  );
}
