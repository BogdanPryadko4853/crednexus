import { Outlet } from "react-router";
import { useAuth } from "../../../auth";
import { useLocale } from "../../../i18n";
import { PageState } from "../../../components";
import { canReview } from "../api/manualReviewApi";

export function ReviewAccess() {
  const { state } = useAuth();
  const { t } = useLocale();
  return state.status === "authenticated" && canReview(state.user.roles)
    ? <Outlet /> : <PageState kind="error" title={t("review.forbidden")} />;
}
