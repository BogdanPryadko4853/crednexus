import type { CSSProperties, ReactNode } from "react";
import { Icon } from "./Icon";

export function Skeleton({
  width = "100%",
  height = 16,
}: {
  width?: CSSProperties["width"];
  height?: CSSProperties["height"];
}) {
  return (
    <span
      className="ui-skeleton"
      style={{ width, height }}
      aria-hidden="true"
    />
  );
}

type PageStateProps = {
  kind: "loading" | "error" | "empty";
  title: string;
  description?: string;
  action?: ReactNode;
};

export function PageState({
  kind,
  title,
  description,
  action,
}: PageStateProps) {
  return (
    <div
      className={`ui-page-state ui-page-state--${kind}`}
      role={
        kind === "loading" ? "status" : kind === "error" ? "alert" : undefined
      }
      aria-live={kind === "loading" ? "polite" : undefined}
    >
      <span className="ui-page-state__icon">
        {kind === "loading" ? (
          <span className="ui-spinner" aria-hidden="true" />
        ) : (
          <Icon name={kind === "error" ? "warning" : "file"} size={24} />
        )}
      </span>
      <h3>{title}</h3>
      {description && <p>{description}</p>}
      {action && <div className="ui-page-state__action">{action}</div>}
    </div>
  );
}
