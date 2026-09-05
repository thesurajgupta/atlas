import type { EvidenceSufficiency } from "@/lib/types";
import { EVIDENCE_BAND_COPY } from "@/lib/evidence-copy";

const DOT_COLOR: Record<EvidenceSufficiency, string> = {
  STRONG: "bg-evidence-strong",
  MODERATE: "bg-evidence-moderate",
  WEAK: "bg-evidence-weak",
  INSUFFICIENT: "bg-evidence-insufficient",
};

export function EvidenceBadge({ band }: { band: EvidenceSufficiency }) {
  return (
    <span
      data-evidence-band={band}
      className="inline-flex items-center gap-1.5 rounded-sm border border-line px-1.5 py-0.5 text-xs text-ink-700"
    >
      <span className={`h-1.5 w-1.5 rounded-full ${DOT_COLOR[band]}`} aria-hidden />
      {EVIDENCE_BAND_COPY[band]}
    </span>
  );
}
