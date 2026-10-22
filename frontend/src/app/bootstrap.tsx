import { BrowserRouter } from "react-router";
import { useAuth } from "../auth";
import { SessionScreen } from "../auth/ui/SessionScreen";
import { config } from "../config";
import { App } from "./App";

export function AppBootstrap() {
  const { state } = useAuth();
  if (state.status === "initializing") return <SessionScreen />;
  return (
    <BrowserRouter basename={config.basePath}>
      <App />
    </BrowserRouter>
  );
}
