"use client";

import { useEffect, useRef } from "react";
import { auth, demoLogin } from "@/lib/api";

/**
 * Sign the console in, once, if nobody is.
 *
 * Mounted in the dashboard layout so it covers every page. Each page used to
 * redirect to `/login` on its own, which meant a presenter clicking Alerts
 * mid-demo was thrown out to a sign-in form — the same dead end the walkthrough
 * already had to fix, repeated eight times.
 *
 * **Nothing is bypassed.** This calls the same development-only `demo-login`
 * endpoint: the password is still verified with argon2id, the TOTP is still
 * checked, and the login is audited like any other. Only the typing goes away.
 *
 * Outside development that endpoint is a 404, so this silently does nothing and
 * the pages behave as they always did — the sign-in form is still there and
 * still the only way in. That is the intended behaviour in a deployed build,
 * not a case to handle.
 */

/** The seeded development account. See `scripts/seed_demo.py`. */
const DEMO_USERNAME = "demo.investigator";
const DEMO_PASSWORD = "atlas-demo-password";

export function AutoSignIn() {
  // One attempt per mount. Without the guard a failing endpoint would be
  // retried on every navigation for the life of the session.
  const attempted = useRef(false);

  useEffect(() => {
    if (attempted.current || auth.isSignedIn()) return;
    attempted.current = true;
    void demoLogin(DEMO_USERNAME, DEMO_PASSWORD).catch(() => {
      // Deployed, or the account is not seeded. Either way the pages fall back
      // to their own signed-out handling.
    });
  }, []);

  return null;
}
