import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

/**
 * Model performance (spec §21) — read from the newest `reports/eval/*.json`.
 *
 * Every number on this page comes from `make eval`, stamped with a git SHA.
 * Nothing is computed here; a page that could compute a metric is a page that
 * can report one nobody can reproduce.
 *
 * The ordering is the point. **Status first, headline uplift second, raw
 * numbers third.** `make eval` currently returns `DATASET_HAS_NO_SIGNAL`, and a
 * page that shows PAI 1.17 above that banner is showing a defensible-looking
 * number about the wrong thing. Raw accuracy is never the headline — a ranker
 * that flags a quarter of the map and catches a quarter of the cash-outs scores
 * PAI 1.0 and has learned nothing.
 */

// The report is read at request time, not baked in at build. A metrics page
// pinned to whatever existed during `next build` is worse than no page.
export const dynamic = "force-dynamic";

interface ByK {
  k: number;
  recall_at_k: number;
  pai: number;
  area_flagged_fraction: number;
}

interface Uplift {
  k: number;
  recall_delta: number;
  pai_delta: number;
  beats_baseline: boolean;
}

interface EvalReport {
  provenance: {
    git_sha: string;
    git_branch: string;
    working_tree_dirty: boolean;
    generated_at: string;
    dataset_version: string;
  };
  status: string;
  dataset: Record<string, number>;
  baseline: { ranker: string; cases_scored: number; by_k: ByK[] };
  model: { ranker: string; cases_scored: number; by_k: ByK[] };
  uplift_over_baseline: Uplift[];
  not_computed: Record<string, string>;
  caveats: string[];
}

const REPORTS = path.join(process.cwd(), "..", "..", "reports", "eval");

async function newestReport(): Promise<EvalReport | null> {
  try {
    const files = (await readdir(REPORTS)).filter((f) => f.endsWith(".json")).sort();
    const latest = files.at(-1);
    if (!latest) return null;
    return JSON.parse(await readFile(path.join(REPORTS, latest), "utf8")) as EvalReport;
  } catch {
    return null;
  }
}

const pct = (v: number) => `${(v * 100).toFixed(1)}%`;
const signed = (v: number) => `${v >= 0 ? "+" : ""}${v.toFixed(2)}`;

function StatusBanner({ status }: { status: string }) {
  if (status === "OK") {
    return (
      <div className="flex items-center gap-2 rounded-sm border border-evidence-strong/30 bg-evidence-strong/5 px-3 py-2">
        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-evidence-strong" aria-hidden />
        <p className="text-[13px] text-ink-700">
          Evaluation completed on a dataset that carries signal.
        </p>
      </div>
    );
  }
  const copy: Record<string, string> = {
    DATASET_HAS_NO_SIGNAL:
      "Cash-out location in this dataset is independent of the money trail (issue #50). Every figure below is the arithmetic of random labels — they measure the generator, not the approach. No conclusion about the model can be drawn from them.",
    NO_DATA: "No scenarios were available to score.",
  };
  return (
    <div
      role="alert"
      className="rounded-sm border border-severity-critical/40 bg-severity-critical/5 px-3 py-2.5"
    >
      <p className="font-mono text-[12px] font-medium uppercase tracking-wider text-severity-critical">
        {status}
      </p>
      <p className="mt-1 text-[13px] text-ink-700">{copy[status] ?? "Evaluation did not complete normally."}</p>
    </div>
  );
}

