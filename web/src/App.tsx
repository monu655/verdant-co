import { MessageSquareOff } from "lucide-react";
import { Link, Navigate, Route, Routes } from "react-router-dom";
import { AgentShell } from "./components/AgentShell";
import { EmptyState, Skeleton } from "./components/ui";
import { useAgent } from "./lib/hooks";
import { AnalyticsPage } from "./pages/Analytics";
import { ConversationsPage } from "./pages/Conversations";
import { CustomerView } from "./pages/CustomerView";
import { DashboardPage } from "./pages/Dashboard";
import { KnowledgeBasePage } from "./pages/KnowledgeBase";
import { LoginPage } from "./pages/Login";
import { SettingsPage } from "./pages/Settings";
import { ErrorState } from "./components/ui";

function AgentGate() {
  const me = useAgent();
  if (me.isLoading) return <div className="p-8"><Skeleton className="h-10 w-48" /></div>;
  if (me.isError) return <ErrorState message="Can't reach the server right now." onRetry={() => me.refetch()} />;
  if (!me.data) return <LoginPage />;
  return <AgentShell agent={me.data} />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/customer" replace />} />
      <Route path="/customer" element={<CustomerView />} />
      <Route path="/agent" element={<AgentGate />}>
        <Route index element={<DashboardPage />} />
        <Route path="conversations" element={<ConversationsPage />} />
        <Route path="conversations/:id" element={<ConversationsPage />} />
        <Route path="analytics" element={<AnalyticsPage />} />
        <Route path="knowledge-base" element={<KnowledgeBasePage />} />
        <Route path="settings" element={<SettingsPage />} />
      </Route>
      <Route path="/agent/login" element={<Navigate to="/agent" replace />} />
      <Route path="*" element={<div className="flex min-h-dvh items-center justify-center"><EmptyState icon={<MessageSquareOff aria-hidden className="h-6 w-6" />} title="Page not found" action={<Link className="btn-primary" to="/customer">Go to the app</Link>}>That address doesn't exist.</EmptyState></div>} />
    </Routes>
  );
}
