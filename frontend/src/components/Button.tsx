import type { ButtonHTMLAttributes, ReactNode } from "react";

export function Spinner({ label = "Загрузка" }: { label?: string }) {
  return (
    <span className="ui-spinner" role="status">
      <span className="sr-only">{label}</span>
    </span>
  );
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost";
  size?: "sm" | "md";
  loading?: boolean;
  icon?: ReactNode;
};

export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  disabled,
  type = "button",
  icon,
  children,
  className = "",
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={`ui-button ui-button--${variant} ui-button--${size} ${className}`}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? <span className="ui-spinner" aria-hidden="true" /> : icon}
      {children}
    </button>
  );
}
