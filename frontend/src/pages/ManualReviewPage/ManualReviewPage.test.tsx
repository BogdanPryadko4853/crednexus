import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import { beforeEach, expect, it, vi } from "vitest";
import { LocaleProvider } from "../../i18n";
import { ApiError } from "../../api/httpClient";
import { ManualReviewPage } from "./ManualReviewPage";
import { ManualReviewDetailsPage } from "./ManualReviewDetailsPage";
import { ReviewAccess } from "../../features/manual-review/ui/ReviewAccess";

const mock = vi.hoisted(() => {
  const request = vi.fn();
  return { request, api: { request, download: vi.fn() }, roles: ["BANK_EMPLOYEE"] };
});
vi.mock("../../auth", () => ({ useAuth: () => ({ api: mock.api, state: { status: "authenticated", user: { roles: mock.roles } } }) }));
const application = { id: "app", companyName: "Компания", requestedAmount: 500000, requestedTermMonths: 12, purpose: "Оборотные средства" };
const details = { application, company: { name: "Компания", inn: "7707083893" }, financialSnapshot: null, verifications: [], scoring: null, documents: [], informationRequests: [], decisions: [], statusHistory: [{ id: "event", toStatus: "MANUAL_REVIEW", occurredAt: "2026-10-22T10:00:00Z" }] };
beforeEach(() => {
  mock.roles = ["BANK_EMPLOYEE"];
  mock.request.mockReset();
  mock.request.mockImplementation(async (path: string) => path.endsWith("/details") ? details : [application]);
});
function open(path = "/manual-review") {
  return render(<LocaleProvider><MemoryRouter initialEntries={[path]}><Routes><Route element={<ReviewAccess />}><Route path="/manual-review" element={<ManualReviewPage />} /><Route path="/manual-review/:applicationId" element={<ManualReviewDetailsPage />} /></Route></Routes></MemoryRouter></LocaleProvider>);
}
it("blocks a client before requesting bank data", () => {
  mock.roles = ["CLIENT"];
  open();
  expect(screen.getByText("Доступ разрешён только сотрудникам банка")).toBeInTheDocument();
  expect(mock.request).not.toHaveBeenCalled();
});
it("opens the bank details endpoint from the queue", async () => {
  open();
  await userEvent.click(await screen.findByRole("link", { name: "Компания" }));
  expect(await screen.findByText("Кредитная оценка")).toBeInTheDocument();
  expect(mock.request).toHaveBeenCalledWith("/manual-review/loan-applications/app/details");
});
it("shows an empty queue", async () => {
  mock.request.mockResolvedValue([]);
  open();
  expect(await screen.findByText("Нет заявок на рассмотрении")).toBeInTheDocument();
});
it("sends approval only after explicit confirmation", async () => {
  open("/manual-review/app");
  await userEvent.type(await screen.findByRole("textbox", { name: "Причина решения" }), "Показатели проверены");
  await userEvent.click(screen.getByRole("button", { name: "Принять решение" }));
  expect(mock.request.mock.calls.some(([, options]) => options?.method === "POST")).toBe(false);
  await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Подтвердить" }));
  await waitFor(() => expect(mock.request).toHaveBeenCalledWith("/manual-review/loan-applications/app/decision", { method: "POST", body: { action: "APPROVE", reason: "Показатели проверены" } }));
  expect(await screen.findByText("Изменения сохранены")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Принять решение" })).not.toBeInTheDocument();
});
it("refreshes stale status on conflict without repeating the decision", async () => {
  mock.request.mockImplementation(async (path: string) => {
    if (path.endsWith("/decision")) throw new ApiError("http", 409);
    return details;
  });
  open("/manual-review/app");
  await userEvent.type(await screen.findByRole("textbox", { name: "Причина решения" }), "Проверено");
  await userEvent.click(screen.getByRole("button", { name: "Принять решение" }));
  await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Подтвердить" }));
  expect(await screen.findByText("Статус заявки изменился. Данные обновлены")).toBeInTheDocument();
  expect(mock.request.mock.calls.filter(([path]) => path.endsWith("/decision"))).toHaveLength(1);
});

it("validates counteroffer terms and sends the selected values", async () => {
  open("/manual-review/app");
  await userEvent.selectOptions(await screen.findByRole("combobox", { name: "Решение" }), "COUNTER_OFFER");
  await userEvent.type(screen.getByRole("textbox", { name: "Причина решения" }), "Сниженная сумма");
  expect(screen.getByRole("button", { name: "Принять решение" })).toBeDisabled();
  await userEvent.type(screen.getByRole("textbox", { name: "Сумма, ₽" }), "400000");
  await userEvent.type(screen.getByRole("textbox", { name: "Срок, мес." }), "10");
  await userEvent.type(screen.getByRole("textbox", { name: "Ставка, %" }), "18.5");
  await userEvent.click(screen.getByRole("button", { name: "Принять решение" }));
  await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Подтвердить" }));
  await waitFor(() => expect(mock.request).toHaveBeenCalledWith("/manual-review/loan-applications/app/decision", { method: "POST", body: { action: "COUNTER_OFFER", reason: "Сниженная сумма", amount: 400000, termMonths: 10, interestRate: 18.5 } }));
});

it("confirms and sends an information request", async () => {
  open("/manual-review/app");
  await userEvent.type(await screen.findByRole("textbox", { name: "Вопрос клиенту" }), "Уточните обязательства");
  await userEvent.click(screen.getByRole("button", { name: "Запросить уточнение" }));
  await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Подтвердить" }));
  await waitFor(() => expect(mock.request).toHaveBeenCalledWith("/manual-review/loan-applications/app/information-requests", { method: "POST", body: { question: "Уточните обязательства" } }));
});
