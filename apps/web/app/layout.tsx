import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ATLAS — Investigator Console",
  description:
    "Predictive cash-out intelligence for cybercrime complaints. Synthetic data only.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-paper font-sans text-base text-ink-900 antialiased">
        {children}
      </body>
    </html>
  );
}
