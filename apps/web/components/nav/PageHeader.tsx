"use client";

import { Bell, Search } from "lucide-react";
import { useEffect, useState } from "react";
import { auth, getProfile, type Profile } from "@/lib/api";

/**
 * The bar every page carries: what this page is, a search box, and who is
 * signed in.
 *
 * The identity block is not decoration. Everything in ATLAS is scoped to the
 * caller's jurisdiction — a case that is absent from a list is absent because of
 * *who is asking*, not because it does not exist. An investigator who cannot see
 * their own role and district on screen has no way to tell "there are no cases"
 * from "there are no cases I may see", and that is the single most confusing
 * thing about a jurisdiction-scoped system.
 *
 * `actions` is where a page puts its own controls — date range, filters, view
 * switches — so those sit on the same baseline everywhere instead of each page
 * inventing a header.
 */
export function PageHeader({
  title,
  subtitle,
  actions,
  searchPlaceholder,
}: {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  searchPlaceholder?: string;
}) {
  const [profile, setProfile] = useState<Profile | null>(null);

  useEffect(() => {
    if (!auth.isSignedIn()) return;
    // Failure is silent and the block simply does not render. A header that
    // shows an error because a name could not be fetched would put a red box on
    // every page for something nobody needs to act on.
    getProfile()
      .then(setProfile)
      .catch(() => undefined);
  }, []);

  return (
    <header className="sticky top-0 z-10 border-b border-line bg-paper/95 px-6 py-3.5 backdrop-blur">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
        <div className="min-w-0">
          <h1 className="truncate text-[19px] font-semibold tracking-tight text-ink-900">
            {title}
          </h1>
          {subtitle && (
            <p className="mt-0.5 truncate text-[12px] text-ink-500">{subtitle}</p>
          )}
        </div>

        <div className="flex items-center gap-2">
          <div className="relative hidden lg:block">
            <Search
              className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-300"
              aria-hidden
            />
            <input
              type="search"
              placeholder={searchPlaceholder ?? "Search cases, accounts, endpoints…"}
              aria-label="Search"
              className="w-64 rounded-md border border-line bg-raised py-1.5 pl-8 pr-3 text-[12px] text-ink-900 placeholder-ink-300 focus:border-accent focus:outline-none"
            />
          </div>

          <button
            type="button"
            aria-label="Notifications"
            className="rounded-md border border-line bg-raised p-1.5 text-ink-500 transition-colors hover:text-ink-900"
          >
            <Bell className="h-4 w-4" aria-hidden />
          </button>

          {profile && (
            <div className="flex items-center gap-2 rounded-md border border-line bg-raised py-1 pl-1 pr-2.5">
              <span
                aria-hidden
                className="flex h-6 w-6 items-center justify-center rounded bg-accent/15 text-[10px] font-semibold text-accent"
              >
                {profile.display_name
                  .split(" ")
                  .map((p) => p[0])
                  .slice(0, 2)
                  .join("")}
              </span>
              <span className="leading-tight">
                <span className="block text-[11px] font-medium text-ink-900">
                  {profile.display_name}
                </span>
                <span className="block text-[9px] uppercase tracking-wider text-ink-500">
                  {profile.role.replace(/_/g, " ").toLowerCase()}
                </span>
              </span>
            </div>
          )}
        </div>
      </div>

      {actions && <div className="mt-3 flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}
