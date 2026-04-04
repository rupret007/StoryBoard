import type { ReactNode } from "react";

type CommandCenterCardProps = {
  title: string;
  description: string;
  footer?: ReactNode;
};

export function CommandCenterCard({
  title,
  description,
  footer
}: CommandCenterCardProps) {
  return (
    <section className="rounded-[var(--radius-xl)] border border-[var(--border-strong)] bg-[var(--surface-1)] p-6 shadow-[var(--shadow-md)]">
      <div className="inline-flex rounded-full border border-cyan-500/25 bg-[var(--accent-muted)] px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--accent)]">
        Structured actions
      </div>
      <h2 className="mt-4 text-2xl font-semibold text-[var(--text-primary)]">
        {title}
      </h2>
      <p className="mt-3 max-w-3xl text-sm leading-relaxed text-[var(--text-secondary)]">
        {description}
      </p>
      <div className="mt-6 grid gap-3 md:grid-cols-4">
        {["Intent resolution", "Dry run", "Approval gate", "Audit trail"].map(
          (step) => (
            <div
              key={step}
              className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-4 py-3 text-sm text-[var(--text-secondary)]"
            >
              {step}
            </div>
          )
        )}
      </div>
      {footer ? <div className="mt-4">{footer}</div> : null}
    </section>
  );
}
