'use client';

/**
 * The ATLAS logo.
 *
 * Renders the supplied artwork at `public/assets/atlas_logo.png` exactly as
 * provided — the paths are never redrawn here, and the only vector mark in the
 * codebase (`AtlasMark`) exists solely as a fallback for when the file cannot
 * be loaded at all.
 *
 * **On the tile.** The supplied PNG has no alpha channel; its background is a
 * flat `#222222` that reaches every edge. Dropped straight onto the `#0f172a`
 * sidebar it would read as a slightly-wrong dark rectangle floating on navy.
 * Rather than alter the artwork, it is clipped into a rounded tile whose own
 * background is that same `#222222` with a hairline border, so the opaque edge
 * looks like a deliberate brand chip instead of a mismatch. A transparent SVG
 * or PNG would let the tile go away entirely — see the note in the report.
 *
 * The image is square (2000×2000) and rendered square, so nothing is stretched;
 * `object-contain` keeps that true if the artwork is ever replaced with a
 * non-square file.
 */

import Image from 'next/image';
import { useState } from 'react';

import AtlasMark from './AtlasMark';

export const ATLAS_LOGO_SRC = '/assets/atlas_logo.png';

/** The artwork's own background colour, sampled from its corner pixels. */
const ARTWORK_BACKGROUND = '#222222';

export default function AtlasLogo({
  size,
  className,
}: {
  /** Rendered edge length in px. The artwork is square, so this is both sides. */
  readonly size: number;
  readonly className?: string;
}) {
  const [unavailable, setUnavailable] = useState(false);

  if (unavailable) {
    return <AtlasMark className={className ?? 'h-7 w-7'} />;
  }

  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center overflow-hidden rounded-md border border-slate-700/60 ${className ?? ''}`}
      style={{ backgroundColor: ARTWORK_BACKGROUND, width: size, height: size }}
    >
      <Image
        src={ATLAS_LOGO_SRC}
        alt="ATLAS"
        width={size}
        height={size}
        priority
        className="h-full w-full object-contain"
        onError={() => setUnavailable(true)}
      />
    </span>
  );
}
