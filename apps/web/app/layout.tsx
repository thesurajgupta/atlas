import type { Metadata } from "next";
import "./globals.css";
import { NcrpPortalProvider } from "@/lib/demo/store";

export const metadata: Metadata = {
  title: "ATLAS — Investigator Console",
  description:
    "Predictive cash-out intelligence for cybercrime complaints. Synthetic data only.",
};

/**
 * The provider is mounted at the root, above both the reporting portal and the
 * console, because the portal's Reset control has to clear the console's
 * walkthrough too. It holds only the citizen-facing complaint record; the case
 * itself lives in `lib/demo-run`, written by the real API.
 */
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-paper font-sans text-base text-ink-900 antialiased">
        <NcrpPortalProvider>{children}</NcrpPortalProvider>
      </body>
    </html>
  );
}
