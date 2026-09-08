import { Sidebar } from "@/components/nav/Sidebar";
import { PresentationRunner } from "@/components/demo/PresentationMode";

/**
 * The console shell: a fixed sidebar and one scrolling region beside it.
 *
 * `h-dvh` with `overflow-hidden` at the root, and the scroll on `<main>` rather
 * than on the page. That is what keeps the sidebar still while a long audit
 * table moves, and it is what lets a full-height page — the money-trail canvas
 * — size itself against `h-full` without measuring anything.
 */
export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-dvh overflow-hidden bg-paper">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mounted once, so every page participates in the tour without each
            one wiring up a timer. Renders nothing when it is not running. */}
        <PresentationRunner />
        <main className="min-w-0 flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
