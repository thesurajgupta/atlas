import { Funnel } from "@/components/overview/Funnel";
import { SecondaryMetrics } from "@/components/overview/SecondaryMetrics";
import { MOCK_FUNNEL } from "@/lib/mock-data";

export default function OverviewPage() {
  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <h1 className="mb-1 text-lg font-semibold text-ink-900">
        Command overview
      </h1>
      <p className="mb-6 text-sm text-ink-500">
        Mock data — synthetic only, for interface development (spec §5).
      </p>

      <Funnel counts={MOCK_FUNNEL} />

      <div className="mt-8">
        <SecondaryMetrics />
      </div>
    </div>
  );
}
