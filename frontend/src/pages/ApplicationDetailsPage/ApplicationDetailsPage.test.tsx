import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import { beforeEach, expect, it, vi } from "vitest";
import { LocaleProvider } from "../../i18n";
import { ApiError } from "../../api/httpClient";
import { ApplicationDetailsPage } from "./ApplicationDetailsPage";

const { request, api } = vi.hoisted(() => {
  const request = vi.fn();
  return { request, api: { request, download: vi.fn() } };
});
vi.mock("../../auth", () => ({ useAuth: () => ({ api }) }));
const application = {
  id: "app",
  companyId: "company",
  requestedAmount: 750000,
  termMonths: 12,
  purpose: "Оборотные средства",
  status: "MANUAL_REVIEW",
};
beforeEach(() => {
  request.mockReset();
  request.mockImplementation(async (path: string) => {
    if (path === "/loan-applications/app") return application;
    if (path.endsWith("/verifications"))
      return [{ id: "check", type: "TAX_SERVICE", status: "SUCCESS" }];
    if (path.endsWith("/documents") || path.endsWith("/information-requests"))
      return [];
    throw new ApiError("http", 404);
  });
});
function open() {
  return render(
    <LocaleProvider>
      <MemoryRouter initialEntries={["/applications/app"]}>
        <Routes>
          <Route
            path="/applications/:applicationId"
            element={<ApplicationDetailsPage />}
          />
        </Routes>
      </MemoryRouter>
    </LocaleProvider>,
  );
}
it("shows verification results and highlights manual review", async () => {
  open();
  await userEvent.click(await screen.findByRole("tab", { name: /Рассмотрение/ }));
  expect(await screen.findByText("Налоговая служба")).toBeInTheDocument();
  expect(screen.getByText("Пройдена")).toBeInTheDocument();
  expect(screen.getByRole("listitem", { current: "step" })).toHaveTextContent(
    "На рассмотрении",
  );
  expect(
    screen.queryByText("Не удалось загрузить данные"),
  ).not.toBeInTheDocument();
});
it("exposes a failed resource and retries it", async () => {
  request.mockImplementationOnce(async () => application);
  request.mockImplementationOnce(async () => {
    throw new ApiError("http", 500);
  });
  open();
  expect(
    await screen.findByText("Не удалось загрузить запросы уточнений"),
  ).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Повторить" }));
  await waitFor(() =>
    expect(
      screen.queryByText("Не удалось загрузить запросы уточнений"),
    ).not.toBeInTheDocument(),
  );
});
it("retries the main application load after a network failure", async () => {
  request.mockImplementationOnce(async () => {
    throw new ApiError("network");
  });
  open();
  await userEvent.click(
    await screen.findByRole("button", { name: "Повторить" }),
  );
  expect(await screen.findByText("Параметры заявки")).toBeInTheDocument();
});

it("keeps a resource error visible while background refresh is pending", async () => {
  const original = request.getMockImplementation()!;
  request.mockImplementation(async (path: string) => {
    if (path.endsWith("/fulfillment")) throw new ApiError("http", 500);
    return original(path);
  });
  open();
  const message = await screen.findByText("Не удалось загрузить сведения о выдаче");
  await waitFor(() => expect(screen.queryByText("Загружаем заявку")).not.toBeInTheDocument());
  let finish!: (value: unknown) => void;
  request.mockImplementation((path: string) => path.endsWith("/fulfillment")
    ? new Promise((resolve) => { finish = resolve; }) : original(path));
  await userEvent.click(screen.getByRole("button", { name: "Обновить" }));
  expect(message).toBeInTheDocument();
  expect(screen.queryByText("Загружаем заявку")).not.toBeInTheDocument();
  await act(async () => finish({}));
  await waitFor(() => expect(message).not.toBeInTheDocument());
});

