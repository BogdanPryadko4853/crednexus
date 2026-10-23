import { render, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { LocaleProvider } from "../../../i18n";
import { SetupCards } from "./SetupCards";

const mock = vi.hoisted(() => ({ request: vi.fn(), roles: ["CLIENT"] }));
vi.mock("../../../auth", () => ({
  useAuth: () => ({
    api: { request: mock.request },
    state: { status: "authenticated", user: { roles: mock.roles } },
  }),
}));
beforeEach(() => {
  mock.roles = ["CLIENT"];
  mock.request.mockReset();
  mock.request.mockResolvedValue([]);
});
it("does not show company management on the dashboard for a client", async () => {
  render(<LocaleProvider><SetupCards /></LocaleProvider>);
  expect(screen.queryByText("Мои компании")).not.toBeInTheDocument();
  expect(screen.queryByText("Создать продукт")).not.toBeInTheDocument();
});
it("offers product creation only to bank roles", () => {
  mock.roles = ["BANK_EMPLOYEE"];
  render(<LocaleProvider><SetupCards /></LocaleProvider>);
  expect(screen.getByText("Создать продукт", { selector: "summary" })).toBeInTheDocument();
});
