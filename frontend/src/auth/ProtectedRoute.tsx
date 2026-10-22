import { Navigate, Outlet, useLocation } from "react-router";
import { useAuth } from "./AuthProvider";
import { routes } from "../config/routes";
import { SessionScreen } from "./ui/SessionScreen";

export function ProtectedRoute() {
  const { state } = useAuth();
  const location = useLocation();
  if (state.status === "initializing" || state.status === "error")
    return <SessionScreen />;
  if (state.status === "anonymous")
    return (
      <Navigate
        to={`${routes.login}?returnTo=${encodeURIComponent(location.pathname + location.search + location.hash)}`}
        replace
      />
    );
  return <Outlet />;
}
