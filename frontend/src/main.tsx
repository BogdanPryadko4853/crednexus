import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app/App";
import { LocaleProvider } from "./i18n";
import { config } from "./config";
import { BrowserRouter } from "react-router";
import "./styles/index.css";

const rootElement = document.getElementById("root");

if (rootElement === null) {
  throw new Error("CredNexus root element was not found.");
}

createRoot(rootElement).render(
  <StrictMode>
    <LocaleProvider locale={config.locale}>
      <BrowserRouter basename={config.basePath}>
        <App />
      </BrowserRouter>
    </LocaleProvider>
  </StrictMode>,
);
