import type { HTMLAttributes } from "react";

type HeadingProps = HTMLAttributes<HTMLHeadingElement> & {
  level?: 1 | 2 | 3 | 4 | 5 | 6;
  size?: "xl" | "lg" | "sm";
};

export function Heading({
  level = 2,
  size = "lg",
  className = "",
  ...props
}: HeadingProps) {
  const Tag = `h${level}` as "h1" | "h2" | "h3" | "h4" | "h5" | "h6";
  return (
    <Tag className={`ui-heading ui-heading--${size} ${className}`} {...props} />
  );
}

type TextProps = HTMLAttributes<HTMLElement> & {
  as?: "p" | "span";
  size?: "sm" | "base" | "lg";
  muted?: boolean;
};

export function Text({
  as: Tag = "p",
  size = "base",
  muted = false,
  className = "",
  ...props
}: TextProps) {
  return (
    <Tag
      className={`ui-text ui-text--${size} ${muted ? "ui-text--muted" : ""} ${className}`}
      {...props}
    />
  );
}
