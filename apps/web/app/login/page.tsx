"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ApiError, demoLogin, login } from "@/lib/api";

/**
 * Sign-in against the real API (spec §29).
 *
 * MFA is required by default in the API's settings, so the TOTP field is not
 * optional decoration — a login without it is rejected server-side.
 *
 * The error copy deliberately does not distinguish "no such user" from "wrong
 * password" from "wrong code". The API already returns the same shape for all
 * three, and repeating that here keeps the client from becoming the oracle the
 * server refuses to be.
 *
 * The demo buttons below remove the *friction*, not the control: a TOTP code
 * that expires while you read the form is a real problem during a demo, and the
 * tempting fix is to turn MFA off in development. That would be worse than it
 * looks — jurisdiction scoping and every audit row's actor derive from the
 * authenticated identity, so an unauthenticated mode would not be this product
 * with a step removed. It would be a different one in which none of the controls
 * can be shown working. The password is still checked; only the second factor is
 * computed server-side, and only in development.
 */
/** Matches `scripts/seed_demo.py`, which refuses to run outside development. */
const DEMO_PASSWORD = "atlas-demo-password";

const DEMO_ACCOUNTS = [
  { username: "demo.investigator", label: "Investigator", note: "Cases, alerts, complaints" },
  { username: "demo.auditor", label: "Auditor", note: "The only role with audit:read" },
] as const;

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [totp, setTotp] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [demoBusy, setDemoBusy] = useState<string | null>(null);

  async function signInAsDemo(demoUser: string) {
    setDemoBusy(demoUser);
    setError(null);
    try {
      await demoLogin(demoUser, DEMO_PASSWORD);
      router.push("/overview");
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 404
          ? "Demo sign-in is development-only, and this API is not in development mode."
          : "Demo account not found. Run: python scripts/seed_demo.py",
      );
      setDemoBusy(null);
    }
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(username, password, totp);
      router.push("/overview");
    } catch (err) {
      if (err instanceof ApiError && err.status === 0) {
        setError(err.message);
      } else {
        setError("Those credentials were not accepted.");
      }
      setBusy(false);
    }
  }

  return (
    <main className="grid min-h-screen place-items-center bg-paper px-6">
      <div className="w-full max-w-sm">
        <div className="mb-6">
          <div className="text-sm font-semibold tracking-[0.18em] text-ink-900">ATLAS</div>
          <p className="mt-1 text-[12px] text-ink-500">
            Predictive cash-out intelligence · Investigator console
          </p>
        </div>

        <form
          onSubmit={onSubmit}
          className="rounded-sm border border-line bg-surface p-5"
          aria-describedby={error ? "login-error" : undefined}
        >
          <h1 className="mb-4 text-base font-semibold text-ink-900">Sign in</h1>

          <label className="mb-3 block">
            <span className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-ink-500">
              Username
            </span>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              required
              className="w-full rounded-sm border border-line bg-paper px-2.5 py-2 text-sm text-ink-900 outline-none focus-visible:border-ink-500"
            />
          </label>

          <label className="mb-3 block">
            <span className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-ink-500">
              Password
            </span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
              className="w-full rounded-sm border border-line bg-paper px-2.5 py-2 text-sm text-ink-900 outline-none focus-visible:border-ink-500"
            />
          </label>

          <label className="mb-4 block">
            <span className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-ink-500">
              Authenticator code
            </span>
            <input
              value={totp}
              onChange={(e) => setTotp(e.target.value.replace(/\D/g, "").slice(0, 6))}
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="000000"
              maxLength={6}
              required
              className="w-full rounded-sm border border-line bg-paper px-2.5 py-2 font-mono text-sm tracking-[0.3em] text-ink-900 outline-none focus-visible:border-ink-500"
            />
          </label>

          {error && (
            <p
              id="login-error"
              role="alert"
              className="mb-3 rounded-sm border border-severity-high/30 bg-severity-high/5 px-2.5 py-2 text-[12px] text-severity-high"
            >
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-sm bg-ink-900 px-3 py-2 text-sm font-medium text-paper transition-opacity disabled:opacity-50"
          >
            {busy ? "Signing in…" : "Sign in"}
          </button>
        </form>

        {/* Development shortcut. The endpoint behind it is a 404 outside
            development, so in a deployed build these buttons simply fail — which
            is the intended behaviour, not a case to handle. */}
        <div className="mt-5 border-t border-line pt-4">
          <p className="mb-2.5 text-[10px] font-medium uppercase tracking-wider text-ink-500">
            Development — skip the code
          </p>
          <div className="grid grid-cols-2 gap-2">
            {DEMO_ACCOUNTS.map((account) => (
              <button
                key={account.username}
                type="button"
                onClick={() => void signInAsDemo(account.username)}
                disabled={demoBusy !== null}
                className="rounded-sm border border-line bg-surface px-2.5 py-2 text-left transition-colors hover:border-line-strong disabled:opacity-50"
              >
                <span className="block text-[12px] font-medium text-ink-900">
                  {demoBusy === account.username ? "Signing in…" : account.label}
                </span>
                <span className="mt-0.5 block text-[10px] leading-snug text-ink-500">
                  {account.note}
                </span>
              </button>
            ))}
          </div>
          <p className="mt-2.5 text-[10px] leading-relaxed text-ink-500">
            The password is still checked and the login is still audited — only the
            authenticator code is computed server-side. Run{" "}
            <code className="rounded-sm bg-surface px-1 py-0.5 font-mono">
              python scripts/seed_demo.py
            </code>{" "}
            once to create these accounts.
          </p>
        </div>
      </div>
    </main>
  );
}
