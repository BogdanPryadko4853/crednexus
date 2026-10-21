import type { SVGProps } from "react";

const paths = {
  arrow: "M4 12h16M14 6l6 6-6 6",
  check: "m5 12 4 4L19 6",
  close: "m6 6 12 12M6 18 18 6",
  info: "M12 11v6M12 7v.01M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0",
  clock: "M12 6v6l4 2M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0",
  company:
    "M4 21V5h10v16M14 9h6v12M2 21h20M8 9h2M8 13h2M8 17h2M17 13h1M17 17h1",
  shield: "M12 3 3 7v5c0 5 9 9 9 9s9-4 9-9V7l-9-4Zm-4 9 3 3 5-6",
  file: "M14 3H5v18h14V8l-5-5Zm0 0v5h5M8 12h8M8 16h5",
  plus: "M12 5v14M5 12h14",
  chevron: "m9 5 7 7-7 7",
  warning: "M12 3 2 21h20L12 3Zm0 6v5m0 3v.01",
} as const;

export type IconName = keyof typeof paths;

export function Icon({
  name,
  size = 20,
  ...props
}: SVGProps<SVGSVGElement> & { name: IconName; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      <path d={paths[name]} />
    </svg>
  );
}
