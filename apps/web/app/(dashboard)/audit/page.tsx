"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ApiError,
  auth,
  listAuditEvents,
  type ApiAuditEvent,
  type ChainStatus,
} from "@/lib/api";

/**
 * Audit log (spec §32, §25.2) — live from `GET /api/v1/audit`.
 *
 * Three things this page must not do, each of which would quietly defeat it:
 *
 * **Denials are not a filter nobody selects.** The log exists so a
 * cross-jurisdiction access attempt is findable; a table that shows successes
 * by default and hides refusals behind a control is a table that reports the
 * system working. Denied rows are marked, counted in the header, and reachable
 * in one click.
 *
 * **The chain state travels with the data**, not on a separate screen. A log
 * read without its integrity status is one the reader trusts without checking,
 * and the checking is the entire reason the chain exists.
 *
 * **A broken chain says which failure it is.** A modified event, a broken link
 * and a deleted event are different problems — one is a process failure, one is
 * an attack — and the reader should not have to guess.
 */

function ChainBanner({ chain }: { chain: ChainStatus }) {
  if (chain.verified) {
    return (
      <div className="flex items-center gap-2 rounded-sm border border-evidence-strong/30 bg-evidence-strong/5 px-3 py-2">
        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-evidence-strong" aria-hidden />
        <p className="text-[13px] text-ink-700">
          Hash chain verifies over all{" "}
          <span className="tabular-nums">{chain.events.toLocaleString()}</span> events.
          Every event binds to its predecessor and no sequence number is missing.
        </p>
      </div>
    );
  }
  return (
    <div
      role="alert"
      className="rounded-sm border border-severity-critical/40 bg-severity-critical/5 px-3 py-2.5"
    >
      <p className="text-[13px] font-medium text-severity-critical">
        Chain integrity check failed at sequence {chain.first_bad_sequence}.
      </p>
      <p className="mt-0.5 text-[12px] text-ink-700">
        {chain.reason}. The log below cannot be relied on from that point forward.
      </p>
    </div>
  );
}

