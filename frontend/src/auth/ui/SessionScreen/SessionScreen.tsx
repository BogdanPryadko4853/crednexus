import { useState } from "react";
import { Alert, Button, Card, PageState } from "../../../components";
import { useLocale } from "../../../i18n";
import { useAuth } from "../../AuthProvider";
import "./SessionScreen.css";

export function SessionScreen() {
  const { state, retry, logout } = useAuth();
  const { t } = useLocale();
  const [leaving, setLeaving] = useState(false);
  const [logoutFailed, setLogoutFailed] = useState(false);

  async function leave() {
    if (leaving) return;
    setLeaving(true);
    setLogoutFailed(false);
    try {
      await logout();
    } catch {
      setLogoutFailed(true);
      setLeaving(false);
    }
  }

  if (state.status !== "initializing" && state.status !== "error") return null;
  return (
    <main className="session-screen">
      <Card className="session-screen__card">
        <PageState
          kind={state.status === "initializing" ? "loading" : "error"}
          title={t(
            state.status === "initializing"
              ? "auth.loading"
              : "auth.errorTitle",
          )}
          {...(state.status === "error"
            ? {
                description: t(
                  state.source === "profile"
                    ? "auth.profileError"
                    : "auth.identityError",
                ),
                action: (
                  <div className="session-screen__actions">
                    <Button disabled={leaving} onClick={() => void retry()}>
                      {t("common.retry")}
                    </Button>
                    {state.source === "profile" && (
                      <Button
                        variant="secondary"
                        loading={leaving}
                        onClick={() => void leave()}
                      >
                        {t("auth.logoutAction")}
                      </Button>
                    )}
                  </div>
                ),
              }
            : {})}
        />
        {logoutFailed && (
          <Alert tone="negative" title={t("auth.errorTitle")} role="alert">
            {t("auth.logoutError")}
          </Alert>
        )}
      </Card>
    </main>
  );
}
