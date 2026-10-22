import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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
it("lets a client create a company but does not offer product administration", async () => {
  render(<LocaleProvider><SetupCards /></LocaleProvider>);
  await userEvent.click(screen.getByText("Добавить компанию", { selector: "summary" }));
  await userEvent.type(screen.getByLabelText("Название", { exact: false }), "Тестовая компания");
  await userEvent.type(screen.getByLabelText("ИНН", { exact: false }), "7701234500");
  await userEvent.type(screen.getByLabelText("ОГРН / ОГРНИП", { exact: false }), "1027700132195");
  await userEvent.click(screen.getByRole("button", { name: "Добавить компанию" }));
  await waitFor(() => expect(mock.request).toHaveBeenCalledWith("/companies", {
    method: "POST", body: { name: "Тестовая компания", inn: "7701234500", ogrnOrOgrnip: "1027700132195", legalForm: "OOO", status: "ACTIVE" },
  }));
  expect(screen.queryByText("Создать продукт")).not.toBeInTheDocument();
});
it("offers product creation only to bank roles", () => {
  mock.roles = ["BANK_EMPLOYEE"];
  render(<LocaleProvider><SetupCards /></LocaleProvider>);
  expect(screen.getByText("Создать продукт", { selector: "summary" })).toBeInTheDocument();
});
