import { ru } from "./locales/ru/index.ts";
import { en } from "./locales/en/index.ts";

export const DEFAULT_LOCALE = "ru";
export const catalogs = { ru, en };
export type Locale = keyof typeof catalogs;
export type MessageKey = keyof typeof ru;
export type MessageValues = Record<string, string | number>;

export function createTranslator(locale: Locale) {
  return (key: MessageKey, values: MessageValues = {}): string =>
    catalogs[locale][key].replace(/\{(\w+)\}/g, (_, name: string) => {
      if (values[name] === undefined) {
        throw new Error(`Missing interpolation value: ${name} for ${key}`);
      }
      return String(values[name]);
    });
}
