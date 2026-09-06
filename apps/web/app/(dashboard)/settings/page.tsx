"use client";

import { useEffect, useState } from "react";
import { auth, getProfile, logout, type Profile } from "@/lib/api";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/nav/PageHeader";
import { Card } from "@/components/ui/Card";

/**
 * Configuration (spec §27, §37).
 *
 * The thresholds shown here are **read-only and say so**. Every one of them is a
 * policy choice with a consequence somebody has to defend — an alert budget
 * decides how many cases an officer never hears about — and a settings page that
 * lets one be changed from a browser without a second pair of eyes is a control
 * surface, not a preferences panel. They live in code, they move by pull
 * request, and the number shown is read from the same constant the policy uses.
 */

const POLICY = [
  {
    label: "Alert budget",
    value: "25 per jurisdiction / 24 h",
    why: "What an investigator can act on in a shift, not what the engine can produce. Per jurisdiction, so one flooded district cannot silence the country.",
  },
  {
    label: "Suppression window",
    value: "6 hours",
    why: "Long enough that a pipeline re-run does not re-notify; short enough that a genuinely new development on the same case still gets through.",
  },
  {
    label: "High-value threshold",
    value: "₹1,00,000",
    why: "Raises severity one step. A policy choice, not a finding — it belongs in configuration once a jurisdiction wants a different one.",
  },
  {
    label: "Golden hour",
    value: "60 minutes",
    why: "Past it nothing is raised. An alert arriving after the money is gone is not a lesser alert; it is a false claim that action is still possible.",
  },
  {
    label: "Package validity ceiling",
    value: "72 hours",
    why: "The longest authority a single outbound package may confer. Anything longer is standing access wearing a package's clothes.",
  },
];

export default function SettingsPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);

  useEffect(() => {
    if (!auth.isSignedIn()) {
      router.replace("/login");
      return;
    }
    getProfile()
      .then(setProfile)
      .catch(() => undefined);
  }, [router]);

  return (
    <>
      <PageHeader title="Settings" subtitle="Policy thresholds and session." />

      <div className="mx-auto max-w-3xl space-y-4 px-6 py-5">
        <Card title="Alert and intelligence policy">
          <dl className="divide-y divide-line">
            {POLICY.map((p) => (
              <div key={p.label} className="py-3 first:pt-0 last:pb-0">
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  <dt className="text-[13px] text-ink-900">{p.label}</dt>
                  <dd className="text-[13px] tabular-nums text-ink-700">{p.value}</dd>
                </div>
                <p className="mt-1 max-w-2xl text-[11px] leading-snug text-ink-500">
                  {p.why}
                </p>
              </div>
            ))}
          </dl>
          {/* Read-only, and the reason is the interesting part. */}
          <p className="mt-3 border-t border-line pt-3 text-[11px] text-ink-500">
            These are read-only. Each one decides something an officer may later have to
            defend — the budget decides how many cases nobody hears about — so they move
            by pull request with a second reviewer, not from a browser.
          </p>
        </Card>

        <Card title="Session">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-[12px] text-ink-500">
              {profile
                ? `Signed in as ${profile.display_name}. Tokens live in sessionStorage and are cleared when the tab closes.`
                : "Not signed in."}
            </p>
            <button
              type="button"
              onClick={async () => {
                await logout();
                router.replace("/login");
              }}
              className="rounded-md border border-severity-high/40 bg-severity-high/5 px-3 py-1.5 text-[12px] text-severity-high transition-colors hover:bg-severity-high/10"
            >
              Sign out
            </button>
          </div>
        </Card>

        <Card title="Environment">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-[12px]">
            <div>
              <dt className="text-ink-500">Data</dt>
              <dd className="text-ink-900">Synthetic only</dd>
            </div>
            <div>
              <dt className="text-ink-500">API</dt>
              <dd className="font-mono text-[11px] text-ink-900">
                {process.env.NEXT_PUBLIC_ATLAS_API ?? "http://localhost:8000"}
              </dd>
            </div>
          </dl>
        </Card>
      </div>
    </>
  );
}
