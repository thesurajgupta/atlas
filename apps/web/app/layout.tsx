import type { Metadata } from "next";
import "./globals.css";
import { DemoCaseProvider } from "@/lib/demo/store";

export const metadata: Metadata = {
  title: "ATLAS — Investigator Console",
  description:
    "Predictive cash-out intelligence for cybercrime complaints. Synthetic data only.",
};

/**
 * The provider is mounted at the root, above both the citizen-facing portal and
 * the console, because the complaint filed on one has to be the case opened on
 * the other. A provider inside either route group would give each its own
 * store, which is the one thing this demo must not have.
 */
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-paper font-sans text-base text-ink-900 antialiased">
        <DemoCaseProvider>{children}</DemoCaseProvider>
      </body>
    </html>
  );
}
