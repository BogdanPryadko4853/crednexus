import { useState } from "react";
import { Navigate, useSearchParams } from "react-router";
import { Alert, Button, Card, Heading, Text } from "../../components";
import { useAuth } from "../../auth";
import { useLocale } from "../../i18n";
import "./LoginPage.css";
import { routes } from "../../config/routes";
import { SessionScreen } from "../../auth/ui/SessionScreen";

export function LoginPage() {
  const { state, login } = useAuth();
  const { t } = useLocale();
  const [parameters] = useSearchParams();
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  if (state.status === "authenticated")
    return <Navigate to={routes.dashboard} replace />;
  if (state.status === "initializing" || state.status === "error")
    return <SessionScreen />;
  const requestedPath = parameters.get("returnTo");
  const returnTo =
    requestedPath && !requestedPath.startsWith(routes.login)
      ? requestedPath
      : routes.dashboard;
  async function enter() {
    if (pending) return;
    setPending(true);
    setFailed(false);
    try {
      await login(returnTo);
    } catch {
      setFailed(true);
    } finally {
      setPending(false);
    }
  }
  return (
    <main className="login-page">
      <div className="login-page__brand">
        <span className="credit-brand__mark" aria-hidden="true">
          {t("common.brandMark")}
        </span>
        <span>{t("common.brand")}</span>
      </div>
      <Card className="login-page__card">
        <Heading level={1} size="lg">
          {t("auth.loginTitle")}
        </Heading>
        <Text muted>{t("auth.loginDescription")}</Text>
        {failed && (
          <Alert tone="negative" title={t("auth.errorTitle")} role="alert">
            {t("auth.identityError")}
          </Alert>
        )}
        {state.status === "anonymous" && state.expired && (
          <Alert
            tone="attention"
            title={t("auth.sessionExpired")}
            role="status"
          >
            {t("auth.sessionExpiredDescription")}
          </Alert>
        )}
        <Button
          className="login-page__button"
          loading={pending}
          onClick={() => void enter()}
        >
          {t("auth.loginAction")}
        </Button>
      </Card>
      <Text className="login-page__footer" size="sm" muted>
        {t("common.footer")}
      </Text>
    </main>
  );
}
