import type { HTMLAttributes } from "react";
import { Icon } from "./Icon";
import type { StatusTone } from "./StatusBadge";

export function Alert({
  tone = "info",
  title,
  children,
  className = "",
  ...props
}: Omit<HTMLAttributes<HTMLDivElement>, "title"> & {
  tone?: Exclude<StatusTone, "neutral">;
  title: string;
}) {
  return (
    <div className={`ui-alert ui-alert--${tone} ${className}`} {...props}>
      <Icon
        name={
          tone === "positive"
            ? "check"
            : tone === "negative" || tone === "attention"
              ? "warning"
              : "info"
        }
      />
      <div>
        <p className="ui-alert__title">{title}</p>
        {children && <div className="ui-alert__body">{children}</div>}
      </div>
    </div>
  );
}
