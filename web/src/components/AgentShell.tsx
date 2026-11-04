import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BarChart3, BookOpen, LayoutDashboard, LogOut, MessageSquare, Settings, type LucideIcon } from "lucide-react";
import { useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { api, type Agent, type Stats } from "../lib/api";
import { AgentTopBar } from "./TopBar";
import { Avatar, ConfirmDialog, Logo, useToast } from "./ui";

interface NavItem { to: string; label: string; short?: string; icon: LucideIcon; end?: boolean; badge?: "pending" }
const GROUPS: { title: string; items: NavItem[] }[] = [
  {
    title: "Workspace",
    items: [
      { to: "/agent", label: "Dashboard", icon: LayoutDashboard, end: true },
      { to: "/agent/conversations", label: "Conversations", short: "Chats", icon: MessageSquare, badge: "pending" },
    ],
  },
  {
    title: "Insights",
    items: [
      { to: "/agent/analytics", label: "Analytics", icon: BarChart3 },
      { to: "/agent/knowledge-base", label: "Knowledge Base", short: "Knowledge", icon: BookOpen },
    ],
  },
  { title: "Account", items: [{ to: "/agent/settings", label: "Settings", icon: Settings }] },
];
const ALL_ITEMS = GROUPS.flatMap((g) => g.items);

function readCollapsed() { try { return localStorage.getItem("vc.sidebar") === "1"; } catch { return false; } }
const fmt = (n: number) => (n > 99 ? "99+" : String(n));

export function AgentShell({ agent }: { agent: Agent }) {
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const [confirm, setConfirm] = useState(false);
  const qc = useQueryClient();
  const nav = useNavigate();
  const toast = useToast();

  // Same query key as the dashboard, so this costs no extra requests.
  const stats = useQuery({ queryKey: ["stats"], queryFn: () => api<Stats>("/api/stats"), refetchInterval: 8000 });
  const pending = stats.data?.pending_conversations ?? 0;

  const logout = useMutation({
    mutationFn: () => api("/api/auth/logout", { method: "POST" }),
    onSuccess: () => { qc.clear(); qc.setQueryData(["me"], null); setConfirm(false); toast.push("success", "Signed out"); nav("/agent/login"); },
    onError: () => toast.push("error", "Couldn't sign out. Try again."),
  });
  const toggle = () => setCollapsed((c) => { try { localStorage.setItem("vc.sidebar", c ? "0" : "1"); } catch { /* ignore */ } return !c; });

  return (
    <div className="flex h-dvh overflow-hidden">
      <aside className={`hidden shrink-0 flex-col bg-forest-950 py-4 text-mint-100 transition-[width] duration-200 lg:flex ${collapsed ? "w-[72px] px-3" : "w-64 px-4"}`}>
        <div className={`mb-5 flex items-center ${collapsed ? "justify-center" : "px-2"}`}><Logo compact={collapsed} light /></div>

        <nav aria-label="Main" className="flex flex-1 flex-col gap-4 overflow-y-auto">
          {GROUPS.map((group) => (
            <div key={group.title} className="flex flex-col gap-1">
              {collapsed
                ? <span aria-hidden className="mx-3 mb-1 h-px bg-mint-100/10" />
                : <p className="px-3 pb-1 text-xs font-medium text-mint-100/50">{group.title}</p>}
              {group.items.map(({ to, label, icon: Icon, end, badge }) => {
                const count = badge === "pending" ? pending : 0;
                return (
                  <NavLink key={to} to={to} end={end} title={collapsed ? (count ? `${label} (${count} waiting)` : label) : undefined}
                    aria-label={collapsed ? (count ? `${label}, ${count} waiting` : label) : undefined}
                    className={({ isActive }) => `relative flex h-11 items-center gap-3 rounded-lg text-sm font-medium transition-colors ${collapsed ? "justify-center" : "px-3"} ${isActive ? "bg-forest-900 text-white" : "text-mint-100/80 hover:bg-forest-900/60 hover:text-white"}`}>
                    {({ isActive }) => (<>
                      {isActive && <span aria-hidden className="absolute -left-4 top-2 h-7 w-1 rounded-r bg-emerald-600" />}
                      <span className="relative shrink-0">
                        <Icon aria-hidden className="h-5 w-5" />
                        {collapsed && count > 0 && <span aria-hidden className="absolute -right-1.5 -top-1.5 h-2.5 w-2.5 rounded-full bg-emerald-400 ring-2 ring-forest-950" />}
                      </span>
                      {!collapsed && <span className="flex-1 truncate">{label}</span>}
                      {!collapsed && count > 0 && (
                        <span aria-label={`${count} waiting`} className="flex h-5 min-w-5 items-center justify-center rounded-full bg-emerald-600 px-1.5 text-xs font-semibold text-white">{fmt(count)}</span>
                      )}
                    </>)}
                  </NavLink>
                );
              })}
            </div>
          ))}
        </nav>

        <div className={`mt-3 border-t border-mint-100/10 pt-3 ${collapsed ? "flex flex-col items-center gap-2" : ""}`}>
          <div className={`flex items-center gap-3 ${collapsed ? "" : "rounded-lg px-2 py-1.5"}`}>
            <Avatar name={agent.name} size={36} />
            {!collapsed && (
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-white">{agent.name}</p>
                <p className="truncate text-xs text-mint-100/60">{agent.email}</p>
              </div>
            )}
            {!collapsed && (
              <button aria-label="Sign out" title="Sign out" onClick={() => setConfirm(true)} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-mint-100/70 transition-colors hover:bg-forest-900/60 hover:text-white">
                <LogOut aria-hidden className="h-5 w-5" />
              </button>
            )}
          </div>
          {collapsed && (
            <button aria-label="Sign out" title="Sign out" onClick={() => setConfirm(true)} className="flex h-10 w-10 items-center justify-center rounded-lg text-mint-100/70 transition-colors hover:bg-forest-900/60 hover:text-white">
              <LogOut aria-hidden className="h-5 w-5" />
            </button>
          )}
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <AgentTopBar agent={agent} collapsed={collapsed} onToggleSidebar={toggle} />
        <main className="min-h-0 flex-1 overflow-y-auto pb-[calc(4rem+env(safe-area-inset-bottom))] lg:pb-0"><Outlet /></main>
        <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-30 flex border-t border-line bg-white pb-[env(safe-area-inset-bottom)] lg:hidden">
          {ALL_ITEMS.map(({ to, label, short, icon: Icon, end, badge }) => {
            const count = badge === "pending" ? pending : 0;
            return (
              <NavLink key={to} to={to} end={end} aria-label={count ? `${label}, ${count} waiting` : label}
                className={({ isActive }) => `flex h-16 flex-1 flex-col items-center justify-center gap-1 text-[11px] font-medium ${isActive ? "text-forest-900" : "text-muted"}`}>
                {({ isActive }) => (<>
                  <span className={`relative flex h-7 w-12 items-center justify-center rounded-full ${isActive ? "bg-mint-100" : ""}`}>
                    <Icon aria-hidden className="h-5 w-5" />
                    {count > 0 && <span aria-hidden className="absolute right-1 top-0 flex h-4 min-w-4 items-center justify-center rounded-full bg-emerald-600 px-1 text-[10px] font-semibold text-white">{fmt(count)}</span>}
                  </span>
                  {short ?? label}
                </>)}
              </NavLink>
            );
          })}
        </nav>
      </div>
      <ConfirmDialog open={confirm} title="Sign out?" body="You'll need to sign in again to review conversations." confirmLabel="Sign out" busy={logout.isPending} onConfirm={() => logout.mutate()} onCancel={() => setConfirm(false)} />
    </div>
  );
}