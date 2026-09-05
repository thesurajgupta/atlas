/**
 * The ATLAS brand wordmark for the navigation rail.
 *
 * Renders `public/assets/atlas_logo.png` — the supplied artwork itself. Nothing
 * here redraws any part of it; the mark on screen is the file's own pixels.
 *
 * **Why a window is taken out of it.** The file is square (2000x2000) but the
 * lettering sits in a band at y 667-1134 — under a quarter of the canvas.
 * Rendered whole it is mostly the artwork's own blank margin, which is why the
 * previous 34px square resolved the lettering to about ten pixels. `WINDOW`
 * below is the full artwork width and that band, with the margin the feather
 * needs. The image is scaled uniformly behind the window, so its 1:1 pixel
 * ratio is untouched and nothing is stretched; only blank margin is clipped.
 *
 * The artwork also carries its own strapline at y 1192-1281. In a 56px block it
 * would resolve to roughly three pixels of unreadable smear, so the window
 * stops just above it.
 *
 * **Why the filter.** The PNG has no alpha: its ground is a flat #222222
 * reaching every edge, with the lettering's glow baked onto it. Dropped on the
 * navy rail it stamps a charcoal rectangle — the reason the old lockup needed a
 * tile behind it. The transfer function below maps that ground to exactly black
 * and rescales what is above it; `screen` then adds the remainder onto the rail,
 * which is how a glow composites correctly. The ground contributes nothing, so
 * there is no rectangle and no tile.
 *
 * **Why the feather.** The glow never falls back to the ground — it is still
 * measurably above it at the artwork's own edges — so a hard window would cut it
 * off mid-falloff and put a visible seam around the mark. The mask fades the
 * margin outside `LETTERS` to nothing. It reaches full opacity exactly at the
 * lettering's bounds, so no part of the mark itself is dimmed.
 */

import Image from 'next/image';

/** The band of artwork to show, in source pixels. Measured, not guessed. */
const WINDOW = { src: 2000, x: 0, y: 613, w: 2000, h: 576 } as const;

/** Bounds of the lettering within that window, as a fraction of the window. */
const LETTERS = { left: 4.1, right: 4.0, top: 9.4, bottom: 9.5 } as const;

/** The artwork's ground level, sampled from its corners. */
const GROUND = 34 / 255;

const SLOPE = 1 / (1 - GROUND);
const INTERCEPT = -GROUND / (1 - GROUND);

const FILTER_ID = 'atlas-wordmark-ground';

const pct = (n: number) => `${n}%`;

/** Fades the clipped glow out over the margin, never over the lettering. */
const FEATHER = [
  `linear-gradient(to right, transparent 0%, #000 ${LETTERS.left}%, #000 ${100 - LETTERS.right}%, transparent 100%)`,
  `linear-gradient(to bottom, transparent 0%, #000 ${LETTERS.top}%, #000 ${100 - LETTERS.bottom}%, transparent 100%)`,
].join(',');

export default function AtlasWordmark({ className }: { readonly className: string }) {
  return (
    <span
      className={`relative block overflow-hidden ${className}`}
      style={{ aspectRatio: `${WINDOW.w} / ${WINDOW.h}` }}
    >
      <svg aria-hidden className="absolute h-0 w-0">
        <filter id={FILTER_ID} colorInterpolationFilters="sRGB">
          {/* out = (in - GROUND) / (1 - GROUND) */}
          <feComponentTransfer>
            <feFuncR type="linear" slope={SLOPE} intercept={INTERCEPT} />
            <feFuncG type="linear" slope={SLOPE} intercept={INTERCEPT} />
            <feFuncB type="linear" slope={SLOPE} intercept={INTERCEPT} />
          </feComponentTransfer>
        </filter>
      </svg>

      <Image
        src="/assets/atlas_logo.png"
        alt="ATLAS"
        width={WINDOW.src}
        height={WINDOW.src}
        priority
        sizes="320px"
        className="absolute max-w-none"
        style={{
          width: pct((WINDOW.src / WINDOW.w) * 100),
          height: 'auto',
          left: pct(-(WINDOW.x / WINDOW.w) * 100),
          // A percentage `top` resolves against the window's height, so the
          // source offset is converted out of width units into height units.
          top: pct(-(WINDOW.y / WINDOW.w) * 100 * (WINDOW.w / WINDOW.h)),
          filter: `url(#${FILTER_ID})`,
          maskImage: FEATHER,
          WebkitMaskImage: FEATHER,
          maskComposite: 'intersect',
          WebkitMaskComposite: 'source-in',
          mixBlendMode: 'screen',
        }}
      />
    </span>
  );
}
