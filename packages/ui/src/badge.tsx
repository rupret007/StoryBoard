import type { ReactNode } from "react";

type Variant = "neutral" | "accent" | "warning" | "success" | "danger" | "violet";

const variants: Record<Variant, string> = {
  neutral:
    "border-[var(--border-strong)] bg-[var(--surface-2)] text-[var(--text-secondary)]",
  accent:
    "border-cyan-500/25 bg-[var(--accent-muted)] text-[var(--accent)]",
  warning: "border-amber-500/30 bg-amber-500/10 text-amber-200",
  success: "border-emerald-500/25 bg-emerald-500/10 text-emerald-300",
  danger: "border-red-500/25 bg-red-500/10 text-red-300",
  violet:
    "border-violet-500/30 bg-[var(--secondary-muted)] text-violet-200"
};

export function Badge({
  children,
  variant = "neutral",
  className = ""
}: {
  children: ReactNode;
  variant?: Variant;
  className?: string;
}) {
  return (
    <span
      className={[
        "inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-semibold tabular-nums",
        variants[variant],
        className
      ].join(" ")}
    >
      {children}
    </span>
  );
}
