/**
 * The sidebar motion mark: an abstract cyber-network with value moving through it.
 *
 * Deliberately irregular. An earlier version was a straight chain of evenly
 * spaced dots, which read as a progress bar rather than a network — real
 * transaction graphs branch, converge and double back, and a mark that is
 * perfectly symmetric communicates the opposite. The node positions below are
 * hand-placed on no grid, the links vary in length and angle, and the radii
 * differ slightly, so the shape reads as organic without tipping into noise.
 *
 * The animated dash follows one route through the network to its terminal node
 * — entity, network, link — so the motion still carries direction even though
 * the topology is loose. Nothing in it is red: the mark shows no threat.
 *
 * **Decorative only.** It depicts no case, no entity and no quantity; nothing
 * about it comes from the trail on screen, and it does not change when the
 * graph does. It is a motif, not a readout, and it is not interactive.
 *
 * Motion is gated on `prefers-reduced-motion` in `globals.css` — with motion
 * reduced the same mark renders static, which is why the resting state is
 * styled to look finished rather than paused.
 */

/** Hand-placed, off-grid on purpose. `r` varies so no two nodes read as twins. */
const NODES = [
  { cx: 10, cy: 30, r: 3.4, delay: 0 },
  { cx: 38, cy: 13, r: 2.6, delay: 0.5 },
  { cx: 52, cy: 37, r: 3.1, delay: 1.1 },
  { cx: 82, cy: 20, r: 2.8, delay: 0.8 },
  { cx: 96, cy: 42, r: 2.4, delay: 1.5 },
  { cx: 118, cy: 15, r: 2.9, delay: 0.3 },
] as const;

/** Varied lengths and angles, including two that cross the spine. */
const LINKS = [
  'M10 30 38 13',
  'M10 30 52 37',
  'M38 13 52 37',
  'M38 13 82 20',
  'M52 37 96 42',
  'M82 20 118 15',
  'M82 20 96 42',
  'M96 42 142 26',
  'M118 15 142 26',
] as const;

/** The route the pulse takes: origin, through the network, to the endpoint. */
const FLOW_ROUTE = 'M10 30 38 13 82 20 118 15 142 26';

export default function TrailPulse({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 176 56" aria-hidden className={className} fill="none" role="presentation">
      <g stroke="#1e293b" strokeWidth="1.1" strokeLinecap="round">
        {LINKS.map((d) => (
          <path key={d} d={d} />
        ))}
      </g>

      <path
        className="atlas-flow"
        d={FLOW_ROUTE}
        stroke="#38bdf8"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeDasharray="5 11"
        opacity="0.85"
      />

      {NODES.map((node) => (
        <g key={`${node.cx}-${node.cy}`}>
          <circle
            className="atlas-pulse"
            cx={node.cx}
            cy={node.cy}
            r={node.r + 3.4}
            fill="#38bdf8"
            opacity="0.22"
            style={{ animationDelay: `${node.delay}s` }}
          />
          <circle
            cx={node.cx}
            cy={node.cy}
            r={node.r}
            fill="#0c4a6e"
            stroke="#7dd3fc"
            strokeWidth="1.3"
          />
        </g>
      ))}

      {/* The terminal node, offset from the spine so the network does not
          resolve into a straight line at the last step.
          It is a network node like the rest, in the brand cyan — deliberately
          not the cash-out red. This mark depicts no threat and no entity, and
          borrowing the critical semantic for decoration would dilute the one
          place that colour is allowed to mean something. */}
      <circle
        className="atlas-glow"
        cx="142"
        cy="26"
        r="8.4"
        fill="#38bdf8"
        opacity="0.2"
      />
      <circle cx="142" cy="26" r="4.2" fill="#0c4a6e" stroke="#7dd3fc" strokeWidth="1.4" />
    </svg>
  );
}
