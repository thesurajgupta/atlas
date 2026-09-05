<<<<<<< HEAD
import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'ATLAS - Cyber Crime & Financial Fraud Tracking System',
  description: 'ATM and Branch Map Cash-out Visualizer',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="bg-[#0b0e14] text-slate-200 antialiased h-screen overflow-hidden">
=======
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
>>>>>>> origin/main
        {children}
      </body>
    </html>
  );
<<<<<<< HEAD
}
=======
}
>>>>>>> origin/main
