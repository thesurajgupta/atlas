"use client";

import { useEffect, useState } from "react";
import { ShieldCheck } from "lucide-react";
import { auth, getProfile, type Profile } from "@/lib/api";
import { PageHeader } from "@/components/nav/PageHeader";
import { Card } from "@/components/ui/Card";

/**
 * Roles and access (spec §29).
 *
 * The permission matrix is the real content here, and it is read from the same
 * table the API enforces — `ROLE_PERMISSIONS` in `atlas/iam/authz.py`, mirrored
 * below. It is explicit rather than hierarchical on purpose: a table you can
 * read top to bottom is auditable, and "analyst inherits investigator" quietly
 * grants things nobody intended the day someone adds a permission to the base
 * role.
 *
 * Account management is not built. Showing an "Add user" button that does
 * nothing would be worse than not showing one — this page says what the system
 * enforces today, and says plainly what it cannot do.
 */

const PERMISSIONS = [
  "complaint:read",
  "complaint:create",
  "case:read",
  "case:write",
  "prediction:read",
  "alert:read",
  "intel:send",
  "audit:read",
  "model:read",
] as const;

const ROLES: { role: string; note: string; held: Set<string> }[] = [
  {
    role: "SUPER_ADMIN",
    note: "Everything, including break-glass grants",
    held: new Set(PERMISSIONS),
  },
  {
    role: "NATIONAL_ANALYST",
    note: "Whole country; the only role that may run broad un-cased prediction queries",
    held: new Set([
      "complaint:read",
      "case:read",
      "prediction:read",
      "alert:read",
      "model:read",
    ]),
  },
  {
    role: "STATE_ANALYST",
    note: "State subtree; may assign cases",
    held: new Set([
      "complaint:read",
      "case:read",
      "prediction:read",
      "alert:read",
      "model:read",
    ]),
  },
  {
    role: "DISTRICT_INVESTIGATOR",
    note: "District subtree; the working role",
    held: new Set([
      "complaint:read",
      "complaint:create",
      "case:read",
      "case:write",
      "prediction:read",
      "alert:read",
      "intel:send",
    ]),
  },
  {
    role: "BANK_PARTNER",
    note: "Holds nothing. The outbound package is its entire surface (§28.1)",
    held: new Set<string>(),
  },
  {
    role: "AUDITOR",
    note: "Reads the log and the model card; sees no case data",
    held: new Set(["audit:read", "model:read"]),
  },
  {
    role: "READ_ONLY_ANALYST",
    note: "Reads, writes nothing",
    held: new Set(["complaint:read", "case:read", "prediction:read", "alert:read"]),
  },
];

export default function UsersPage() {
  const [profile, setProfile] = useState<Profile | null>(null);

  useEffect(() => {
    if (!auth.isSignedIn()) return;
    getProfile()
      .then(setProfile)
      .catch(() => undefined);
  }, []);

  return (
    <>
      <PageHeader
        title="Users and access"
        subtitle="What each role may do. Enforced server-side, deny by default."
      />

      <div className="space-y-4 px-6 py-5">
        {profile && (
          <Card title="Signed in as">
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-[12px]">
              <div>
                <p className="text-ink-500">Name</p>
                <p className="text-ink-900">{profile.display_name}</p>
              </div>
              <div>
                <p className="text-ink-500">Role</p>
                <p className="text-ink-900">{profile.role.replace(/_/g, " ")}</p>
              </div>
              <div>
                <p className="text-ink-500">Jurisdiction</p>
                <p className="font-mono text-[11px] text-ink-900">
                  {profile.jurisdiction_id}
                </p>
              </div>
              <div className="flex items-center gap-1.5">
                <ShieldCheck className="h-3.5 w-3.5 text-evidence-strong" aria-hidden />
                <span className="text-ink-700">
                  MFA {profile.mfa_enrolled ? "enrolled" : "not enrolled"}
                </span>
              </div>
            </div>
          </Card>
        )}

        <Card title="Permission matrix" bodyClassName="overflow-x-auto">
          <table className="w-full min-w-[52rem] text-left text-[12px]">
            <thead className="border-b border-line text-[10px] uppercase tracking-wider text-ink-500">
              <tr>
                <th scope="col" className="px-4 py-2 font-medium">
                  Role
                </th>
                {PERMISSIONS.map((p) => (
                  <th key={p} scope="col" className="px-2 py-2 font-mono font-normal">
                    {p.replace(":", "​:")}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {ROLES.map((r) => (
                <tr key={r.role} className={r.role === profile?.role ? "bg-accent/5" : ""}>
                  <th scope="row" className="px-4 py-2.5 text-left font-normal">
                    <span className="block font-mono text-[11px] text-ink-900">
                      {r.role}
                    </span>
                    <span className="mt-0.5 block max-w-[16rem] text-[10px] leading-snug text-ink-500">
                      {r.note}
                    </span>
                  </th>
                  {PERMISSIONS.map((p) => (
                    <td key={p} className="px-2 py-2.5 text-center">
                      {r.held.has(p) ? (
                        <span
                          className="text-evidence-strong"
                          aria-label={`${r.role} holds ${p}`}
                        >
                          ●
                        </span>
                      ) : (
                        <span className="text-ink-300" aria-label={`${r.role} does not hold ${p}`}>
                          ·
                        </span>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </Card>

        <Card title="Not built">
          <p className="text-[12px] leading-relaxed text-ink-500">
            Creating, editing and deactivating accounts is not implemented, so there are
            no controls for it here rather than controls that do nothing. Accounts are
            currently created by <code className="font-mono">scripts/seed_demo.py</code>{" "}
            in development only — it refuses to run outside a development environment,
            because the whole point of it is a known password.
          </p>
        </Card>
      </div>
    </>
  );
}
