import { useQuery } from "@tanstack/react-query";
import { ErrorState, Skeleton } from "../components/ui";
import { api, type Stats } from "../lib/api";

export function AnalyticsPage() {
  const q = useQuery({ queryKey: ["stats"], queryFn: () => api<Stats>("/api/stats"), refetchInterval: 15000 });
  const s = q.data;
  const max = Math.max(1, ...(s?.daily.flatMap((d) => [d.customer_messages, d.agent_replies]) ?? [1]));
  const used = s ? s.drafts_sent_unedited + s.drafts_edited : 0;
  const rows = s ? [
    ["Drafts generated", s.drafts_total], ["Sent as written", s.drafts_sent_unedited], ["Edited before sending", s.drafts_edited],
    ["Flagged as needing a human check", s.drafts_escalated], ["Failed (AI provider error)", s.drafts_failed],
  ] as const : [];
  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Analytics</h1>
        <p className="mt-1 text-sm text-muted">Calculated from stored messages and drafts. Nothing here is sample data.</p>
      </div>
      {q.isError ? <div className="card"><ErrorState message="Couldn't load analytics." onRetry={() => q.refetch()} /></div> : !s ? <Skeleton className="h-80" /> : (
        <div className="grid gap-6 lg:grid-cols-5">
          <section className="card p-5 lg:col-span-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-semibold">Messages, last 7 days</h2>
              <ul className="flex gap-4 text-xs text-muted">
                <li className="flex items-center gap-1.5"><span aria-hidden className="h-2.5 w-2.5 rounded-sm bg-emerald-600" />Customer</li>
                <li className="flex items-center gap-1.5"><span aria-hidden className="h-2.5 w-2.5 rounded-sm bg-forest-900" />Agent replies</li>
              </ul>
            </div>
            <div role="img" aria-label={`Daily message counts: ${s.daily.map((d) => `${d.day}: ${d.customer_messages} customer, ${d.agent_replies} agent`).join("; ")}`} className="mt-6 flex h-56 items-end gap-2 sm:gap-4">
              {s.daily.map((d) => (
                <div key={d.day} className="flex h-full flex-1 flex-col justify-end gap-2">
                  <div className="flex flex-1 items-end justify-center gap-1">
                    <div title={`${d.customer_messages} customer`} className="w-full max-w-5 rounded-t bg-emerald-600" style={{ height: `${(d.customer_messages / max) * 100}%`, minHeight: d.customer_messages ? 4 : 0 }} />
                    <div title={`${d.agent_replies} agent`} className="w-full max-w-5 rounded-t bg-forest-900" style={{ height: `${(d.agent_replies / max) * 100}%`, minHeight: d.agent_replies ? 4 : 0 }} />
                  </div>
                  <span className="text-center text-[11px] text-muted">{new Date(d.day + "T00:00").toLocaleDateString([], { weekday: "short" })}</span>
                </div>
              ))}
            </div>
            {s.daily.every((d) => !d.customer_messages && !d.agent_replies) && <p className="mt-4 text-sm text-muted">No messages in the last 7 days.</p>}
          </section>
          <section className="card p-5 lg:col-span-2">
            <h2 className="font-semibold">AI draft quality</h2>
            <dl className="mt-4 divide-y divide-line">
              {rows.map(([label, value]) => (
                <div key={label} className="flex items-center justify-between py-3 text-sm"><dt className="text-muted">{label}</dt><dd className="font-semibold tabular-nums">{value}</dd></div>
              ))}
            </dl>
            {used > 0 && <p className="mt-3 text-sm text-muted">{Math.round((s.drafts_sent_unedited / used) * 100)}% of approved drafts were sent without edits.</p>}
          </section>
        </div>
      )}
    </div>
  );
}
