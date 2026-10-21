import { Navigate, Route, Routes } from "react-router";
import { CreditApplicationPage } from "../features/credit-application";
import { NotFoundPage } from "../pages/NotFoundPage";

export const routes = {
  home: "/",
  creditApplication: "/applications/new",
} as const;

export function AppRoutes() {
  return (
    <Routes>
      <Route
        path={routes.home}
        element={<Navigate to={routes.creditApplication} replace />}
      />
      <Route
        path={routes.creditApplication}
        element={<CreditApplicationPage />}
      />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
