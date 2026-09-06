import { redirect } from "next/navigation";

/**
 * `/graph` was a placeholder built before the money-trail console existed.
 *
 * Kept as a redirect rather than deleted: the route is linked from earlier
 * issues and screenshots, and a 404 there reads as a broken build rather than
 * a renamed page.
 */
export default function GraphPage() {
  redirect("/money-trail");
}
