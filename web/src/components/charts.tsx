import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { useState } from "react";

/** Change versus the previous period. `goodWhen` says which direction is good (response time: down). */
export function Delta({ now, before, goodWhen = "up", suffix = "vs previous period" }: { now: number | null; before: number | null; goodWhen?: "up" | "down"; suffix?: string }) {
  if (now === null || before === null || (before === 0 && now === 0)) return <span className="text-xs text-muted">No change yet</span>;
  if (before === 0) return <span className="text-xs text-muted">New this period</span>;
  const pct = Math.round(((now - before) / before) * 100);
  if (pct === 0) return <span className="inline-flex items-center gap-1 text-xs text-muted"><Minus aria-hidden className="h-3 w-3" />No change {suffix}</span>;
  const good = goodWhen === "up" ? pct > 0 : pct < 0;
  const Icon = pct > 0 ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={`inline-flex items-center gap-1 text-xs ${good ? "text-emerald-600" : "text-red-700"}`}>
      <Icon aria-hidden className="h-3.5 w-3.5" /><b className="font-semibold">{Math.abs(pct)}%</b><span className="text-muted">{suffix}</span>
    </span>
  );
}

export function Sparkline({ values, label, className = "" }: { values: number[]; label: string; className?: string }) {
  const w = 120, h = 36, pad = 3;
  const max = Math.max(1, ...values);
  const step = values.length > 1 ? (w - pad * 2) / (values.length - 1) : 0;
  const pts = values.map((v, i) => [pad + i * step, h - pad - (v / max) * (h - pad * 2)] as const);
  const line = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
  const area = `${line} L${pts[pts.length - 1]![0].toFixed(1)} ${h} L${pts[0]![0].toFixed(1)} ${h} Z`;
  return (
    <svg role="img" aria-label={label} viewBox={`0 0 ${w} ${h}`} className={`h-9 w-28 ${className}`} preserveAspectRatio="none">
      <path d={area} fill="currentColor" opacity="0.12" />
      <path d={line} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/** Ring showing one share (value / total). */
export function Ring({ value, total, label, size = 112 }: { value: number; total: number; label: string; size?: number }) {
  const r = 44, c = 2 * Math.PI * r;
  const pct = total > 0 ? value / total : 0;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg role="img" aria-label={`${label}: ${Math.round(pct * 100)}%`} viewBox="0 0 100 100" className="h-full w-full -rotate-90">
        <circle cx="50" cy="50" r={r} fill="none" stroke="#D1FAE5" strokeWidth="10" />
        <circle cx="50" cy="50" r={r} fill="none" stroke="#059669" strokeWidth="10" strokeLinecap="round" strokeDasharray={`${pct * c} ${c}`} style={{ transition: "stroke-dasharray .6s ease" }} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-semibold leading-none tabular-nums" style={{ fontSize: Math.round(size * 0.22) }}>{total > 0 ? Math.round(pct * 100) : 0}%</span>
      </div>
    </div>
  );
}

interface Day { day: string; customer_messages: number; agent_replies: number }

/** Grouped bars with gridlines, a y-axis and a hover/focus tooltip. */
export function MessagesChart({ daily }: { daily: Day[] }) {
  const [active, setActive] = useState<number | null>(null);
  const rawMax = Math.max(1, ...daily.flatMap((d) => [d.customer_messages, d.agent_replies]));
  const step = rawMax <= 4 ? 1 : Math.ceil(rawMax / 4);
  const top = step * 4 > rawMax ? Math.ceil(rawMax / step) * step : rawMax;
  const ticks = Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step).reverse();
  const dense = daily.length > 10;
  const label = (d: Day) => new Date(d.day + "T00:00").toLocaleDateString([], { day: "numeric", month: "short" });
  const a = active !== null ? daily[active] : null;
  return (
    <div className="relative">
      <div className="flex h-64 gap-3">
        <div aria-hidden className="flex w-6 flex-col justify-between pb-6 text-right text-[11px] text-muted tabular-nums">
          {ticks.map((t) => <span key={t} className="leading-none">{t}</span>)}
        </div>
        <div className="relative flex-1">
          <div aria-hidden className="absolute inset-x-0 top-0 flex h-[calc(100%-1.5rem)] flex-col justify-between">
            {ticks.map((t) => <div key={t} className="border-t border-dashed border-line" />)}
          </div>
          <div role="img" aria-label={`Daily messages: ${daily.map((d) => `${label(d)}: ${d.customer_messages} customer, ${d.agent_replies} agent`).join("; ")}`}
            className="relative flex h-full items-end gap-1 sm:gap-2">
            {daily.map((d, i) => (
              <button key={d.day} type="button" tabIndex={0} aria-label={`${label(d)}: ${d.customer_messages} customer messages, ${d.agent_replies} agent replies`}
                onMouseEnter={() => setActive(i)} onMouseLeave={() => setActive(null)} onFocus={() => setActive(i)} onBlur={() => setActive(null)}
                className={`flex h-full min-w-0 flex-1 flex-col justify-end rounded-md outline-none transition-colors focus-visible:ring-2 focus-visible:ring-emerald-600 ${active === i ? "bg-mint-50" : ""}`}>
                <span className="flex flex-1 items-end justify-center gap-0.5">
                  <span className="w-full max-w-4 rounded-t bg-emerald-600 transition-[height] duration-500" style={{ height: `${(d.customer_messages / top) * 100}%`, minHeight: d.customer_messages ? 4 : 0 }} />
                  <span className="w-full max-w-4 rounded-t bg-forest-900 transition-[height] duration-500" style={{ height: `${(d.agent_replies / top) * 100}%`, minHeight: d.agent_replies ? 4 : 0 }} />
                </span>
                <span className="h-6 pt-1.5 text-center text-[11px] leading-none text-muted">
                  {dense ? (i % 5 === 0 ? new Date(d.day + "T00:00").getDate() : "") : new Date(d.day + "T00:00").toLocaleDateString([], { weekday: "short" })}
                </span>
              </button>
            ))}
          </div>
          {a && (
            <div role="status" className="pointer-events-none absolute -top-2 left-1/2 z-10 -translate-x-1/2 -translate-y-full rounded-lg border border-line bg-white px-3 py-2 text-xs shadow-pop">
              <p className="font-semibold">{label(a)}</p>
              <p className="mt-1 flex items-center gap-1.5"><span aria-hidden className="h-2 w-2 rounded-sm bg-emerald-600" />{a.customer_messages} customer</p>
              <p className="flex items-center gap-1.5"><span aria-hidden className="h-2 w-2 rounded-sm bg-forest-900" />{a.agent_replies} agent</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
