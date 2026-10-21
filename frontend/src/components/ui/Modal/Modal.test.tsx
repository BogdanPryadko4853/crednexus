import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Modal } from "../../index";

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
