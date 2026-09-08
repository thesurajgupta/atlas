import { notFound } from "next/navigation";
import { getCaseById, MOCK_CASES } from "@/lib/mock-data";
import { WorkItemShell } from "@/components/work-item/WorkItemShell";

export function generateStaticParams() {
  return MOCK_CASES.map((c) => ({ id: c.case_id }));
}

// Next 15+ passes `params` as a Promise, so it has to be awaited. Written
// against Next 14, where it was a plain object; the upgrade to 16 (done to
// clear CVE-2025-29927) changed the contract, and neither `tsc` nor
// `next build` caught it — the route just 404s at runtime.
export default async function CaseDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const item = getCaseById(id);
  if (!item) notFound();

  return <WorkItemShell item={item} />;
}
