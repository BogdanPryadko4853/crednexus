import { AppRoutes } from "./router";
import { Link, useLocation } from "react-router";
import { PageErrorBoundary } from "../components/PageErrorBoundary";
import { PageState } from "../components";
import { useLocale } from "../i18n";

export function App() {
  const { t } = useLocale();
  const location = useLocation();
  return <PageErrorBoundary key={location.pathname} fallback={<PageState kind="error" title={t("workflow.renderError")} action={<Link to="/dashboard">{t("navigation.dashboard")}</Link>} />}><AppRoutes /></PageErrorBoundary>;
}
