import { BarChart3, BookOpen, LayoutDashboard, LogOut, MessageSquare, Settings } from "lucide-react";
import { useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { api, type Agent } from "../lib/api";
import { AgentTopBar } from "./TopBar";
import { ConfirmDialog, Logo, useToast } from "./ui";

const NAV = [
  { to: "/agent", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/agent/conversations", label: "Conversations", icon: MessageSquare },
  { to: "/agent/analytics", label: "Analytics", icon: BarChart3 },
  { to: "/agent/knowledge-base", label: "Knowledge Base", icon: BookOpen },
  { to: "/agent/settings", label: "Settings", icon: Settings },
];

function readCollapsed() { try { return localStorage.getItem("vc.sidebar") === "1"; } catch { return false; } }

export function AgentShell({ agent }: { agent: Agent }) {
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const [confirm, setConfirm] = useState(false);
  const qc = useQueryClient();
  const nav = useNavigate();
  const toast = useToast();
  const logout = useMutation({
    mutationFn: () => api("/api/auth/logout", { method: "POST" }),
    onSuccess: () => { qc.clear(); qc.setQueryData(["me"], null); setConfirm(false); toast.push("success", "Signed out"); nav("/agent/login"); },
    onError: () => toast.push("error", "Couldn't sign out. Try again."),
  });
  const toggle = () => setCollapsed((c) => { try { localStorage.setItem("vc.sidebar", c ? "0" : "1"); } catch { /* ignore */ } return !c; });

  return (
    <div className="flex h-dvh overflow-hidden">
      <aside className={`hidden shrink-0 flex-col bg-forest-950 py-4 text-mint-100 transition-[width] duration-200 lg:flex ${collapsed ? "w-[72px] px-3" : "w-64 px-4"}`}>
        <div className={`mb-6 flex items-center ${collapsed ? "justify-center" : "px-2"}`}><Logo compact={collapsed} light /></div>
        <nav aria-label="Main" className="flex flex-1 flex-col gap-1">
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink key={to} to={to} end={end} title={collapsed ? label : undefined} aria-label={collapsed ? label : undefined}
              className={({ isActive }) => `relative flex h-11 items-center gap-3 rounded-lg text-sm font-medium transition-colors ${collapsed ? "justify-center" : "px-3"} ${isActive ? "bg-forest-900 text-white" : "text-mint-100/80 hover:bg-forest-900/60 hover:text-white"}`}>
              {({ isActive }) => (<>
                {isActive && <span aria-hidden className="absolute -left-4 top-2 h-7 w-1 rounded-r bg-emerald-600" />}
                <Icon aria-hidden className="h-5 w-5 shrink-0" />{!collapsed && label}
              </>)}
            </NavLink>
          ))}
        </nav>
        <button title={collapsed ? "Sign out" : undefined} aria-label="Sign out" onClick={() => setConfirm(true)}
          className={`flex h-11 items-center gap-3 rounded-lg text-sm font-medium text-mint-100/80 transition-colors hover:bg-forest-900/60 hover:text-white ${collapsed ? "justify-center" : "px-3"}`}>
          <LogOut aria-hidden className="h-5 w-5 shrink-0" />{!collapsed && "Sign out"}
        </button>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <AgentTopBar agent={agent} collapsed={collapsed} onToggleSidebar={toggle} />
        <main className="min-h-0 flex-1 overflow-y-auto pb-[calc(4rem+env(safe-area-inset-bottom))] lg:pb-0"><Outlet /></main>
        <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-30 flex border-t border-line bg-white pb-[env(safe-area-inset-bottom)] lg:hidden">
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink key={to} to={to} end={end} className={({ isActive }) => `flex h-16 flex-1 flex-col items-center justify-center gap-1 text-[11px] font-medium ${isActive ? "text-forest-900" : "text-muted"}`}>
              {({ isActive }) => (<>
                <span className={`flex h-7 w-12 items-center justify-center rounded-full ${isActive ? "bg-mint-100" : ""}`}><Icon aria-hidden className="h-5 w-5" /></span>
                {label === "Knowledge Base" ? "Knowledge" : label === "Conversations" ? "Chats" : label}
              </>)}
            </NavLink>
          ))}
        </nav>
      </div>
      <ConfirmDialog open={confirm} title="Sign out?" body="You'll need to sign in again to review conversations." confirmLabel="Sign out" busy={logout.isPending} onConfirm={() => logout.mutate()} onCancel={() => setConfirm(false)} />
    </div>
  );
}
