import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { CreditApplicationPage } from "../features/credit-application";
import { LocaleProvider } from "./LocaleProvider";
import { createTranslator, catalogs } from "./catalog";

describe("Localization", () => {
  it("keeps catalog keys and interpolation placeholders consistent", () => {
    expect(Object.keys(catalogs.en).sort()).toEqual(
      Object.keys(catalogs.ru).sort(),
    );
    for (const key of Object.keys(
      catalogs.ru,
    ) as (keyof typeof catalogs.ru)[]) {
      const placeholders = (text: string) =>
        [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();
      expect(placeholders(catalogs.en[key])).toEqual(
        placeholders(catalogs.ru[key]),
      );
      expect(catalogs.en[key].trim()).not.toBe("");
    }
  });
  it("switches labels, hints, errors, metadata and dialog text without resetting input", async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <LocaleProvider locale="ru">
        <CreditApplicationPage />
      </LocaleProvider>,
    );
    await user.type(
      screen.getByRole("textbox", { name: "Название компании" }),
      "Test company",
    );
    await user.click(screen.getByRole("button", { name: "Проверить данные" }));
    rerender(
      <LocaleProvider locale="en">
        <CreditApplicationPage />
      </LocaleProvider>,
    );
    expect(document.documentElement.lang).toBe("en");
    expect(document.title).toBe("CredNexus — lending portal");
    expect(screen.getByRole("textbox", { name: "Company name" })).toHaveValue(
      "Test company",
    );
    expect(
      screen.getByRole("textbox", { name: "Company tax ID" }),
    ).toHaveAccessibleDescription(
      "Enter a 10- or 12-digit tax ID",
    );
    expect(document.body.textContent).not.toMatch(/[А-Яа-яЁё]/);
    await user.type(
      screen.getByRole("textbox", { name: "Company tax ID" }),
      "0000000000",
    );
    await user.type(
      screen.getByRole("textbox", { name: "Loan amount, ₽" }),
      "1000",
    );
    await user.selectOptions(
      screen.getByRole("combobox", { name: "Financing purpose" }),
      "equipment",
    );
    await user.click(screen.getByRole("button", { name: "Check details" }));
    expect(
      screen.getByRole("dialog", { name: "Confirm details" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Close dialog" }),
    ).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/[А-Яа-яЁё]/);
  });
  it("reports missing interpolation values in English", () => {
    expect(() => createTranslator("ru")("application.hints.comment")).toThrow(
      "Missing interpolation value: maxLength",
    );
  });
});
