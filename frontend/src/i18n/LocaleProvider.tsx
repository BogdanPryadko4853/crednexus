import { createContext, useContext, useEffect, useMemo } from "react";
import type { ReactNode } from "react";
import { createTranslator, DEFAULT_LOCALE } from "./catalog";
import type { Locale } from "./catalog";

type LocaleContextValue = {
  locale: Locale;
  t: ReturnType<typeof createTranslator>;
};

const LocaleContext = createContext<LocaleContextValue>({
  locale: DEFAULT_LOCALE,
  t: createTranslator(DEFAULT_LOCALE),
});

export function LocaleProvider({
  locale = DEFAULT_LOCALE,
  children,
}: {
  locale?: Locale;
  children: ReactNode;
}) {
  const value = useMemo(
    () => ({ locale, t: createTranslator(locale) }),
    [locale],
  );

  useEffect(() => {
    document.documentElement.lang = locale;
    document.title = value.t("app.title");
    document
      .querySelector('meta[name="description"]')
      ?.setAttribute("content", value.t("app.description"));
  }, [locale, value]);

  return <LocaleContext value={value}>{children}</LocaleContext>;
}

export function useLocale() {
  return useContext(LocaleContext);
}
