import "./PageState.css";
import "../Spinner/Spinner.css";
import type { ReactNode } from "react";
import { Icon } from "../Icon";

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
          <Icon name={kind === "error" ? "warning" : "file"} size="lg" />
        )}
      </span>
      <h3>{title}</h3>
      {description && <p>{description}</p>}
      {action && <div className="ui-page-state__action">{action}</div>}
    </div>
  );
}