export default function AuditPage() {
  const router = useRouter();
  const [filter, setFilter] = useState<"all" | "denied">("all");
  // The loaded page carries the filter it was loaded for, so "still loading"
  // is derived rather than set. Clearing the rows synchronously when the filter
  // changes would be a setState in the effect body and a cascading render.
  const [loaded, setLoaded] = useState<{
    filter: "all" | "denied";
    events: ApiAuditEvent[];
    chain: ChainStatus;
    total: number;
  } | null>(null);
  // Fetched separately because the list response no longer carries a denial
  // count. Kept as its own number so the tab can show it while the "all" view
  // is open — a denial count you only see after switching to the denied tab is
  // one nobody switches to.
  const [deniedTotal, setDeniedTotal] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);

  const current = loaded?.filter === filter ? loaded : null;
  const events = current?.events ?? null;
  const chain = current?.chain ?? null;
  const counts = { total: current?.total ?? 0, denied: deniedTotal ?? 0 };

  useEffect(() => {
    if (!auth.isSignedIn()) {
      router.replace("/login");
      return;
    }
    if (deniedTotal === null) {
      // Count only — the rows come from whichever filter is selected.
      listAuditEvents("denied")
        .then((r) => setDeniedTotal(r.total))
        .catch(() => setDeniedTotal(0));
    }

    listAuditEvents(filter === "denied" ? "denied" : undefined)
      .then((r) => {
        setLoaded({ filter, events: r.items, chain: r.chain, total: r.total });
        setForbidden(false);
        if (filter === "denied") setDeniedTotal(r.total);
      })
      .catch((err: unknown) => {
        if (err instanceof ApiError && err.status === 401) {
          auth.clear();
          router.replace("/login");
          return;
        }
        // 403, not 404. The 404-not-403 rule is about *which record* a caller
        // may see; the audit endpoint's existence is published in the OpenAPI
        // schema, so refusing with 404 would tell an auditor whose role is
        // misconfigured that the API is missing rather than that their
        // permissions are wrong (atlas/core/errors.py::ForbiddenError).
        if (err instanceof ApiError && err.status === 403) {
          setForbidden(true);
          return;
        }
        setError(err instanceof ApiError ? err.message : "Could not load the audit log.");
      });
  }, [router, filter, deniedTotal]);

  if (forbidden) {
    return (
      <div className="mx-auto max-w-4xl px-6 py-8">
        <h1 className="mb-2 text-lg font-semibold text-ink-900">Audit</h1>
        <div className="rounded-sm border border-line bg-surface px-4 py-8 text-center">
          <p className="text-sm text-ink-700">
            Your role does not hold <code className="font-mono">audit:read</code>.
          </p>
          <p className="mt-1 text-[12px] text-ink-500">
            The permission belongs to AUDITOR and SUPER_ADMIN only. Sign in as{" "}
            <code className="font-mono">demo.auditor</code> to read the log.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <header className="mb-4">
        <h1 className="text-lg font-semibold text-ink-900">Audit</h1>
        <p className="mt-0.5 text-sm text-ink-500">
          Every action, allowed and denied, hash-chained and tamper-evident. Live from the API.
        </p>
      </header>

      {chain && (
        <div className="mb-4">
          <ChainBanner chain={chain} />
        </div>
      )}

      {error && (
        <p
          role="alert"
          className="rounded-sm border border-severity-high/30 bg-severity-high/5 px-3 py-2.5 text-[13px] text-severity-high"
        >
          {error}
        </p>
      )}

      <div className="mb-3 flex items-center gap-1">
        <button
          type="button"
          onClick={() => setFilter("all")}
          aria-pressed={filter === "all"}
          className={`rounded-sm border px-2 py-1 text-[11px] uppercase tracking-wider transition-colors ${
            filter === "all"
              ? "border-ink-900 text-ink-900"
              : "border-line text-ink-500 hover:text-ink-700"
          }`}
        >
          all {counts.total > 0 && filter === "all" ? `· ${counts.total}` : ""}
        </button>
        <button
          type="button"
          onClick={() => setFilter("denied")}
          aria-pressed={filter === "denied"}
          className={`rounded-sm border px-2 py-1 text-[11px] uppercase tracking-wider transition-colors ${
            filter === "denied"
              ? "border-severity-high text-severity-high"
              : "border-line text-ink-500 hover:text-ink-700"
          }`}
        >
          denied {counts.denied > 0 ? `· ${counts.denied}` : ""}
        </button>
        <span className="ml-2 text-[11px] text-ink-500">
          Denials are the interesting rows.
        </span>
      </div>

      {!error && events === null && (
        <p className="py-10 text-center text-sm text-ink-500">Loading events…</p>
      )}

      {events !== null && events.length === 0 && (
        <div className="rounded-sm border border-line bg-surface px-4 py-8 text-center">
          <p className="text-sm text-ink-700">
            {filter === "denied"
              ? "No denied events in your scope."
              : "No audit events in your scope."}
          </p>
        </div>
      )}

      {events !== null && events.length > 0 && (
        <div className="overflow-x-auto rounded-sm border border-line bg-surface">
          <table className="w-full min-w-[52rem] text-left text-[12px]">
            <thead className="border-b border-line text-[11px] uppercase tracking-wider text-ink-500">
              <tr>
                <th scope="col" className="px-3 py-2 font-medium">Seq</th>
                <th scope="col" className="px-3 py-2 font-medium">Time</th>
                <th scope="col" className="px-3 py-2 font-medium">Actor</th>
                <th scope="col" className="px-3 py-2 font-medium">Action</th>
                <th scope="col" className="px-3 py-2 font-medium">Resource</th>
                <th scope="col" className="px-3 py-2 font-medium">Result</th>
                <th scope="col" className="px-3 py-2 font-medium">Correlation</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {events.map((e) => (
                <tr
                  key={e.id}
                  className={e.result === "denied" ? "bg-severity-high/5" : undefined}
                >
                  <td className="px-3 py-2 font-mono tabular-nums text-ink-500">{e.sequence}</td>
                  <td className="whitespace-nowrap px-3 py-2 tabular-nums text-ink-700">
                    {new Date(e.occurred_at).toLocaleString("en-IN", {
                      dateStyle: "short",
                      timeStyle: "medium",
                    })}
                  </td>
                  <td className="px-3 py-2 text-ink-700">
                    {e.actor_role?.replace(/_/g, " ").toLowerCase() ?? "system"}
                  </td>
                  <td className="px-3 py-2 font-mono text-ink-900">{e.action}</td>
                  <td className="max-w-[14rem] truncate px-3 py-2 font-mono text-ink-500">
                    {e.resource_type}
                    {e.resource_id ? `/${e.resource_id}` : ""}
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={
                        e.result === "denied"
                          ? "font-medium text-severity-high"
                          : "text-ink-500"
                      }
                    >
                      {e.result}
                    </span>
                  </td>
                  <td className="px-3 py-2 font-mono text-ink-300">
                    {e.correlation_id.slice(0, 8)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
