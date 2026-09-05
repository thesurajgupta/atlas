/**
 * The sidebar emblem.
 *
 * ## Why there is no India outline here yet
 *
 * An earlier version of this rail drew a hand-authored India silhouette. It was
 * approximate, and it has been removed rather than refined, because a more
 * detailed inaccurate boundary is worse than an obviously stylised one: detail
 * invites belief.
 *
 * This is not only a quality question. India requires maps to depict its
 * external frontiers as published by the Survey of India, and the J&K, Aksai
 * Chin and Arunachal Pradesh frontiers are precisely where a
 * drawn-from-memory outline goes wrong. On a system built for the Ministry of
 * Home Affairs and I4C, shipping a boundary nobody can source is a legal and
 * diplomatic exposure, not a rounding error — the same standard this codebase
 * applies to an uncalibrated confidence or an invented coordinate.
 *
 * ## How to add the real one
 *
 * Set `INDIA_OUTLINE_PATH` to the `d` attribute of an officially sourced
 * outline, projected into the `INDIA_OUTLINE_VIEWBOX` below, and set
 * `INDIA_OUTLINE_ATTRIBUTION` to its provenance. The component switches over
 * automatically; nothing else needs to change.
 *
 * The source must be an official government outline map of India. Natural
 * Earth, OpenStreetMap and most web-map defaults depict the northern frontiers
 * differently from the Indian official position, so they are not substitutes
 * here however convenient they are to obtain.
 *
 * Until then the rail shows an abstract emblem, which carries the institutional
 * weight the design wants while claiming nothing about geography.
 */

/** The `d` of an officially sourced India outline, or `null` while none is held. */
export const INDIA_OUTLINE_PATH: string | null = null;

/** Provenance for the outline above. Displayed nowhere; recorded for review. */
export const INDIA_OUTLINE_ATTRIBUTION: string | null = null;

/** The coordinate box `INDIA_OUTLINE_PATH` must be projected into. */
export const INDIA_OUTLINE_VIEWBOX = '0 0 100 124';

/**
 * A network mark: nodes joined by links, inside a shield.
 *
 * Abstract on purpose. It reads as institutional cyber-intelligence and depicts
 * no territory, so there is nothing about it that can be wrong.
 */
function AbstractEmblem({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 124" aria-hidden className={className}>
      <path
        d="M50 6 88 20v42c0 26-16 44-38 56C28 106 12 88 12 62V20Z"
        fill="currentColor"
        opacity="0.07"
      />
      <path
        d="M50 6 88 20v42c0 26-16 44-38 56C28 106 12 88 12 62V20Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
        opacity="0.55"
      />
      <g stroke="currentColor" strokeWidth="1.2" opacity="0.5">
        <path d="M50 36 30 58M50 36l20 22M30 58l20 24M70 58 50 82M30 58h40" />
      </g>
      <g fill="currentColor">
        <circle cx="50" cy="36" r="4.4" />
        <circle cx="30" cy="58" r="3.4" opacity="0.85" />
        <circle cx="70" cy="58" r="3.4" opacity="0.85" />
        <circle cx="50" cy="82" r="3.8" opacity="0.9" />
      </g>
    </svg>
  );
}

export default function IndiaOutline({ className }: { className?: string }) {
  if (INDIA_OUTLINE_PATH === null) return <AbstractEmblem className={className} />;

  return (
    <svg viewBox={INDIA_OUTLINE_VIEWBOX} aria-hidden className={className}>
      <path d={INDIA_OUTLINE_PATH} fill="currentColor" opacity="0.16" />
      <path
        d={INDIA_OUTLINE_PATH}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.1"
        strokeLinejoin="round"
        opacity="0.5"
      />
    </svg>
  );
}
