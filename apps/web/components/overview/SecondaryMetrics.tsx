function MetricTile({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "neutral" | "warn";
}) {
  return (
    <div className="rounded-sm border border-line bg-surface px-3 py-2.5">
      <div className="text-lg font-semibold leading-tight text-ink-900">
        {value}
      </div>
      <div
        className={
          "mt-0.5 text-xs " +
          (tone === "warn" ? "text-severity-medium" : "text-ink-500")
        }
      >
        {label}
      </div>
    </div>
  );
}

/**
 * §25.1: everything below the funnel — "amount at risk · median lead time ·
 * cases inside golden hour · predicted hotspots · pending grouping
 * proposals · open high-severity alerts · recent interventions · model
 * health · data freshness." Deliberately below the funnel, not beside it —
 * the funnel is the headline, this is supporting detail.
 */
export function SecondaryMetrics() {
  return (
    <section
      aria-label="Operational detail"
      className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5"
    >
      <MetricTile label="Amount at risk" value="₹42.6 L" />
      <MetricTile label="Median lead time" value="3h 12m" />
      <MetricTile label="Cases inside golden hour" value="6" tone="warn" />
      <MetricTile label="Predicted hotspots" value="19 cells" />
      <MetricTile label="Pending groupings" value="3" />
      <MetricTile label="Open high-severity alerts" value="11" tone="warn" />
      <MetricTile label="Recent interventions" value="8" />
      <MetricTile label="Model health" value="Nominal" />
      <MetricTile label="Data freshness" value="2 min ago" />
    </section>
  );
}
