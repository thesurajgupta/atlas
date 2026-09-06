"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { SYNTHETIC_TRAIL_PATHS } from "@/lib/graph/synthetic-trail";
import { SYNTHETIC_CASE } from "@/lib/graph/synthetic-case";
import type { TrailHop } from "@/lib/graph/types";
import { PageHeader } from "@/components/nav/PageHeader";
import { Card, MockNotice, RiskChip } from "@/components/ui/Card";

/**
 * Account relationships (spec §14) — who is connected to whom, and how much moved.
 *
 * Drawn as a layered diagram rather than a force-directed cloud. Money has a
 * direction and a depth, and a physics simulation throws both away: the same
 * network re-renders differently every visit, which makes it impossible to say
 * "the account on the left" to a colleague. Depth here is hops from the victim,
 * which is the number an investigator already reasons in.
 *
 * The full interactive canvas is `/money-trail` — this view answers a different
 * question. That page asks *where did the money go*; this one asks *who is
 * reused*, which is what makes an account a mule rather than a one-off.
 */

interface Node {
  id: string;
  depth: number;
  inbound: number;
  outbound: number;
  total: number;
}

function rupees(n: number): string {
  return `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

/** Reuse is the signal. An account seen once is a hop; seen repeatedly it is infrastructure. */
function riskOf(node: Node): "HIGH" | "MEDIUM" | "LOW" {
  const degree = node.inbound + node.outbound;
  if (degree >= 4) return "HIGH";
  if (degree >= 2) return "MEDIUM";
  return "LOW";
}

export default function NetworkGraphPage() {
  const [selected, setSelected] = useState<string | null>(null);

  const { nodes, hops, byDepth } = useMemo(() => {
    const allHops: TrailHop[] = SYNTHETIC_TRAIL_PATHS.flatMap((p) => [...p.hops]);
    const map = new Map<string, Node>();

    const ensure = (id: string, depth: number) => {
      const existing = map.get(id);
      if (existing) {
        existing.depth = Math.min(existing.depth, depth);
        return existing;
      }
      const node: Node = { id, depth, inbound: 0, outbound: 0, total: 0 };
      map.set(id, node);
      return node;
    };

    for (const path of SYNTHETIC_TRAIL_PATHS) {
      path.hops.forEach((hop, i) => {
        const from = ensure(hop.from_entity_id, i);
        const to = ensure(hop.to_entity_id, i + 1);
        from.outbound += 1;
        to.inbound += 1;
        to.total += Number(hop.amount);
      });
    }

    const grouped = new Map<number, Node[]>();
    for (const node of map.values()) {
      const list = grouped.get(node.depth) ?? [];
      list.push(node);
      grouped.set(node.depth, list);
    }

    return {
      nodes: [...map.values()],
      hops: allHops,
      byDepth: [...grouped.entries()].sort((a, b) => a[0] - b[0]),
    };
  }, []);

  const focus = nodes.find((n) => n.id === selected);
  const focusHops = focus
    ? hops.filter(
        (h) => h.from_entity_id === focus.id || h.to_entity_id === focus.id,
      )
    : [];

  return (
    <>
      <PageHeader
        title="Network graph"
        subtitle={`${SYNTHETIC_CASE.caseId} · ${nodes.length} accounts, ${hops.length} transfers`}
        searchPlaceholder="Search accounts…"
        actions={
          <Link
            href="/money-trail"
            className="inline-flex items-center gap-1.5 rounded-md border border-line bg-raised px-2.5 py-1.5 text-[12px] text-ink-700 transition-colors hover:text-ink-900"
          >
            Open the interactive trail
            <ExternalLink className="h-3 w-3" aria-hidden />
          </Link>
        }
      />

      <div className="px-6 py-5">
        <div className="mb-4">
          <MockNotice>
            Mock trail for interface development — the same fixture the transaction
            trail and investigation pages read, so the accounts match across all three.
          </MockNotice>
        </div>

        <div className="grid gap-4 xl:grid-cols-[1fr_19rem]">
          <Card title="Accounts by depth from the victim" bodyClassName="overflow-x-auto p-4">
            <div className="flex min-w-max items-start gap-6">
              {byDepth.map(([depth, group]) => (
                <div key={depth} className="min-w-[9rem]">
                  <p className="mb-2 text-[10px] uppercase tracking-wider text-ink-500">
                    {depth === 0 ? "Victim" : `Hop ${depth}`}
                  </p>
                  <ul className="space-y-2">
                    {group.map((node) => {
                      const risk = riskOf(node);
                      const active = node.id === selected;
                      return (
                        <li key={node.id}>
                          <button
                            type="button"
                            onClick={() => setSelected(active ? null : node.id)}
                            aria-pressed={active}
                            className={`w-full rounded-md border px-2.5 py-2 text-left transition-colors ${
                              active
                                ? "border-accent bg-accent/10"
                                : "border-line bg-raised hover:border-line-strong"
                            }`}
                          >
                            <span className="block truncate font-mono text-[11px] text-ink-900">
                              {node.id}
                            </span>
                            <span className="mt-1 flex items-center justify-between gap-2">
                              <RiskChip level={risk} />
                              <span className="text-[10px] tabular-nums text-ink-500">
                                {node.inbound + node.outbound} links
                              </span>
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>
            <p className="mt-4 border-t border-line pt-3 text-[11px] text-ink-500">
              Risk here is <strong className="text-ink-700">reuse</strong>, not a model
              score: an account seen once is a hop, an account seen repeatedly is
              infrastructure. Entity risk proper is computed server-side with decay and
              a fairness gate.
            </p>
          </Card>

          <Card title={focus ? "Selected account" : "Select an account"}>
            {!focus && (
              <p className="text-[12px] text-ink-500">
                Pick a node to see every transfer it touches, in the order the money
                moved.
              </p>
            )}
            {focus && (
              <>
                <p className="font-mono text-[12px] text-ink-900">{focus.id}</p>
                <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-[11px]">
                  <div>
                    <dt className="text-ink-500">Depth</dt>
                    <dd className="text-ink-900 tabular-nums">{focus.depth}</dd>
                  </div>
                  <div>
                    <dt className="text-ink-500">Links</dt>
                    <dd className="text-ink-900 tabular-nums">
                      {focus.inbound} in · {focus.outbound} out
                    </dd>
                  </div>
                  <div className="col-span-2">
                    <dt className="text-ink-500">Received</dt>
                    <dd className="text-ink-900 tabular-nums">{rupees(focus.total)}</dd>
                  </div>
                </dl>

                <ul className="mt-3 space-y-2 border-t border-line pt-3">
                  {focusHops.map((h) => (
                    <li key={h.edge_id} className="text-[11px]">
                      <span className="block font-mono text-ink-700">
                        {h.from_entity_id} → {h.to_entity_id}
                      </span>
                      <span className="mt-0.5 block text-ink-500 tabular-nums">
                        {rupees(Number(h.amount))} ·{" "}
                        {new Date(h.occurred_at).toLocaleString("en-IN", {
                          dateStyle: "short",
                          timeStyle: "short",
                        })}
                        {h.channel ? ` · ${h.channel.replace(/_/g, " ")}` : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
