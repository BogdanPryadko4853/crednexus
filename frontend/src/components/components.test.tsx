import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import {
  Button,
  DataTable,
  Modal,
  PageState,
  SelectField,
  TextareaField,
  TextField,
} from "./index";

describe("Button", () => {
  it("does not accidentally submit a parent form", async () => {
    const submit = vi.fn((event) => event.preventDefault());
    const click = vi.fn();
    render(
      <form onSubmit={submit}>
        <Button onClick={click}>Проверить</Button>
      </form>,
    );
    await userEvent.click(screen.getByRole("button", { name: "Проверить" }));
    expect(click).toHaveBeenCalledOnce();
    expect(submit).not.toHaveBeenCalled();
  });

  it("blocks a repeated action while loading and keeps its accessible name", async () => {
    const click = vi.fn();
    render(
      <Button loading onClick={click}>
        Сохранить
      </Button>,
    );
    const button = screen.getByRole("button", { name: "Сохранить" });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("aria-busy", "true");
    await userEvent.click(button);
    expect(click).not.toHaveBeenCalled();
  });
});

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

describe("DataTable", () => {
  const columns = [
    {
      key: "name",
      heading: "Компания",
      render: (row: { id: string; name: string }) => row.name,
    },
  ];
  it("renders semantic headings and supplied data", () => {
    render(
      <DataTable
        caption="Компании"
        columns={columns}
        rows={[{ id: "1", name: "ООО «Маяк»" }]}
        rowKey={(row) => row.id}
      />,
    );
    expect(screen.getByRole("table", { name: "Компании" })).toBeInTheDocument();
    expect(
      screen.getByRole("columnheader", { name: "Компания" }),
    ).toHaveAttribute("scope", "col");
    expect(
      screen.getByRole("cell", { name: "ООО «Маяк»" }),
    ).toBeInTheDocument();
  });
  it("explains an empty response instead of showing a blank table", () => {
    render(
      <DataTable
        caption="Компании"
        columns={columns}
        rows={[]}
        rowKey={(row) => row.id}
        emptyMessage="Компаний пока нет"
      />,
    );
    expect(
      screen.getByRole("cell", { name: "Компаний пока нет" }),
    ).toHaveAttribute("colspan", "1");
  });
});

describe("Modal", () => {
  it("labels the dialog, requests closing on Escape and restores page scrolling", () => {
    const close = vi.fn();
    const { rerender } = render(
      <Modal
        open
        onClose={close}
        title="Подтверждение"
        description="Проверьте сведения"
      >
        Содержимое
      </Modal>,
    );
    const dialog = screen.getByRole("dialog", { name: "Подтверждение" });
    expect(dialog).toHaveAccessibleDescription("Проверьте сведения");
    expect(document.documentElement.style.overflow).toBe("hidden");
    fireEvent(
      dialog,
      new Event("cancel", { bubbles: false, cancelable: true }),
    );
    expect(close).toHaveBeenCalledOnce();
    rerender(
      <Modal open={false} onClose={close} title="Подтверждение">
        Содержимое
      </Modal>,
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(document.documentElement.style.overflow).toBe("");
  });
});

describe("PageState", () => {
  it("announces errors and preserves the recovery action", async () => {
    const retry = vi.fn();
    render(
      <PageState
        kind="error"
        title="Нет соединения"
        action={<Button onClick={retry}>Повторить</Button>}
      />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("Нет соединения");
    await userEvent.click(screen.getByRole("button", { name: "Повторить" }));
    expect(retry).toHaveBeenCalledOnce();
  });
});
