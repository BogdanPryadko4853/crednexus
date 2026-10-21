import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Button } from "../../index";

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
