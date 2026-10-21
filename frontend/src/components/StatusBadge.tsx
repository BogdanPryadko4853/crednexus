import type { HTMLAttributes } from "react";
import { Icon } from "./Icon";

export type StatusTone =
  | "neutral"
  | "info"
  | "positive"
  | "attention"
  | "negative";

export function StatusBadge({
  tone = "neutral",
  children,
  className = "",
  ...props
}: HTMLAttributes<HTMLSpanElement> & { tone?: StatusTone }) {
  return (
    <span className={`ui-status ui-status--${tone} ${className}`} {...props}>
      <Icon
        name={
          tone === "positive"
            ? "check"
            : tone === "negative"
              ? "close"
              : tone === "attention"
                ? "warning"
                : tone === "info"
                  ? "clock"
                  : "file"
        }
        size={14}
      />
      {children}
    </span>
  );
}
