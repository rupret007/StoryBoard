import type { ReactNode } from "react";

type Padding = "none" | "sm" | "md" | "lg";

const paddingClass: Record<Padding, string> = {
  none: "",
  sm: "p-4",
  md: "p-5",
  lg: "p-6"
};

export function SurfaceCard({
  children,
  className = "",
  padding = "md",
  elevated = false
}: {
  children: ReactNode;
  className?: string;
  padding?: Padding;
  elevated?: boolean;
}) {
  return (
    <div
      className={[
        "rounded-[var(--radius-xl)] border",
        elevated
          ? "border-[var(--border-strong)] bg-[var(--surface-2)] shadow-[var(--shadow-md)]"
          : "border-[var(--border)] bg-[var(--surface-1)] shadow-[var(--shadow-sm)]",
        paddingClass[padding],
        className
      ].join(" ")}
    >
      {children}
    </div>
  );
}
