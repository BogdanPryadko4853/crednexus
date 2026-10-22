import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { AppBootstrap } from "./app/bootstrap";
import { AuthProvider, session } from "./auth";
import { LocaleProvider } from "./i18n";
import { config } from "./config";
import "./styles/index.css";

const rootElement = document.getElementById("root");

if (rootElement === null) {
  throw new Error("CredNexus root element was not found.");
}

void session.initialize();
createRoot(rootElement).render(
  <StrictMode>
    <LocaleProvider locale={config.locale}>
      <AuthProvider>
        <AppBootstrap />
      </AuthProvider>
    </LocaleProvider>
  </StrictMode>,
);
