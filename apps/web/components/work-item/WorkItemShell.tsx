import type { Case } from "@/lib/types";
import { FactStrip } from "./FactStrip";
import { WorkItemTabs } from "./WorkItemTabs";
import { PredictionAndWhy } from "@/components/prediction/PredictionAndWhy";

export function WorkItemShell({ item }: { item: Case }) {
  return (
    <div>
      <FactStrip fact={item.fact_strip} />
      <WorkItemTabs>
        {{
          Summary: (
            <p className="text-sm text-ink-700">
              Case {item.case_id} — status {item.status.replace(/_/g, " ")}.
            </p>
          ),
          "Prediction & Why": (
            <PredictionAndWhy prediction={item.prediction} />
          ),
          Audit: (
            <p className="text-sm text-ink-500">
              Audit trail stub — every sensitive operation on this case will
              list here (spec §32), append-only, hash-chained.
            </p>
          ),
        }}
      </WorkItemTabs>
    </div>
  );
}
