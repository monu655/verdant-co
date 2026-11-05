import { useQuery } from "@tanstack/react-query";
import { Clock, Download, MessageSquare, Reply, Sparkles, type LucideIcon } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Delta, MessagesChart, Ring } from "../components/charts";
import { ErrorState, Skeleton } from "../components/ui";
import { api, type Stats } from "../lib/api";
import { duration } from "../lib/format";

type Range = 7 | 30;

function Kpi({ icon: Icon, label, value, children }: { icon: LucideIcon; label: string; value: string; children: ReactNode }) {
  return (
    <div className="card p-4 sm:p-5">
      <div className="flex items-center gap-3">
        <span className="hidden h-9 w-9 items-center justify-center rounded-lg bg-mint-100 text-forest-900 sm:flex"><Icon aria-hidden className="h-[18px] w-[18px]" /></span>
        <p className="text-sm font-medium text-muted">{label}</p>
      </div>
      <p className="mt-3 text-3xl font-semibold tracking-tight tabular-nums">{value}</p>
      <div className="mt-1.5">{children}</div>
    </div>
  );
}

function downloadCsv(s: Stats) {
  const rows = [["date", "customer_messages", "agent_replies"], ...s.daily.map((d) => [d.day, d.customer_messages, d.agent_replies])];
  const blob = new Blob([rows.map((r) => r.join(",")).join("\n")], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = `verdant-messages-last-${s.days}-days.csv`; a.click();
  URL.revokeObjectURL(url);
}

export function AnalyticsPage() {
  const [range, setRange] = useState<Range>(7);
  const q = useQuery({ queryKey: ["stats", range], queryFn: () => api<Stats>(`/api/stats?days=${range}`), refetchInterval: 15000, placeholderData: (prev) => prev });
  const s = q.data;
  const used = s ? s.drafts_sent_unedited + s.drafts_edited : 0;
  const maxTopic = Math.max(1, ...(s?.topics.map((t) => t.count) ?? [1]));
  const topicTotal = s?.topics.reduce((a, t) => a + t.count, 0) ?? 0;
  const outcomes = s ? [
    { label: "Sent as written", value: s.drafts_sent_unedited, color: "bg-emerald-600" },
    { label: "Edited before sending", value: s.drafts_edited, color: "bg-forest-900" },
    { label: "Flagged for a person", value: s.drafts_escalated, color: "bg-amber-500" },
    { label: "Failed (provider error)", value: s.drafts_failed, color: "bg-red-600" },
  ] : [];
  const outcomeMax = Math.max(1, ...outcomes.map((o) => o.value));

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Analytics</h1>
          <p className="mt-1 text-sm text-muted">Calculated from stored messages and drafts. Nothing here is sample data.</p>
        </div>
        <div className="flex items-center gap-2">
          <div role="group" aria-label="Time range" className="flex rounded-lg border border-line bg-white p-0.5">
            {([7, 30] as const).map((r) => (
              <button key={r} type="button" aria-pressed={range === r} onClick={() => setRange(r)}
                className={`h-8 rounded-md px-3 text-sm font-medium transition-colors ${range === r ? "bg-forest-900 text-white" : "text-muted hover:text-forest-900"}`}>{r} days</button>
            ))}
          </div>
          <button type="button" className="btn-secondary h-10" disabled={!s} onClick={() => s && downloadCsv(s)}><Download aria-hidden className="h-4 w-4" />Export CSV</button>
        </div>
      </div>

      {q.isError && !s ? <div className="card"><ErrorState message="Couldn't load analytics." onRetry={() => q.refetch()} /></div> : !s ? (
        <div className="space-y-6"><div className="grid gap-4 sm:grid-cols-3"><Skeleton className="h-32" /><Skeleton className="h-32" /><Skeleton className="h-32" /></div><Skeleton className="h-80" /></div>
      ) : (<>
        <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
          <Kpi icon={MessageSquare} label="Customer messages" value={String(s.period.customer_messages)}><Delta now={s.period.customer_messages} before={s.period.prev_customer_messages} suffix={`vs previous ${range} days`} /></Kpi>
          <Kpi icon={Reply} label="Agent replies" value={String(s.period.agent_replies)}><Delta now={s.period.agent_replies} before={s.period.prev_agent_replies} suffix={`vs previous ${range} days`} /></Kpi>
          <Kpi icon={Clock} label="Avg. response time" value={duration(s.period.avg_response_seconds)}><Delta now={s.period.avg_response_seconds} before={s.period.prev_avg_response_seconds} goodWhen="down" suffix={`vs previous ${range} days`} /></Kpi>
          <Kpi icon={Sparkles} label="Drafts sent unedited" value={used ? `${Math.round((s.drafts_sent_unedited / used) * 100)}%` : "No data yet"}>
            <span className="text-xs text-muted">{used} approved drafts, all time</span>
          </Kpi>
        </div>

        <div className="grid gap-6 lg:grid-cols-5">
          <section className="card min-w-0 p-5 lg:col-span-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-semibold">Messages, last {range} days</h2>
              <ul className="flex gap-4 text-xs text-muted">
                <li className="flex items-center gap-1.5"><span aria-hidden className="h-2.5 w-2.5 rounded-sm bg-emerald-600" />Customer</li>
                <li className="flex items-center gap-1.5"><span aria-hidden className="h-2.5 w-2.5 rounded-sm bg-forest-900" />Agent replies</li>
              </ul>
            </div>
            <div className="mt-8"><MessagesChart daily={s.daily} /></div>
            {s.daily.every((d) => !d.customer_messages && !d.agent_replies) && <p className="mt-2 text-sm text-muted">No messages in this period.</p>}
          </section>

          <section className="card min-w-0 p-5 lg:col-span-2">
            <h2 className="font-semibold">AI draft quality</h2>
            <div className="mt-4 flex items-center gap-5">
              <Ring value={s.drafts_sent_unedited} total={used} label="Drafts sent without edits" size={96} />
              <p className="text-sm text-muted">{used ? "of approved drafts were sent exactly as the AI wrote them." : "Approve a draft to see how often the AI gets it right."}</p>
            </div>
            <ul className="mt-5 space-y-3">
              {outcomes.map((o) => (
                <li key={o.label}>
                  <div className="flex justify-between text-sm"><span className="text-muted">{o.label}</span><span className="font-semibold tabular-nums">{o.value}</span></div>
                  <div className="mt-1 h-1.5 rounded-full bg-mint-100"><div className={`h-full rounded-full ${o.color} transition-[width] duration-500`} style={{ width: `${(o.value / outcomeMax) * 100}%` }} /></div>
                </li>
              ))}
            </ul>
            <p className="mt-4 text-xs text-muted">{s.drafts_total} drafts generated in total.</p>
          </section>
        </div>

        <section className="card p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-semibold">What customers ask about</h2>
            <p className="text-xs text-muted">Last {range} days, matched by keywords in customer messages</p>
          </div>
          {topicTotal === 0 ? <p className="mt-4 text-sm text-muted">No messages in this period match a topic yet.</p> : (
            <ul className="mt-4 grid gap-x-10 gap-y-4 md:grid-cols-2">
              {s.topics.map((t) => (
                <li key={t.label}>
                  <div className="flex justify-between text-sm"><span>{t.label}</span><span className="font-semibold tabular-nums">{t.count}</span></div>
                  <div className="mt-1.5 h-2 rounded-full bg-mint-100"><div className="h-full rounded-full bg-emerald-600 transition-[width] duration-500" style={{ width: `${(t.count / maxTopic) * 100}%` }} /></div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </>)}
    </div>
  );
}
