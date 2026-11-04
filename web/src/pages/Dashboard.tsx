import { useQuery } from "@tanstack/react-query";
import { CheckCheck, Clock, Inbox, MessageSquare, type LucideIcon } from "lucide-react";
import { Link } from "react-router-dom";
import { Avatar, EmptyState, ErrorState, Skeleton } from "../components/ui";
import { api, type ConversationSummary, type Stats } from "../lib/api";
import { duration, shortTime } from "../lib/format";

function StatCard({ icon: Icon, label, value, hint }: { icon: LucideIcon; label: string; value: string; hint: string }) {
  return (
    <div className="card p-5">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-mint-100 text-forest-900"><Icon aria-hidden className="h-5 w-5" /></span>
        <p className="text-sm font-medium text-muted">{label}</p>
      </div>
      <p className="mt-4 text-3xl font-semibold tracking-tight">{value}</p>
      <p className="mt-1 text-xs text-muted">{hint}</p>
    </div>
  );
}

export function DashboardPage() {
  const stats = useQuery({ queryKey: ["stats"], queryFn: () => api<Stats>("/api/stats"), refetchInterval: 8000 });
  const waiting = useQuery({ queryKey: ["conversations", "needs_reply", "dash"], queryFn: () => api<{ conversations: ConversationSummary[] }>("/api/conversations?filter=needs_reply&limit=6"), refetchInterval: 8000 });
  const s = stats.data;
  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="mt-1 text-sm text-muted">Live figures from your conversation records.</p>
      </div>
      {stats.isError ? <div className="card"><ErrorState message="Couldn't load the overview." onRetry={() => stats.refetch()} /></div> : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {!s ? Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-36" />) : (<>
            <StatCard icon={MessageSquare} label="Total conversations" value={String(s.total_conversations)} hint="Open and resolved" />
            <StatCard icon={Inbox} label="Pending conversations" value={String(s.pending_conversations)} hint="Open, waiting for an agent reply" />
            <StatCard icon={CheckCheck} label="Approved replies" value={String(s.approved_replies)} hint="Replies sent by agents" />
            <StatCard icon={Clock} label="Average response time" value={duration(s.avg_response_seconds)} hint="Customer message to first agent reply" />
          </>)}
        </div>
      )}
      <section className="card">
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <h2 className="font-semibold">Waiting for a reply</h2>
          <Link to="/agent/conversations" className="text-sm font-medium text-emerald-600 hover:underline">Open conversations</Link>
        </div>
        {waiting.isLoading && <div className="space-y-3 p-5"><Skeleton className="h-12" /><Skeleton className="h-12" /></div>}
        {waiting.isError && <ErrorState message="Couldn't load conversations." onRetry={() => waiting.refetch()} />}
        {waiting.data?.conversations.length === 0 && <EmptyState icon={<CheckCheck aria-hidden className="h-6 w-6" />} title="No one is waiting">Every open conversation has an agent reply. New customer messages appear here.</EmptyState>}
        <ul className="divide-y divide-line">
          {waiting.data?.conversations.map((c) => (
            <li key={c.id}>
              <Link to={`/agent/conversations/${c.id}`} className="flex items-center gap-3 px-5 py-3.5 hover:bg-mint-50/60">
                <Avatar name={c.customer_name} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{c.customer_name}</span>
                  <span className="block truncate text-sm text-muted">{c.last_body}</span>
                </span>
                <span className="text-xs text-muted">{shortTime(c.last_message_at)}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
