import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { PageState, Button } from "../../index";

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
