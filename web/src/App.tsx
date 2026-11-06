import { MessageSquareOff } from "lucide-react";
import { Link, Navigate, Route, Routes } from "react-router-dom";
import { Suspense, lazy } from "react";
import { AgentShell } from "./components/AgentShell";
import { EmptyState, Skeleton } from "./components/ui";
import { useAgent } from "./lib/hooks";
import { ErrorState } from "./components/ui";

const page = <T extends string>(load: () => Promise<Record<T, React.ComponentType>>, name: T) => lazy(() => load().then((m) => ({ default: m[name] })));
const AnalyticsPage = page(() => import("./pages/Analytics"), "AnalyticsPage");
const ConversationsPage = page(() => import("./pages/Conversations"), "ConversationsPage");
const CustomerView = page(() => import("./pages/CustomerView"), "CustomerView");
const DashboardPage = page(() => import("./pages/Dashboard"), "DashboardPage");
const KnowledgeBasePage = page(() => import("./pages/KnowledgeBase"), "KnowledgeBasePage");
const LoginPage = page(() => import("./pages/Login"), "LoginPage");
const SettingsPage = page(() => import("./pages/Settings"), "SettingsPage");

const Loading = () => <div className="p-6" aria-busy="true"><Skeleton className="h-10 w-56" /><Skeleton className="mt-4 h-40" /></div>;

function AgentGate() {
  const me = useAgent();
  if (me.isLoading) return <div className="p-8"><Skeleton className="h-10 w-48" /></div>;
  if (me.isError) return <ErrorState message="Can't reach the server right now." onRetry={() => me.refetch()} />;
  if (!me.data) return <Suspense fallback={<Loading />}><LoginPage /></Suspense>;
  return <AgentShell agent={me.data} />;
}

export default function App() {
  return (
    <Suspense fallback={<Loading />}>
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
    </Suspense>
  );
}
