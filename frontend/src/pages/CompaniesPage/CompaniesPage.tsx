import { useEffect, useState } from "react";
import { Alert, Card, Heading, Icon, PageState, Text } from "../../components";
import { useAuth } from "../../auth";
import { useLocale } from "../../i18n";
import { loadCompany } from "../../features/credit-application/api/creditApplicationApi";
import type { CompanyOption } from "../../features/credit-application/api/creditApplicationApi";
import "./CompaniesPage.css";

export function CompaniesPage() {
  const { api } = useAuth();
  const { t } = useLocale();
  const [companies, setCompanies] = useState<CompanyOption[] | null>(null);
  const [error, setError] = useState(false);
  const [selectedCompany, setSelectedCompany] = useState<CompanyOption | null>(null);
  useEffect(() => { if (!api) return; void api.request<CompanyOption[]>("/companies").then(setCompanies).catch(() => setError(true)); }, [api]);
  async function showCompany(companyId: string) {
    if (!api) return;
    if (selectedCompany?.id === companyId) {
      setSelectedCompany(null);
      return;
    }
    setError(false);
    try {
      setSelectedCompany(await loadCompany(api, companyId));
    } catch {
      setError(true);
    }
  }
  if (!companies && !error) return <PageState kind="loading" title={t("companies.loading")} />;
  return <section className="cabinet-page companies-page">
    <div className="cabinet-page__heading"><Heading level={1}>{t("companies.title")}</Heading><p>{t("companies.description")}</p></div>
    {error && <Alert tone="negative" title={t("companies.error")} />}
    <Card title={t("companies.listTitle")}>
      {(companies ?? []).length === 0 ? <Text muted>{t("companies.empty")}</Text> : <div className="companies-list">
        {(companies ?? []).map((company) => {
          const expanded = selectedCompany?.id === company.id;
          return <details className="companies-list__item" key={company.id} open={expanded}>
            <summary onClick={(event) => { event.preventDefault(); void showCompany(company.id); }}>
              <span>{company.name}</span>
              <Icon name="chevron" className="companies-list__chevron" />
            </summary>
            {expanded && <div className="companies-list__details" id={`company-${company.id}`}>
              <dl className="companies-details">
                <div><dt>{t("companies.inn")}</dt><dd>{selectedCompany.inn}</dd></div>
                <div><dt>{t("companies.ogrn")}</dt><dd>{selectedCompany.ogrnOrOgrnip ?? "—"}</dd></div>
                <div><dt>{t("companies.legalForm")}</dt><dd>{selectedCompany.legalForm ?? "—"}</dd></div>
                <div><dt>{t("companies.role")}</dt><dd>{selectedCompany.currentUserRole ?? "—"}</dd></div>
              </dl>
            </div>}
          </details>;
        })}
      </div>}
    </Card>
  </section>;
}
