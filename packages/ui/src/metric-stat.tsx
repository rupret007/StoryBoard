import type { ReactNode } from "react";

export function MetricStat({
  label,
  value,
  href,
  children
}: {
  label: string;
  value: ReactNode;
  href?: string;
  children?: ReactNode;
}) {
  const inner = (
    <>
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">
        {label}
      </p>
      <p className="mt-2 text-3xl font-semibold tabular-nums tracking-tight text-[var(--text-primary)]">
        {value}
      </p>
      {children}
    </>
  );

  const className =
    "group block rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--surface-1)] p-5 shadow-[var(--shadow-sm)] transition-all hover:border-[var(--border-strong)] hover:bg-[var(--surface-2)] hover:shadow-[var(--shadow-md)]";

  if (href) {
    return (
      <a href={href} className={className}>
        {inner}
      </a>
    );
  }

  return <div className={className}>{inner}</div>;
}
