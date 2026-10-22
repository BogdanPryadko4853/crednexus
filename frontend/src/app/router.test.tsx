import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import { AppRoutes, routes } from "./router";
import { LocaleProvider } from "../i18n";

describe("Application routing", () => {
  it.each(["/", "/applications/new"])(
    "opens the application at %s",
    (entry) => {
      render(
        <MemoryRouter initialEntries={[entry]}>
          <AppRoutes />
        </MemoryRouter>,
      );
      expect(
        screen.getByRole("heading", {
          level: 1,
          name: "Заявка на финансирование",
        }),
      ).toBeInTheDocument();
    },
  );
  it("renders a localized 404 and returns to the form without a page reload", async () => {
    const user = userEvent.setup();
    render(
      <LocaleProvider locale="en">
        <MemoryRouter initialEntries={["/missing"]}>
          <AppRoutes />
        </MemoryRouter>
      </LocaleProvider>,
    );
    expect(
      screen.getByRole("heading", { level: 1, name: "Page not found" }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("link", { name: "Back to application" }));
    expect(
      screen.getByRole("heading", { level: 1, name: "Financing application" }),
    ).toBeInTheDocument();
  });
  it("supports a deployment basename", () => {
    render(
      <MemoryRouter
        basename="/portal"
        initialEntries={["/portal" + routes.creditApplication]}
      >
        <AppRoutes />
      </MemoryRouter>,
    );
    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "Заявка на финансирование",
      }),
    ).toBeInTheDocument();
  });
});
