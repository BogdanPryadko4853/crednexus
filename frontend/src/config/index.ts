import { readEnvironment } from "./readEnvironment";

declare global {
  interface Window {
    __CREDNEXUS_ENV__?: Record<string, string | undefined>;
  }
}

export const config = readEnvironment({
  ...import.meta.env,
  ...(typeof window === "undefined" ? {} : window.__CREDNEXUS_ENV__),
});
