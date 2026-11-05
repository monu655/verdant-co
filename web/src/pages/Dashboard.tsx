import { useQuery } from "@tanstack/react-query";
import { ArrowRight, BookOpen, CheckCheck, Clock, Inbox, MessageSquare, Sparkles, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { Delta, Ring, Sparkline } from "../components/charts";
import { Avatar, Badge, EmptyState, ErrorState, Skeleton } from "../components/ui";
import { api, type ActivityEvent, type ConversationSummary, type Stats } from "../lib/api";
import { duration, greeting, timeAgo } from "../lib/format";
import { useAgent } from "../lib/hooks";

function Kpi({ icon: Icon, label, value, children, spark, sparkLabel, to }: {
  icon: LucideIcon; label: string; value: string; children: ReactNode; spark?: number[]; sparkLabel?: string; to?: string;
}) {
  const body = (
    <div className="card h-full p-4 transition-shadow hover:shadow-pop sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="hidden h-10 w-10 items-center justify-center rounded-lg bg-mint-100 text-forest-900 sm:flex"><Icon aria-hidden className="h-5 w-5" /></span>
          <p className="text-sm font-medium text-muted">{label}</p>
        </div>
        {spark && <Sparkline values={spark} label={sparkLabel ?? label} className="hidden text-emerald-600 sm:block" />}
      </div>
      <p className="mt-4 text-3xl font-semibold tracking-tight tabular-nums">{value}</p>
      <div className="mt-1.5 min-h-4">{children}</div>
    </div>
  );
  return to ? <Link to={to} className="block rounded-xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-600">{body}</Link> : body;
}

export function DashboardPage() {
  const me = useAgent();
  const stats = useQuery({ queryKey: ["stats"], queryFn: () => api<Stats>("/api/stats"), refetchInterval: 8000 });
  const waiting = useQuery({ queryKey: ["conversations", "needs_reply", "dash"], queryFn: () => api<{ conversations: ConversationSummary[] }>("/api/conversations?filter=needs_reply&limit=6"), refetchInterval: 8000 });
  const activity = useQuery({ queryKey: ["activity"], queryFn: () => api<{ events: ActivityEvent[] }>("/api/activity"), refetchInterval: 8000 });
  const s = stats.data;
  const first = me.data?.name.split(" ")[0];
  const used = s ? s.drafts_sent_unedited + s.drafts_edited : 0;

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm text-muted">{new Date().toLocaleDateString([], { weekday: "long", day: "numeric", month: "long" })}</p>
          <h1 className="mt-0.5 text-2xl font-semibold tracking-tight">{greeting()}{first ? `, ${first}` : ""}</h1>
          <p className="mt-1 text-sm text-muted">
            {!s ? "Loading your queue…" : s.pending_conversations === 0 ? "You're all caught up. New customer messages appear here as they arrive." : `${s.pending_conversations} ${s.pending_conversations === 1 ? "customer is" : "customers are"} waiting for a reply.`}
          </p>
        </div>
        <Link to="/agent/conversations" className="btn-primary"><Inbox aria-hidden className="h-4 w-4" />Open inbox{s && s.pending_conversations > 0 ? ` (${s.pending_conversations})` : ""}</Link>
      </div>

      {stats.isError ? <div className="card"><ErrorState message="Couldn't load the overview." onRetry={() => stats.refetch()} /></div> : (
        <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
          {!s ? Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-40" />) : (<>
            <Kpi icon={MessageSquare} label="Conversations" value={String(s.total_conversations)} spark={s.daily.map((d) => d.customer_messages)} sparkLabel="Customer messages, last 7 days" to="/agent/conversations">
              <Delta now={s.period.new_conversations} before={s.period.prev_new_conversations} suffix="new vs last week" />
            </Kpi>
            <Kpi icon={Inbox} label="Waiting for reply" value={String(s.pending_conversations)} to="/agent/conversations">
              <span className="text-xs text-muted">{s.open_conversations} open · {s.resolved_conversations} resolved</span>
            </Kpi>
            <Kpi icon={CheckCheck} label="Approved replies" value={String(s.approved_replies)} spark={s.daily.map((d) => d.agent_replies)} sparkLabel="Agent replies, last 7 days">
              <Delta now={s.period.agent_replies} before={s.period.prev_agent_replies} suffix="vs last week" />
            </Kpi>
            <Kpi icon={Clock} label="Avg. response time" value={duration(s.avg_response_seconds)}>
              <Delta now={s.period.avg_response_seconds} before={s.period.prev_avg_response_seconds} goodWhen="down" suffix="vs last week" />
            </Kpi>
          </>)}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <section className="card min-w-0 lg:col-span-2">
          <div className="flex items-center justify-between border-b border-line px-5 py-4">
            <h2 className="font-semibold">Needs your attention</h2>
            <Link to="/agent/conversations" className="inline-flex items-center gap-1 text-sm font-medium text-emerald-600 hover:underline">View all<ArrowRight aria-hidden className="h-3.5 w-3.5" /></Link>
          </div>
          {waiting.isLoading && <div className="space-y-3 p-5"><Skeleton className="h-14" /><Skeleton className="h-14" /></div>}
          {waiting.isError && <ErrorState message="Couldn't load conversations." onRetry={() => waiting.refetch()} />}
          {waiting.data?.conversations.length === 0 && <EmptyState icon={<CheckCheck aria-hidden className="h-6 w-6" />} title="No one is waiting">Every open conversation has an agent reply.</EmptyState>}
          <ul className="divide-y divide-line">
            {waiting.data?.conversations.map((c) => (
              <li key={c.id}>
                <Link to={`/agent/conversations/${c.id}`} className="flex items-center gap-3 px-5 py-3.5 transition-colors hover:bg-mint-50/60">
                  <Avatar name={c.customer_name} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium">{c.customer_name}</span>
                      {c.unread > 0 && <Badge tone="green">{c.unread} new</Badge>}
                    </span>
                    <span className="block truncate text-sm text-muted">{c.last_body}</span>
                  </span>
                  <span className="hidden shrink-0 flex-col items-end gap-1 sm:flex">
                    <span className="text-xs text-muted">{timeAgo(c.last_message_at)}</span>
                    {c.has_draft && <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600"><Sparkles aria-hidden className="h-3 w-3" />Draft ready</span>}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <div className="min-w-0 space-y-6">
          <section className="card p-5">
            <h2 className="font-semibold">AI assistant</h2>
            {!s ? <Skeleton className="mt-4 h-28" /> : (
              <div className="mt-4 flex items-center gap-5">
                <Ring value={s.drafts_sent_unedited} total={used} label="Drafts sent without edits" />
                <div className="min-w-0 text-sm">
                  <p className="font-medium">{used > 0 ? "Sent without edits" : "No approved drafts yet"}</p>
                  <p className="mt-1 text-muted">{s.drafts_total} drafts written · {s.drafts_escalated} flagged for a person{s.drafts_failed ? ` · ${s.drafts_failed} failed` : ""}</p>
                </div>
              </div>
            )}
            <Link to="/agent/knowledge-base" className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-emerald-600 hover:underline"><BookOpen aria-hidden className="h-4 w-4" />Improve answers in the knowledge base</Link>
          </section>

          <section className="card">
            <h2 className="border-b border-line px-5 py-4 font-semibold">Recent activity</h2>
            {activity.isLoading && <div className="space-y-3 p-5"><Skeleton className="h-10" /><Skeleton className="h-10" /></div>}
            {activity.isError && <ErrorState message="Couldn't load activity." onRetry={() => activity.refetch()} />}
            {activity.data?.events.length === 0 && <p className="px-5 py-8 text-center text-sm text-muted">Nothing yet. Messages will show up here.</p>}
            <ol className="max-h-80 divide-y divide-line overflow-y-auto">
              {activity.data?.events.slice(0, 8).map((e) => (
                <li key={e.id}>
                  <Link to={`/agent/conversations/${e.conversation_id}`} className="flex gap-3 px-5 py-3 hover:bg-mint-50/60">
                    <span aria-hidden className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${e.sender === "customer" ? "bg-emerald-600" : "bg-forest-900"}`} />
                    <span className="min-w-0 flex-1 text-sm">
                      <span className="block truncate"><b className="font-medium">{e.sender === "customer" ? e.customer_name : "You replied to " + e.customer_name}</b></span>
                      <span className="block truncate text-muted">{e.body}</span>
                    </span>
                    <span className="shrink-0 text-xs text-muted">{timeAgo(e.created_at)}</span>
                  </Link>
                </li>
              ))}
            </ol>
          </section>
        </div>
      </div>
    </div>
  );
}
