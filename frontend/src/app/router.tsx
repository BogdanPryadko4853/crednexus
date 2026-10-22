import { Navigate, Route, Routes } from "react-router";
import { CreditApplicationPage } from "../features/credit-application";
import { NotFoundPage } from "../pages/NotFoundPage";
import { LoginPage } from "../pages/LoginPage";
import { DashboardPage } from "../pages/DashboardPage";
import { ProfilePage } from "../features/profile";
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
          <Route path={routes.profile} element={<ProfilePage />} />
          <Route
            path={routes.creditApplication}
            element={<CreditApplicationPage />}
          />
        </Route>
      </Route>
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
