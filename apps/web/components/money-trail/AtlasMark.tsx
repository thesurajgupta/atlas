/**
 * The ATLAS mark: an angular "A" built from two facets and a crossbar.
 *
 * Faceted rather than gradient-filled so the same component can be rendered
 * twice on a page without two elements sharing a gradient id — and so it stays
 * crisp at 20px, which is the size it is actually used at.
 */
export default function AtlasMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden className={className}>
      {/* Left facet, right facet: the two strokes of the A, lit from the right. */}
      <path d="M16 2.4 2.2 29.6h6.6L16 15Z" fill="#0284c7" />
      <path d="M16 2.4 29.8 29.6h-6.6L16 15Z" fill="#38bdf8" />
      {/* Crossbar, angled to match the legs. */}
      <path d="M12.2 20.9h7.6l1.5 3.9H10.7Z" fill="#7dd3fc" />
    </svg>
  );
}
