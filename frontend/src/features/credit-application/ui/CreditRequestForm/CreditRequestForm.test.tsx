import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { CreditRequestForm } from "./CreditRequestForm";

async function renderFilledForm(user: ReturnType<typeof userEvent.setup>) {
  render(<CreditRequestForm />);
  await user.type(
    screen.getByRole("textbox", { name: "Название компании" }),
    "ООО «Маяк»",
  );
  await user.type(
    screen.getByRole("textbox", { name: "ИНН компании" }),
    "0000000000",
  );
  await user.type(
    screen.getByRole("textbox", { name: "Сумма кредита, ₽" }),
    "1 500 000",
  );
  await user.selectOptions(
    screen.getByRole("combobox", { name: "Цель финансирования" }),
    "working-capital",
  );
}

describe("Credit request form", () => {
  it("starts with empty fields and no prefilled company or loan amount", () => {
    render(<CreditRequestForm />);
    expect(
      screen.getByRole("textbox", { name: "Название компании" }),
    ).toHaveValue("");
    expect(screen.getByRole("textbox", { name: "ИНН компании" })).toHaveValue(
      "",
    );
    expect(
      screen.getByRole("textbox", { name: "Сумма кредита, ₽" }),
    ).toHaveValue("");
    expect(
      screen.getByRole("combobox", { name: "Цель финансирования" }),
    ).toHaveValue("");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
  it("focuses the first invalid field and does not open confirmation", async () => {
    const user = userEvent.setup();
    await renderFilledForm(user);
    await user.clear(
      screen.getByRole("textbox", { name: "Название компании" }),
    );
    await user.clear(screen.getByRole("textbox", { name: "ИНН компании" }));
    await user.type(
      screen.getByRole("textbox", { name: "ИНН компании" }),
      "123",
    );
    await user.click(screen.getByRole("button", { name: "Проверить данные" }));
    expect(
      screen.getByRole("textbox", { name: "Название компании" }),
    ).toHaveFocus();
    expect(
      screen.getByRole("textbox", { name: "ИНН компании" }),
    ).toHaveAccessibleDescription(
      "Введите 10 или 12 цифр ИНН",
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Проверьте заполнение полей",
    );
  });

  it.each(["0", "0,00", "-1", "1,234", "1e6"])(
    "rejects invalid monetary input %s",
    async (amount) => {
      const user = userEvent.setup();
      await renderFilledForm(user);
      await user.clear(
        screen.getByRole("textbox", { name: "Сумма кредита, ₽" }),
      );
      await user.type(
        screen.getByRole("textbox", { name: "Сумма кредита, ₽" }),
        amount,
      );
      await user.click(
        screen.getByRole("button", { name: "Проверить данные" }),
      );
      expect(
        screen.getByRole("textbox", { name: "Сумма кредита, ₽" }),
      ).toHaveAttribute("aria-invalid", "true");
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    },
  );

  it("accepts a valid decimal amount and confirms only after a second explicit action", async () => {
    const user = userEvent.setup();
    await renderFilledForm(user);
    await user.clear(screen.getByRole("textbox", { name: "Сумма кредита, ₽" }));
    await user.type(
      screen.getByRole("textbox", { name: "Сумма кредита, ₽" }),
      "1 500 000,25",
    );
    await user.click(screen.getByRole("button", { name: "Проверить данные" }));
    expect(
      await screen.findByRole("dialog", { name: "Подтверждение данных" }),
    ).toHaveTextContent("1 500 000,25");
    expect(screen.queryByText("Данные подтверждены")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Вернуться" }));
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    expect(
      screen.getByRole("textbox", { name: "Сумма кредита, ₽" }),
    ).toHaveValue("1 500 000,25");
    await user.click(screen.getByRole("button", { name: "Проверить данные" }));
    await user.click(screen.getByRole("button", { name: "Подтвердить" }));
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Проверка заполнения формы завершена",
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
