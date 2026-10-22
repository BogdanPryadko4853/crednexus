import "./Skeleton.css";
export function Skeleton({
  width = "full",
  height = "text",
}: {
  width?: "full" | "half" | "short";
  height?: "text" | "heading" | "control";
}) {
  return (
    <span
      className={`ui-skeleton ui-skeleton--width-${width} ui-skeleton--height-${height}`}
      aria-hidden="true"
    />
  );
}
