import { CaseDetail } from "@/components/work-item/CaseDetail";

/**
 * One case, by public reference.
 *
 * `generateStaticParams` is gone with the fixture-only version of this route.
 * The case a demo opens is minted in the browser at submission time, so its
 * reference cannot be known at build time, and pre-rendering a list of fixture
 * ids while the real target 404s is worse than not pre-rendering at all.
 *
 * Next passes `params` as a Promise, so it has to be awaited. This route was
 * written against Next 14, where it was a plain object; the upgrade to 16 (done
 * to clear CVE-2025-29927) changed the contract, and neither `tsc` nor
 * `next build` caught it — the route just 404d at runtime.
 */
export default async function CaseDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <CaseDetail caseId={decodeURIComponent(id)} />;
}
