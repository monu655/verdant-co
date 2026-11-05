type Bez = [[number, number], [number, number], [number, number], [number, number]];

// Two cubic segments forming one gently curving stem. Leaves are placed exactly on the curve.
const SEGMENTS: Bez[] = [
  [[40, 600], [110, 500], [130, 410], [200, 318]],
  [[200, 318], [262, 236], [300, 150], [330, 40]],
];

function sample([a, b, c, d]: Bez, t: number) {
  const u = 1 - t;
  const x = u ** 3 * a[0] + 3 * u * u * t * b[0] + 3 * u * t * t * c[0] + t ** 3 * d[0];
  const y = u ** 3 * a[1] + 3 * u * u * t * b[1] + 3 * u * t * t * c[1] + t ** 3 * d[1];
  const dx = 3 * u * u * (b[0] - a[0]) + 6 * u * t * (c[0] - b[0]) + 3 * t * t * (d[0] - c[0]);
  const dy = 3 * u * u * (b[1] - a[1]) + 6 * u * t * (c[1] - b[1]) + 3 * t * t * (d[1] - c[1]);
  return { x, y, angle: (Math.atan2(dy, dx) * 180) / Math.PI };
}

const STEPS = [0.12, 0.38, 0.64, 0.9];
const LEAVES = SEGMENTS.flatMap((seg, si) =>
  STEPS.flatMap((t, ti) => {
    const progress = (si * STEPS.length + ti) / (SEGMENTS.length * STEPS.length - 1);
    const p = sample(seg, t);
    const s = 1.2 - 0.62 * progress;
    return [
      { x: p.x, y: p.y, rot: p.angle - 50 + (ti % 2) * 5, s },
      { x: p.x, y: p.y, rot: p.angle + 50 - (ti % 2) * 5, s: s * 0.94 },
    ];
  }),
);

/** Quiet botanical line art for brand panels. Uses currentColor, so colour it with a text-* class. */
export function Botanical({ className = "" }: { className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 400 600" fill="none" className={className} preserveAspectRatio="xMaxYMax meet">
      <path d="M40 600 C110 500 130 410 200 318 C262 236 300 150 330 40" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      {LEAVES.map((l, i) => (
        <g key={i} transform={`translate(${l.x.toFixed(1)} ${l.y.toFixed(1)}) rotate(${l.rot.toFixed(1)}) scale(${l.s.toFixed(2)})`}>
          <path d="M0 0C16-16 46-16 66 0C46 16 16 16 0 0Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
          <path d="M0 0L62 0" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
        </g>
      ))}
    </svg>
  );
}