import * as domMatchers from "@testing-library/jest-dom/matchers";
import type { TestingLibraryMatchers } from "@testing-library/jest-dom/matchers";
import { cleanup } from "@testing-library/react";
import { afterEach, expect } from "vitest";

// Vitest 5 uses two matcher type parameters. Register standalone DOM matchers
// through its public extension point instead of the older one-parameter adapter.
declare module "vitest" {
  interface Matchers<
    R extends void | Promise<void> = void | Promise<void>,
    T = unknown,
  > extends TestingLibraryMatchers<T, R> {}
}

expect.extend(domMatchers);

afterEach(cleanup);

// Only model open/closed state where jsdom lacks the native dialog API.
// Focus trapping, Escape and backdrop interactions are checked in a browser.
if (typeof HTMLDialogElement.prototype.showModal !== "function") {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
}
if (typeof HTMLDialogElement.prototype.close !== "function") {
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute("open");
  };
}
