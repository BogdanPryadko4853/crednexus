import { canReview } from "../../features/manual-review/api/manualReviewApi";
import { useState } from "react";
import { NavLink, Outlet } from "react-router";
import { Alert, Button } from "../../components";
import { useAuth } from "../../auth";
import { useLocale } from "../../i18n";
import "./CabinetLayout.css";
import { routes } from "../../config/routes";

export function CabinetLayout() {
  const { state, logout } = useAuth();
  const { t } = useLocale();
  const [leaving, setLeaving] = useState(false);
  const [logoutFailed, setLogoutFailed] = useState(false);
  async function leave() {
    if (leaving) return;
    setLeaving(true);
    try {
      await logout();
    } catch {
      setLogoutFailed(true);
      setLeaving(false);
    }
  }
  return (
    <>
      <a className="skip-link" href="#main">
        {t("common.skipContent")}
      </a>
      <header className="credit-header">
        <div className="credit-header__inner">
          <NavLink className="credit-brand" to={routes.dashboard}>
            <span className="credit-brand__mark" aria-hidden="true">
              {t("common.brandMark")}
            </span>
            {t("common.brand")}
          </NavLink>
          <div className="cabinet-user">
            <span className="cabinet-user__name">
              {state.status === "authenticated" ? state.user.fullName : ""}
            </span>
            <Button
              variant="ghost"
              size="sm"
              loading={leaving}
              onClick={() => void leave()}
            >
              {t("auth.logoutAction")}
            </Button>
          </div>
        </div>
      </header>
      <div className="cabinet-layout">
        <nav className="cabinet-navigation" aria-label={t("navigation.label")}>
          <NavLink to={routes.dashboard}>{t("navigation.dashboard")}</NavLink>
          <NavLink to={routes.companies}>{t("navigation.companies")}</NavLink>
          <NavLink to={routes.creditApplication}>
            {t("navigation.newApplication")}
          </NavLink>
          {state.status === "authenticated" && canReview(state.user.roles) && <NavLink to={routes.review}>{t("review.title")}</NavLink>}
          {state.status === "authenticated" && canReview(state.user.roles) && <NavLink to={routes.products}>{t("navigation.products")}</NavLink>}
          <NavLink to={routes.profile}>{t("navigation.profile")}</NavLink>
        </nav>
        <main id="main" className="cabinet-content">
          {logoutFailed && (
            <Alert tone="negative" title={t("auth.errorTitle")} role="alert">
              {t("auth.logoutError")}
            </Alert>
          )}
          <Outlet />
        </main>
      </div>
      <footer className="credit-footer">
        <span>{t("common.brand")}</span>
        <span>{t("common.footer")}</span>
      </footer>
    </>
  );
}
