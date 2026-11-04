import { useQuery } from "@tanstack/react-query";
import { ErrorState, Skeleton } from "../components/ui";
import { api } from "../lib/api";

export function KnowledgeBasePage() {
  const q = useQuery({ queryKey: ["kb"], queryFn: () => api<{ entries: { topic: string; policy: string }[] }>("/api/knowledge-base"), staleTime: Infinity });
  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4 sm:p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Knowledge base</h1>
        <p className="mt-1 text-sm text-muted">The only policies the AI uses when it drafts a reply. If a question isn't covered here, the draft says so and flags it for a human.</p>
      </div>
      {q.isError ? <div className="card"><ErrorState message="Couldn't load the knowledge base." onRetry={() => q.refetch()} /></div> : !q.data ? <Skeleton className="h-96" /> : (
        <dl className="card divide-y divide-line">
          {q.data.entries.map((e) => (
            <div key={e.topic} className="grid gap-1 px-5 py-4 sm:grid-cols-[160px_1fr] sm:gap-6">
              <dt className="font-medium text-forest-900">{e.topic}</dt>
              <dd className="text-sm leading-relaxed">{e.policy}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}
