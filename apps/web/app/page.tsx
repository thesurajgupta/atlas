"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { auth } from "@/lib/api";

/**
 * Root. Sends a signed-in caller to the overview and everyone else to login.
 *
 * A client component rather than a server redirect because the token lives in
 * `sessionStorage`, which the server cannot see. A server-side `redirect` here
 * would send a signed-in investigator to `/login` on every cold load.
 */
export default function RootPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace(auth.isSignedIn() ? "/overview" : "/login");
  }, [router]);

  return null;
}
