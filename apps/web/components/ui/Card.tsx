/**
 * The containers every page uses, defined once.
 *
 * They exist because "same edges, same padding, same label size" is most of what
 * visual consistency across fourteen pages means, and it erodes the moment each
 * page writes its own border and radius. Nothing here is decorative: a `Card` is
 * a bordered surface, a `StatTile` is a figure with a label, and neither adds a
 * shadow or a gradient.
 */

export function Card({
  title,
  action,
  children,
  className = "",
  bodyClassName = "",
}: {
  title?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section
      className={`overflow-hidden rounded-lg border border-line bg-surface ${className}`}
    >
      {(title || action) && (
        <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-2.5">
          {title && (
            <h2 className="text-[12px] font-medium uppercase tracking-wider text-ink-500">
              {title}
            </h2>
          )}
          {action}
        </div>
      )}
      <div className={bodyClassName || "p-4"}>{children}</div>
    </section>
  );
}

export function StatTile({
  value,
  label,
  tone = "neutral",
  hint,
  icon,
}: {
  value: string | number;
  label: string;
  /** Semantic only. `critical` is for a figure that means somebody must act. */
  tone?: "neutral" | "critical" | "warning" | "good";
  hint?: string;
  icon?: React.ReactNode;
}) {
  const toneClass = {
    neutral: "text-ink-900",
    critical: "text-severity-high",
    warning: "text-severity-medium",
    good: "text-evidence-strong",
  }[tone];

  return (
    <div className="rounded-lg border border-line bg-surface p-3.5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className={`text-[22px] font-semibold leading-none tabular-nums ${toneClass}`}>
            {value}
          </p>
          <p className="mt-1.5 truncate text-[11px] text-ink-500">{label}</p>
          {hint && <p className="mt-0.5 truncate text-[10px] text-ink-300">{hint}</p>}
        </div>
        {icon && <span className="shrink-0 text-ink-300">{icon}</span>}
      </div>
    </div>
  );
}

/** Risk and severity, rendered the same way everywhere. */
export function RiskChip({ level }: { level: string }) {
  const style =
    {
      CRITICAL: "border-severity-critical/50 bg-severity-critical/10 text-severity-critical",
      HIGH: "border-severity-high/40 bg-severity-high/10 text-severity-high",
      MEDIUM: "border-severity-medium/40 bg-severity-medium/10 text-severity-medium",
      LOW: "border-line bg-raised text-ink-500",
    }[level.toUpperCase()] ?? "border-line bg-raised text-ink-500";

  return (
    <span
      className={`inline-flex shrink-0 items-center rounded border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider ${style}`}
    >
      {level.toLowerCase()}
    </span>
  );
}

/**
 * The label that must appear on any page showing figures a model did not
 * produce. One component so the wording cannot drift between pages, and so
 * "which pages are still mock?" is answerable with a grep.
 */
export function MockNotice({ children }: { children?: React.ReactNode }) {
  return (
    <p className="rounded-md border border-line bg-surface px-3 py-2 text-[11px] italic text-ink-500">
      {children ?? (
        <>
          Mock figures for interface development. Live values come only from a validated,
          calibrated model run.
        </>
      )}
    </p>
  );
}
