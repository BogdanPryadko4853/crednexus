import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import { LocaleProvider } from "../../i18n";
import { CompaniesPage } from "./CompaniesPage";

const { request, api } = vi.hoisted(() => {
  const request = vi.fn();
  return { request, api: { request } };
});
vi.mock("../../auth", () => ({ useAuth: () => ({ api }) }));
beforeEach(() => request.mockReset());

it("translates the company roles returned by the backend", async () => {
  const company = { id: "company", name: "Маяк", inn: "7707083893", currentUserRole: "REPRESENTATIVE" };
  request.mockImplementation(async (path: string) => path === "/companies" ? [company] : company);
  render(<LocaleProvider><CompaniesPage /></LocaleProvider>);
  await userEvent.click(await screen.findByText("Маяк"));
  expect(await screen.findByText("Представитель")).toBeInTheDocument();
  expect(screen.queryByText("REPRESENTATIVE")).not.toBeInTheDocument();
});

it("explains invalid company identifiers and sends only valid details", async () => {
  request.mockImplementation(async (_path: string, options?: { method?: string; body?: object }) => options?.method === "POST" ? { id: "new", ...options.body } : []);
  const user = userEvent.setup();
  render(<LocaleProvider><CompaniesPage /></LocaleProvider>);
  await user.click(await screen.findByText("Добавить компанию"));
  await user.type(screen.getByRole("textbox", { name: "Название компании" }), "Маяк");
  await user.type(screen.getByRole("textbox", { name: "ИНН" }), "12345678901");
  await user.type(screen.getByRole("textbox", { name: "ОГРН / ОГРНИП" }), "12345678901234");
  await user.type(screen.getByRole("textbox", { name: "Организационно-правовая форма" }), "ООО");
  await user.click(screen.getByRole("button", { name: "Создать компанию" }));
  expect(screen.getByText("Введите 10 или 12 цифр ИНН.")).toBeInTheDocument();
  expect(screen.getByText("Введите 13 цифр ОГРН или 15 цифр ОГРНИП.")).toBeInTheDocument();
  expect(request.mock.calls.some(([, options]) => options?.method === "POST")).toBe(false);
  await user.clear(screen.getByRole("textbox", { name: "ИНН" }));
  await user.type(screen.getByRole("textbox", { name: "ИНН" }), "7707083893");
  await user.clear(screen.getByRole("textbox", { name: "ОГРН / ОГРНИП" }));
  await user.type(screen.getByRole("textbox", { name: "ОГРН / ОГРНИП" }), "1027700132195");
  await user.click(screen.getByRole("button", { name: "Создать компанию" }));
  await waitFor(() => expect(request).toHaveBeenCalledWith("/companies", { method: "POST", body: { name: "Маяк", inn: "7707083893", ogrnOrOgrnip: "1027700132195", legalForm: "ООО", status: "ACTIVE" } }));
  expect(await screen.findByText("Маяк")).toBeInTheDocument();
});
