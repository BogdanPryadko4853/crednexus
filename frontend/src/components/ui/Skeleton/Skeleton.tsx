import type { CSSProperties } from "react";
import "./Skeleton.css";
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
