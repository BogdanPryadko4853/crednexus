import type { HTMLAttributes, ReactNode } from "react";

type CardProps = HTMLAttributes<HTMLDivElement> & {
  title?: string;
  subtitle?: string;
  action?: ReactNode;
  footer?: ReactNode;
};

export function Card({
  title,
  subtitle,
  action,
  footer,
  children,
  className = "",
  ...props
}: CardProps) {
  return (
    <div className={`ui-card ${className}`} {...props}>
      {(title || subtitle || action) && (
        <div className="ui-card__header">
          <div>
            {title && <h3 className="ui-card__title">{title}</h3>}
            {subtitle && <p className="ui-card__subtitle">{subtitle}</p>}
          </div>
          {action}
        </div>
      )}
      {children}
      {footer && <div className="ui-card__footer">{footer}</div>}
    </div>
  );
}
