import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { TextField, SelectField, TextareaField } from "../../index";

describe("Fields", () => {
  it("connects the label, external description, hint and error without losing any", () => {
    render(
      <>
        <p id="external">Данные компании</p>
        <TextField
          label="ИНН"
          hint="10 или 12 цифр"
          error="Проверьте ИНН"
          aria-describedby="external"
          required
        />
      </>,
    );
    const field = screen.getByRole("textbox", { name: "ИНН" });
    expect(field).toBeRequired();
    expect(field).toHaveAttribute("aria-invalid", "true");
    expect(field).toHaveAccessibleDescription(
      "Данные компании 10 или 12 цифр Проверьте ИНН",
    );
  });

  it("creates different IDs for repeated fields", () => {
    render(
      <>
        <TextField label="Название" />
        <TextField label="Название" />
      </>,
    );
    const fields = screen.getAllByRole("textbox", { name: "Название" });
    expect(fields[0]?.id).toBeTruthy();
    expect(fields[0]?.id).not.toBe(fields[1]?.id);
  });

  it("supports native selection, multiline input and disabled state", async () => {
    render(
      <>
        <SelectField label="Цель">
          <option value="a">Оборотные средства</option>
          <option value="b">Оборудование</option>
        </SelectField>
        <TextareaField label="Комментарий" />
        <TextField label="Недоступно" value="Не изменяется" disabled />
      </>,
    );
    await userEvent.selectOptions(
      screen.getByRole("combobox", { name: "Цель" }),
      "b",
    );
    expect(screen.getByRole("combobox")).toHaveValue("b");
    await userEvent.type(
      screen.getByRole("textbox", { name: "Комментарий" }),
      "Закупка материалов",
    );
    expect(screen.getByRole("textbox", { name: "Комментарий" })).toHaveValue(
      "Закупка материалов",
    );
    expect(screen.getByRole("textbox", { name: "Недоступно" })).toBeDisabled();
  });
});