it("saves draft values with PATCH and validates empty amounts", async () => {
  const original = request.getMockImplementation()!;
  request.mockImplementation(
    async (path: string, options?: { method: string; body: object }) => {
      if (path === "/loan-applications/app")
        return { ...application, status: "DRAFT", ...(options?.body ?? {}) };
      return original(path);
    },
  );
  open();
  const amount = await screen.findByRole("textbox", { name: "Сумма, ₽" });
  await waitFor(() => expect(amount).toHaveValue("750000"));
  await userEvent.clear(amount);
  expect(
    screen.getByRole("button", { name: "Сохранить изменения" }),
  ).toBeDisabled();
  await userEvent.type(amount, "900000");
  await userEvent.click(
    screen.getByRole("button", { name: "Сохранить изменения" }),
  );
  await waitFor(() =>
    expect(request).toHaveBeenCalledWith("/loan-applications/app", {
      method: "PATCH",
      body: {
        requestedAmount: 900000,
        termMonths: 12,
        purpose: application.purpose,
      },
    }),
  );
  expect(screen.getByRole("tab", { name: /Финансы/ })).toHaveAttribute(
    "aria-selected",
    "true",
  );
});

it("refreshes the application after answering an information request", async () => {
  const original = request.getMockImplementation()!;
  request.mockImplementation(async (path: string) => {
    if (path.endsWith("/information-requests"))
      return [{ id: "question", question: "Уточните выручку", status: "OPEN" }];
    if (path.endsWith("/answer"))
      return {
        id: "question",
        question: "Уточните выручку",
        status: "ANSWERED",
        answer: "12000000",
      };
    return original(path);
  });
  open();
  await userEvent.click(await screen.findByRole("tab", { name: /Документы/ }));
  await userEvent.type(
    await screen.findByRole("textbox", { name: "Ответ" }),
    "12000000",
  );
  const callsBefore = request.mock.calls.filter(
    ([path]) => path === "/loan-applications/app",
  ).length;
  await userEvent.click(
    screen.getByRole("button", { name: "Отправить ответ" }),
  );
  await waitFor(() =>
    expect(request).toHaveBeenCalledWith(
      "/loan-applications/app/information-requests/question/answer",
      { method: "POST", body: { answer: "12000000" } },
    ),
  );
  await waitFor(() =>
    expect(
      request.mock.calls.filter(([path]) => path === "/loan-applications/app")
        .length,
    ).toBeGreaterThan(callsBefore),
  );
});

it("requires a saved ML profile before submission", async () => {
  const original = request.getMockImplementation()!;
  request.mockImplementation(async (path: string) =>
    path === "/loan-applications/app"
      ? { ...application, status: "DRAFT" }
      : original(path),
  );
  open();
  await userEvent.click(await screen.findByRole("tab", { name: /Рассмотрение/ }));
  expect(
    await screen.findByRole("button", { name: "Отправить на рассмотрение" }),
  ).toBeDisabled();
  expect(
    screen.getByText("Финансовый профиль для скоринга", { selector: "h3" }),
  ).toBeInTheDocument();
});

it("does not offer a text answer for a document requirement and uploads the supported type", async () => {
  const original = request.getMockImplementation()!;
  request.mockImplementation(
    async (path: string, options?: { method: string; body: unknown }) => {
      if (path.endsWith("/information-requests"))
        return [
          {
            id: "document-question",
            question: "Приложите документ регистрации",
            status: "OPEN",
            requiresDocument: true,
          },
        ];
      if (path.endsWith("/documents") && options?.method === "POST")
        return { id: "document", fileName: "proof.pdf", status: "AVAILABLE" };
      return original(path);
    },
  );
  open();
  await userEvent.click(await screen.findByRole("tab", { name: /Документы/ }));
  await screen.findByText("Приложите документ регистрации", {
    selector: "strong",
  });
  expect(
    screen.queryByRole("textbox", { name: "Ответ" }),
  ).not.toBeInTheDocument();
  await userEvent.selectOptions(
    screen.getByRole("combobox", { name: "Документ к запросу" }),
    "document-question",
  );
  await userEvent.upload(
    screen.getByLabelText("Документы"),
    new File(["%PDF-1.7"], "proof.pdf", { type: "application/pdf" }),
  );
  await waitFor(() => {
    const call = request.mock.calls.find(
      ([path, options]) =>
        path.endsWith("/documents") && options?.method === "POST",
    );
    expect(call).toBeDefined();
    const body = call![1].body as FormData;
    expect(body.get("type")).toBe("SUPPORTING_DOCUMENT");
    expect(body.get("informationRequestId")).toBe("document-question");
  });
});
