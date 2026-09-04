import { PrimaryNav } from "@/components/nav/PrimaryNav";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col">
      <PrimaryNav />
      <main className="flex-1">{children}</main>
    </div>
  );
}