export default async function ModelsPage() {
  const report = await newestReport();

  if (!report) {
    return (
      <div className="mx-auto max-w-4xl px-6 py-8">
        <h1 className="mb-2 text-lg font-semibold text-ink-900">Models</h1>
        <div className="rounded-sm border border-line bg-surface px-4 py-8 text-center">
          <p className="text-sm text-ink-700">No evaluation report found.</p>
          <p className="mt-1 text-[12px] text-ink-500">
            Run <code className="font-mono">make eval</code> to generate one. Numbers only ever
            come from there.
          </p>
        </div>
      </div>
    );
  }

  const { provenance: p } = report;

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <header className="mb-4">
        <h1 className="text-lg font-semibold text-ink-900">Models</h1>
        <p className="mt-0.5 text-sm text-ink-500">
          From the newest <code className="font-mono">make eval</code> run. Nothing on this page
          is computed in the browser.
        </p>
      </header>

      <div className="mb-5">
        <StatusBanner status={report.status} />
      </div>

      {/* Uplift is the headline, not raw accuracy: a ranker that flags a
          quarter of the map and catches a quarter of the cash-outs scores
          PAI 1.0 and has learned nothing. */}
      <section className="mb-6">
        <h2 className="mb-2 text-[11px] uppercase tracking-wider text-ink-500">
          Uplift over baseline
        </h2>
        <div className="overflow-x-auto rounded-sm border border-line bg-surface">
          <table className="w-full min-w-[34rem] text-left text-[13px]">
            <thead className="border-b border-line text-[11px] uppercase tracking-wider text-ink-500">
              <tr>
                <th scope="col" className="px-3 py-2 font-medium">K</th>
                <th scope="col" className="px-3 py-2 font-medium">Δ PAI</th>
                <th scope="col" className="px-3 py-2 font-medium">Δ Recall</th>
                <th scope="col" className="px-3 py-2 font-medium">Beats baseline</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {report.uplift_over_baseline.map((u) => (
                <tr key={u.k}>
                  <td className="px-3 py-2 tabular-nums text-ink-700">{u.k}</td>
                  <td className="px-3 py-2 tabular-nums text-ink-900">{signed(u.pai_delta)}</td>
                  <td className="px-3 py-2 tabular-nums text-ink-900">
                    {signed(u.recall_delta * 100)}%
                  </td>
                  <td className="px-3 py-2 text-ink-500">{u.beats_baseline ? "yes" : "no"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mb-6 grid gap-4 md:grid-cols-2">
        {([report.baseline, report.model] as const).map((m, i) => (
          <div key={m.ranker} className="rounded-sm border border-line bg-surface">
            <div className="border-b border-line px-3 py-2">
              <p className="text-[11px] uppercase tracking-wider text-ink-500">
                {i === 0 ? "Baseline" : "Model"}
              </p>
              <p className="text-[13px] text-ink-900">{m.ranker}</p>
              <p className="mt-0.5 text-[11px] text-ink-500 tabular-nums">
                {m.cases_scored} cases scored
              </p>
            </div>
            <table className="w-full text-left text-[13px]">
              <thead className="border-b border-line text-[11px] uppercase tracking-wider text-ink-500">
                <tr>
                  <th scope="col" className="px-3 py-1.5 font-medium">K</th>
                  <th scope="col" className="px-3 py-1.5 font-medium">Recall@K</th>
                  <th scope="col" className="px-3 py-1.5 font-medium">PAI</th>
                  <th scope="col" className="px-3 py-1.5 font-medium">Area</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {m.by_k.map((r) => (
                  <tr key={r.k}>
                    <td className="px-3 py-1.5 tabular-nums text-ink-700">{r.k}</td>
                    <td className="px-3 py-1.5 tabular-nums text-ink-900">{pct(r.recall_at_k)}</td>
                    <td className="px-3 py-1.5 tabular-nums text-ink-900">{r.pai.toFixed(2)}</td>
                    <td className="px-3 py-1.5 tabular-nums text-ink-500">
                      {pct(r.area_flagged_fraction)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </section>

      {/* What was NOT measured, and why. A metrics page that lists only what it
          could compute reads as a complete evaluation. */}
      <section className="mb-6">
        <h2 className="mb-2 text-[11px] uppercase tracking-wider text-ink-500">Not computed</h2>
        <dl className="divide-y divide-line rounded-sm border border-line bg-surface">
          {Object.entries(report.not_computed).map(([metric, why]) => (
            <div key={metric} className="flex flex-col gap-0.5 px-3 py-2 sm:flex-row sm:gap-3">
              <dt className="shrink-0 font-mono text-[12px] text-ink-900 sm:w-40">{metric}</dt>
              <dd className="text-[12px] text-ink-500">{why}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="mb-6">
        <h2 className="mb-2 text-[11px] uppercase tracking-wider text-ink-500">Caveats</h2>
        <ul className="space-y-1.5 rounded-sm border border-line bg-surface px-4 py-3">
          {report.caveats.map((c) => (
            <li key={c} className="text-[12px] leading-snug text-ink-700">
              — {c}
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="mb-2 text-[11px] uppercase tracking-wider text-ink-500">Provenance</h2>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1 rounded-sm border border-line bg-surface px-4 py-3 text-[12px] sm:grid-cols-3">
          <div>
            <dt className="text-ink-500">git sha</dt>
            <dd className="font-mono text-ink-900">{p.git_sha}</dd>
          </div>
          <div>
            <dt className="text-ink-500">branch</dt>
            <dd className="font-mono text-ink-900">{p.git_branch}</dd>
          </div>
          <div>
            <dt className="text-ink-500">dataset</dt>
            <dd className="font-mono text-ink-900">{p.dataset_version}</dd>
          </div>
          <div>
            <dt className="text-ink-500">generated</dt>
            <dd className="text-ink-900 tabular-nums">
              {new Date(p.generated_at).toLocaleString("en-IN", {
                dateStyle: "short",
                timeStyle: "short",
              })}
            </dd>
          </div>
          <div>
            <dt className="text-ink-500">working tree</dt>
            {/* Dirty means the SHA does not fully describe what ran. Stated,
                not hidden — it is the difference between a reproducible number
                and one that only looks reproducible. */}
            <dd className={p.working_tree_dirty ? "text-severity-medium" : "text-ink-900"}>
              {p.working_tree_dirty ? "dirty — SHA is not the whole story" : "clean"}
            </dd>
          </div>
        </dl>
      </section>
    </div>
  );
}
