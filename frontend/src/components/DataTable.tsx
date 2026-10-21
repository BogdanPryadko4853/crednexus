import type { ReactNode } from "react";

export type TableColumn<Row> = {
  key: string;
  heading: string;
  render: (row: Row) => ReactNode;
  align?: "start" | "end";
};
type DataTableProps<Row> = {
  caption: string;
  columns: readonly TableColumn<Row>[];
  rows: readonly Row[];
  rowKey: (row: Row) => string;
  emptyMessage?: string;
};

export function DataTable<Row>({
  caption,
  columns,
  rows,
  rowKey,
  emptyMessage = "Пока нет данных",
}: DataTableProps<Row>) {
  return (
    <div
      className="ui-table-region"
      role="region"
      aria-label={caption}
      tabIndex={0}
    >
      <table className="ui-table">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            {columns.map((column) => (
              <th
                key={column.key}
                scope="col"
                className={
                  column.align === "end" ? "ui-table__number" : undefined
                }
              >
                {column.heading}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="ui-table__empty">
                {emptyMessage}
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr key={rowKey(row)}>
                {columns.map((column) => (
                  <td
                    key={column.key}
                    className={
                      column.align === "end" ? "ui-table__number" : undefined
                    }
                  >
                    {column.render(row)}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
