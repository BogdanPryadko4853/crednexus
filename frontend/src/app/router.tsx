import { ManualReviewPage } from "../pages/ManualReviewPage/ManualReviewPage";
import { ManualReviewDetailsPage } from "../pages/ManualReviewPage/ManualReviewDetailsPage";
import { ReviewAccess } from "../features/manual-review/ui/ReviewAccess";
import { Navigate, Route, Routes } from "react-router";
import { CreditApplicationPage } from "../features/credit-application";
import { NotFoundPage } from "../pages/NotFoundPage";
import { LoginPage } from "../pages/LoginPage";
import { DashboardPage } from "../pages/DashboardPage";
import { ApplicationDetailsPage } from "../pages/ApplicationDetailsPage";
import { ProfilePage } from "../features/profile";
import { CompaniesPage } from "../pages/CompaniesPage";
import { CreditProductsPage } from "../pages/CreditProductsPage";
import { ProtectedRoute } from "../auth";
import { CabinetLayout } from "./layout/CabinetLayout";

import { routes } from "../config/routes";
export { routes } from "../config/routes";

export function AppRoutes() {
  return (
    <Routes>
      <Route
        path={routes.home}
        element={<Navigate to={routes.dashboard} replace />}
      />
      <Route path={routes.login} element={<LoginPage />} />
      <Route element={<ProtectedRoute />}>
        <Route element={<CabinetLayout />}>
          <Route path={routes.dashboard} element={<DashboardPage />} />
          <Route element={<ReviewAccess />}><Route path={routes.review} element={<ManualReviewPage />} /><Route path={routes.reviewDetailsPattern} element={<ManualReviewDetailsPage />} /></Route>
          <Route path={routes.profile} element={<ProfilePage />} />
          <Route path={routes.companies} element={<CompaniesPage />} />
          <Route
            path={routes.creditApplication}
            element={<CreditApplicationPage />}
          />
          <Route element={<ReviewAccess />}><Route path={routes.products} element={<CreditProductsPage />} /></Route>
          <Route
            path={routes.applicationDetailsPattern}
            element={<ApplicationDetailsPage />}
          />
        </Route>
      </Route>
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
