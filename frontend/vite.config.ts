import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig, loadEnv } from "vite";
import { createTranslator } from "./src/i18n/catalog.ts";
import { readEnvironment } from "./src/config/readEnvironment.ts";

export default defineConfig(({ mode }) => {
  const config = readEnvironment(loadEnv(mode, process.cwd(), ""));
  const t = createTranslator(config.locale);
  const escapeHtml = (value: string) =>
    value.replace(
      /[&<>"']/g,
      (character) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[character]!,
    );
  return {
    base: config.basePath,
    plugins: [
      react(),
      tailwindcss(),
      {
        name: "localized-html",
        transformIndexHtml: {
          order: "pre",
          handler: (html) =>
            html
              .replace("%APP_LANG%", () => config.locale)
              .replace("%APP_TITLE%", () => escapeHtml(t("app.title")))
              .replace("%APP_DESCRIPTION%", () =>
                escapeHtml(t("app.description")),
              ),
        },
      },
    ],
    server: {
      ...config.server,
      proxy: {
        [config.api.baseUrl]: {
          target: config.api.proxyTarget,
          changeOrigin: true,
          rewrite: (path) =>
            config.api.proxyPath + path.slice(config.api.baseUrl.length),
        },
      },
    },
    preview: config.preview,
  };
});
