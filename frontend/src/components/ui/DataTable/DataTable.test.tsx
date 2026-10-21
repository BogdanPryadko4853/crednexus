import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DataTable } from "../../index";

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
