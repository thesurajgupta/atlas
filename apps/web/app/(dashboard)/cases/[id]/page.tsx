import { notFound } from "next/navigation";
import { getCaseById, MOCK_CASES } from "@/lib/mock-data";
import { WorkItemShell } from "@/components/work-item/WorkItemShell";

export function generateStaticParams() {
  return MOCK_CASES.map((c) => ({ id: c.case_id }));
}

export default function CaseDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const item = getCaseById(params.id);
  if (!item) notFound();

  return <WorkItemShell item={item} />;
}
