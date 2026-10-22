import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionState } from "../auth/session";
import type { ReactNode } from "react";
import { AppRoutes } from "./router";
import { LocaleProvider } from "../i18n";
import { currentUser } from "../test/currentUser";

const auth = vi.hoisted(() => ({
  state: { status: "anonymous" } as SessionState,
  login: vi.fn().mockResolvedValue(undefined),
  logout: vi.fn().mockResolvedValue(undefined),
  retry: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../auth/AuthProvider", () => ({
  useAuth: () => auth,
  AuthProvider: ({ children }: { children: ReactNode }) => children,
}));
beforeEach(() => {
  auth.state = { status: "anonymous" };
  vi.clearAllMocks();
});

function CurrentLocation() {
  const location = useLocation();
  return (
    <div aria-label="Current URL">{location.pathname + location.search}</div>
  );
}
function open(entry: string, locale: "ru" | "en" = "ru") {
  return render(
    <LocaleProvider locale={locale}>
      <MemoryRouter initialEntries={[entry]}>
        <AppRoutes />
        <CurrentLocation />
      </MemoryRouter>
    </LocaleProvider>,
  );
}

describe("Application routing", () => {
  it("protects private pages and preserves the requested destination", async () => {
    open("/profile");
    expect(
      screen.getByRole("heading", { level: 1, name: "Вход в кабинет" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Current URL")).toHaveTextContent(
      "/login?returnTo=%2Fprofile",
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Войти в кабинет" }),
    );
    expect(auth.login).toHaveBeenCalledWith("/profile");
  });
  it("sends authenticated visitors from login to the dashboard", () => {
    auth.state = { status: "authenticated", user: currentUser };
    open("/login");
    expect(
      screen.getByRole("heading", {
        level: 1,
        name: `Здравствуйте, ${currentUser.fullName}`,
      }),
    ).toBeInTheDocument();
  });
  it("renders the backend profile without inventing editable fields", () => {
    auth.state = { status: "authenticated", user: currentUser };
    open("/profile");
    expect(
      screen.getByRole("heading", { level: 1, name: "Профиль" }),
    ).toBeInTheDocument();
    expect(screen.getByText(currentUser.email)).toBeInTheDocument();
    expect(screen.getByText("Клиент")).toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });
  it("keeps errors localized and exposes a retry action", async () => {
    auth.state = { status: "error", source: "profile" };
    open("/profile", "en");
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Unable to load your profile",
    );
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(auth.retry).toHaveBeenCalledOnce();
    await userEvent.click(screen.getByRole("button", { name: "Sign out" }));
    expect(auth.logout).toHaveBeenCalledOnce();
  });
  it("shows an expired session without a QR sign-in option", () => {
    auth.state = { status: "anonymous", expired: true };
    open("/login");
    expect(screen.getByRole("status")).toHaveTextContent("Сессия завершена");
    expect(screen.queryByText(/QR/)).not.toBeInTheDocument();
  });
  it("renders a localized 404", () => {
    open("/missing", "en");
    expect(
      screen.getByRole("heading", { level: 1, name: "Page not found" }),
    ).toBeInTheDocument();
  });
  it("supports a deployment basename", () => {
    auth.state = { status: "authenticated", user: currentUser };
    render(
      <MemoryRouter basename="/portal" initialEntries={["/portal/profile"]}>
        <AppRoutes />
      </MemoryRouter>,
    );
    expect(
      screen.getByRole("heading", { level: 1, name: "Профиль" }),
    ).toBeInTheDocument();
  });
});
