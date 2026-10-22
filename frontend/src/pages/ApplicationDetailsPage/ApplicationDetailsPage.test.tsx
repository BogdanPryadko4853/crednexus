import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import { beforeEach, expect, it, vi } from "vitest";
import { LocaleProvider } from "../../i18n";
import { ApiError } from "../../api/httpClient";
import { ApplicationDetailsPage } from "./ApplicationDetailsPage";

const { request, api } = vi.hoisted(() => { const request = vi.fn(); return { request, api: { request, download: vi.fn() } }; });
vi.mock("../../auth", () => ({ useAuth: () => ({ api }) }));
const application = { id: "app", companyId: "company", requestedAmount: 750000, termMonths: 12, purpose: "Оборотные средства", status: "MANUAL_REVIEW" };
beforeEach(() => {
  request.mockReset();
  request.mockImplementation(async (path: string) => {
    if (path === "/loan-applications/app") return application;
    if (path.endsWith("/verifications")) return [{ id: "check", type: "TAX_SERVICE", status: "SUCCESS" }];
    if (path.endsWith("/documents") || path.endsWith("/information-requests")) return [];
    throw new ApiError("http", 404);
  });
});
function open() {
  return render(<LocaleProvider><MemoryRouter initialEntries={["/applications/app"]}><Routes><Route path="/applications/:applicationId" element={<ApplicationDetailsPage />} /></Routes></MemoryRouter></LocaleProvider>);
}
it("shows verification results and highlights manual review", async () => {
  open();
  expect(await screen.findByText("Налоговая служба")).toBeInTheDocument();
  expect(screen.getByText("Пройдена")).toBeInTheDocument();
  expect(screen.getByRole("listitem", { current: "step" })).toHaveTextContent("На рассмотрении");
  expect(screen.queryByText("Не удалось загрузить данные")).not.toBeInTheDocument();
});
it("exposes a failed resource and retries it", async () => {
  request.mockImplementationOnce(async () => application);
  request.mockImplementationOnce(async () => { throw new ApiError("http", 500); });
  open();
  expect(await screen.findByText("Не удалось загрузить запросы уточнений")).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Повторить" }));
  await waitFor(() => expect(screen.queryByText("Не удалось загрузить запросы уточнений")).not.toBeInTheDocument());
});
it("retries the main application load after a network failure", async () => {
  request.mockImplementationOnce(async () => { throw new ApiError("network"); });
  open();
  await userEvent.click(await screen.findByRole("button", { name: "Повторить" }));
  expect(await screen.findByText("Параметры заявки")).toBeInTheDocument();
});

it("saves draft values with PATCH and validates empty amounts", async () => {
  const original = request.getMockImplementation()!;
  request.mockImplementation(async (path: string, options?: { method: string; body: object }) => {
    if (path === "/loan-applications/app") return { ...application, status: "DRAFT", ...(options?.body ?? {}) };
    return original(path);
  });
  open();
  const amount = await screen.findByRole("textbox", { name: "Сумма, ₽" });
  await waitFor(() => expect(amount).toHaveValue("750000"));
  await userEvent.clear(amount);
  expect(screen.getByRole("button", { name: "Сохранить изменения" })).toBeDisabled();
  await userEvent.type(amount, "900000");
  await userEvent.click(screen.getByRole("button", { name: "Сохранить изменения" }));
  await waitFor(() => expect(request).toHaveBeenCalledWith("/loan-applications/app", {
    method: "PATCH", body: { requestedAmount: 900000, termMonths: 12, purpose: application.purpose },
  }));
});

it("refreshes the application after answering an information request", async () => {
  const original = request.getMockImplementation()!;
  request.mockImplementation(async (path: string) => {
    if (path.endsWith("/information-requests")) return [{ id: "question", question: "Уточните выручку", status: "OPEN" }];
    if (path.endsWith("/answer")) return { id: "question", question: "Уточните выручку", status: "ANSWERED", answer: "12000000" };
    return original(path);
  });
  open();
  await userEvent.type(await screen.findByRole("textbox", { name: "Ответ" }), "12000000");
  const callsBefore = request.mock.calls.filter(([path]) => path === "/loan-applications/app").length;
  await userEvent.click(screen.getByRole("button", { name: "Отправить ответ" }));
  await waitFor(() => expect(request).toHaveBeenCalledWith("/loan-applications/app/information-requests/question/answer", { method: "POST", body: { answer: "12000000" } }));
  await waitFor(() => expect(request.mock.calls.filter(([path]) => path === "/loan-applications/app").length).toBeGreaterThan(callsBefore));
});
