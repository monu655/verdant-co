import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, ChevronDown, LogOut, PanelLeftClose, PanelLeftOpen, Search, Settings, X } from "lucide-react";
import { useCallback, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, type Agent, type ConversationSummary, type Stats } from "../lib/api";
import { shortTime } from "../lib/format";
import { useClickOutside, useDebounced } from "../lib/hooks";
import { ModeSwitch } from "./ModeSwitch";
import { Avatar, ConfirmDialog, Logo, Skeleton, Spinner, useToast } from "./ui";

function GlobalSearch({ onDone }: { onDone?: () => void }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const nav = useNavigate();
  const dq = useDebounced(q.trim());
  const close = useCallback(() => setOpen(false), []);
  const ref = useClickOutside<HTMLDivElement>(close, open);
  const results = useQuery({
    queryKey: ["search", dq],
    queryFn: () => api<{ conversations: ConversationSummary[] }>(`/api/conversations?filter=all&limit=6&q=${encodeURIComponent(dq)}`),
    enabled: dq.length > 0,
  });
  return (
    <div ref={ref} className="relative w-full">
      <label className="sr-only" htmlFor="global-search">Search conversations</label>
      <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
      <input id="global-search" className="input pl-9" placeholder="Search by name, phone or message" value={q} autoComplete="off"
        onChange={(e) => { setQ(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)} />
      {open && dq.length > 0 && (
        <div className="absolute left-0 right-0 top-12 z-40 max-h-96 overflow-auto rounded-xl border border-line bg-white p-1 shadow-pop">
          {results.isLoading && <div className="space-y-2 p-3"><Skeleton className="h-8" /><Skeleton className="h-8" /></div>}
          {results.isError && <p className="p-3 text-sm text-danger">Search failed. Try again.</p>}
          {results.data?.conversations.length === 0 && <p className="p-3 text-sm text-muted">No conversations match “{dq}”.</p>}
          {results.data?.conversations.map((c) => (
            <button key={c.id} className="flex w-full items-center gap-3 rounded-lg p-2.5 text-left hover:bg-mint-50"
              onClick={() => { setOpen(false); setQ(""); onDone?.(); nav(`/agent/conversations/${c.id}`); }}>
              <Avatar name={c.customer_name} size={32} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{c.customer_name}</span>
                <span className="block truncate text-xs text-muted">{c.last_body}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Notifications() {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const ref = useClickOutside<HTMLDivElement>(close, open);
  const stats = useQuery({ queryKey: ["stats"], queryFn: () => api<Stats>("/api/stats"), refetchInterval: 8000 });
  const unread = useQuery({ queryKey: ["unread"], queryFn: () => api<{ conversations: ConversationSummary[] }>("/api/conversations?filter=unread&limit=6"), refetchInterval: 8000, enabled: open });
  const count = stats.data?.pending_conversations ?? 0;
  return (
    <div ref={ref} className="relative">
      <button aria-label={count ? `Notifications, ${count} conversations waiting` : "Notifications"} aria-expanded={open} className="btn-ghost relative h-10 w-10 px-0" onClick={() => setOpen((o) => !o)}>
        <Bell aria-hidden className="h-5 w-5" />
        {count > 0 && <span className="absolute right-1.5 top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-semibold text-white">{count > 9 ? "9+" : count}</span>}
      </button>
      {open && (
        <div className="absolute right-0 top-12 z-40 w-80 max-w-[calc(100vw-2rem)] rounded-xl border border-line bg-white p-1 shadow-pop">
          <p className="px-3 py-2 text-sm font-semibold">Waiting for a reply</p>
          {unread.isLoading && <div className="space-y-2 p-3"><Skeleton className="h-8" /><Skeleton className="h-8" /></div>}
          {unread.data?.conversations.length === 0 && <p className="px-3 pb-4 text-sm text-muted">You're all caught up. New customer messages show up here.</p>}
          {unread.data?.conversations.map((c) => (
            <Link key={c.id} to={`/agent/conversations/${c.id}`} onClick={() => setOpen(false)} className="flex items-center gap-3 rounded-lg p-2.5 hover:bg-mint-50">
              <Avatar name={c.customer_name} size={32} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{c.customer_name}</span>
                <span className="block truncate text-xs text-muted">{c.last_body}</span>
              </span>
              <span className="text-xs text-muted">{shortTime(c.last_message_at)}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

export function ProfileMenu({ agent }: { agent: Agent }) {
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const ref = useClickOutside<HTMLDivElement>(close, open);
  const qc = useQueryClient();
  const nav = useNavigate();
  const toast = useToast();
  const logout = useMutation({
    mutationFn: () => api("/api/auth/logout", { method: "POST" }),
    onSuccess: () => { qc.clear(); qc.setQueryData(["me"], null); setConfirm(false); toast.push("success", "Signed out"); nav("/agent/login"); },
    onError: () => toast.push("error", "Couldn't sign out. Try again."),
  });
  return (
    <div ref={ref} className="relative">
      <button aria-label="Open profile menu" aria-expanded={open} className="flex items-center gap-1.5 rounded-full p-0.5 pr-1.5 hover:bg-mint-50" onClick={() => setOpen((o) => !o)}>
        <Avatar name={agent.name} size={34} /><ChevronDown aria-hidden className="hidden h-4 w-4 text-muted sm:block" />
      </button>
      {open && (
        <div className="absolute right-0 top-12 z-40 w-60 rounded-xl border border-line bg-white p-1 shadow-pop">
          <div className="border-b border-line px-3 py-2.5">
            <p className="truncate text-sm font-semibold">{agent.name}</p>
            <p className="truncate text-xs text-muted">{agent.email}</p>
          </div>
          <Link to="/agent/settings" onClick={() => setOpen(false)} className="flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm hover:bg-mint-50"><Settings aria-hidden className="h-4 w-4" />Settings</Link>
          <button className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm hover:bg-mint-50" onClick={() => { setOpen(false); setConfirm(true); }}><LogOut aria-hidden className="h-4 w-4" />Sign out</button>
        </div>
      )}
      <ConfirmDialog open={confirm} title="Sign out?" body="You'll need to sign in again to review conversations." confirmLabel="Sign out" busy={logout.isPending} onConfirm={() => logout.mutate()} onCancel={() => setConfirm(false)} />
    </div>
  );
}

export function AgentTopBar({ agent, collapsed, onToggleSidebar }: { agent: Agent; collapsed: boolean; onToggleSidebar: () => void }) {
  const [mobileSearch, setMobileSearch] = useState(false);
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-white/95 pt-[env(safe-area-inset-top)] backdrop-blur-sm">
      <div className="flex h-16 items-center gap-3 px-3 sm:px-5">
        <button aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"} className="btn-ghost hidden h-10 w-10 px-0 lg:inline-flex" onClick={onToggleSidebar}>
          {collapsed ? <PanelLeftOpen aria-hidden className="h-5 w-5" /> : <PanelLeftClose aria-hidden className="h-5 w-5" />}
        </button>
        <span className="lg:hidden"><Logo compact /></span>
        <ModeSwitch />
        <div className="mx-auto hidden w-full max-w-md md:block"><GlobalSearch /></div>
        <div className="ml-auto flex items-center gap-1 md:ml-0">
          <button aria-label="Search conversations" className="btn-ghost h-10 w-10 px-0 md:hidden" onClick={() => setMobileSearch((s) => !s)}>{mobileSearch ? <X aria-hidden className="h-5 w-5" /> : <Search aria-hidden className="h-5 w-5" />}</button>
          <Notifications />
          <ProfileMenu agent={agent} />
        </div>
      </div>
      {mobileSearch && <div className="border-t border-line p-3 md:hidden"><GlobalSearch onDone={() => setMobileSearch(false)} /></div>}
    </header>
  );
}

export function CustomerTopBar() {
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-white/95 pt-[env(safe-area-inset-top)] backdrop-blur-sm">
      <div className="mx-auto flex h-16 max-w-3xl items-center justify-between gap-3 px-4">
        <Logo />
        <ModeSwitch />
      </div>
    </header>
  );
}

export { Spinner };
