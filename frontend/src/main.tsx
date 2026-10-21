import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app/App";
import "./styles/global.css";

const rootElement = document.getElementById("root");

if (rootElement === null) {
  throw new Error("Не найден корневой элемент приложения CredNexus.");
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
