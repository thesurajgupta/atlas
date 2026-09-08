"use client";

import { useEffect, useRef } from "react";
import { AUTH_CHANGED, auth, demoLogin } from "@/lib/api";

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
  // Stops once the endpoint has actually refused us — deployed, or the account
  // is not seeded — rather than retrying a 404 on every auth change. A refusal
  // is a standing answer; an expired token is not.
  const refused = useRef(false);
  const inFlight = useRef(false);

  useEffect(() => {
    const signIn = () => {
      if (refused.current || inFlight.current || auth.isSignedIn()) return;
      inFlight.current = true;
      void demoLogin(DEMO_USERNAME, DEMO_PASSWORD)
        .catch(() => {
          refused.current = true;
        })
        .finally(() => {
          inFlight.current = false;
        });
    };

    signIn();
    // Access tokens expire, and a refresh that cannot be rotated clears the
    // session. Without this the console would sit signed out until someone
    // reloaded — every page drawing its empty state, which reads as "no data"
    // rather than "signed out". Signing in again is the honest recovery.
    window.addEventListener(AUTH_CHANGED, signIn);
    return () => window.removeEventListener(AUTH_CHANGED, signIn);
  }, []);

  return null;
}
