"use client";

import { useEffect, useState } from "react";
import { AUTH_CHANGED, auth } from "@/lib/api";

/**
 * Whether a token is present, updating when that changes.
 *
 * Pages fetch on mount, and `AutoSignIn` signs in *after* mount — so without
 * this a page loaded signed-out would fire one 401 and show an error for the
 * rest of the session, even though the console signed in a moment later.
 * Depending an effect on this value re-runs the fetch once the token lands.
 *
 * Starts `false` on the server and on the first client render, so the markup
 * matches on both sides and there is no hydration mismatch.
 */
export function useSignedIn(): boolean {
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    const sync = () => setSignedIn(auth.isSignedIn());
    sync();
    window.addEventListener(AUTH_CHANGED, sync);
    return () => window.removeEventListener(AUTH_CHANGED, sync);
  }, []);

  return signedIn;
}
