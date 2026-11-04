import { useQuery } from "@tanstack/react-query";
import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { ErrorState, Skeleton, useToast } from "../components/ui";
import { api, type Agent } from "../lib/api";

interface SettingsData { agent: Agent; brandId: string; webhookPath: string; signatureHeader: string; signatureFormat: string }

function CopyField({ label, value }: { label: string; value: string }) {
  const [done, setDone] = useState(false);
  const toast = useToast();
  const copy = async () => {
    try { await navigator.clipboard.writeText(value); setDone(true); setTimeout(() => setDone(false), 1800); }
    catch { toast.push("error", "Couldn't copy. Select the text and copy it manually."); }
  };
  return (
    <div className="space-y-1.5">
      <p className="text-sm font-medium">{label}</p>
      <div className="flex items-center gap-2">
        <code className="min-w-0 flex-1 overflow-x-auto whitespace-nowrap rounded-lg border border-line bg-canvas px-3 py-2.5 text-sm">{value}</code>
        <button className="btn-secondary h-10 w-10 shrink-0 px-0" aria-label={`Copy ${label}`} onClick={copy}>{done ? <Check aria-hidden className="h-4 w-4 text-ok" /> : <Copy aria-hidden className="h-4 w-4" />}</button>
      </div>
    </div>
  );
}

export function SettingsPage() {
  const q = useQuery({ queryKey: ["settings"], queryFn: () => api<SettingsData>("/api/settings") });
  const origin = window.location.origin;
  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4 sm:p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="mt-1 text-sm text-muted">Your account and how your chat system connects.</p>
      </div>
      {q.isError ? <div className="card"><ErrorState message="Couldn't load settings." onRetry={() => q.refetch()} /></div> : !q.data ? <Skeleton className="h-72" /> : (<>
        <section className="card space-y-4 p-5">
          <h2 className="font-semibold">Account</h2>
          <dl className="grid gap-4 text-sm sm:grid-cols-2">
            <div><dt className="text-muted">Name</dt><dd className="mt-0.5 font-medium">{q.data.agent.name}</dd></div>
            <div><dt className="text-muted">Email</dt><dd className="mt-0.5 font-medium">{q.data.agent.email}</dd></div>
          </dl>
        </section>
        <section className="card space-y-4 p-5">
          <div>
            <h2 className="font-semibold">Webhook</h2>
            <p className="mt-1 text-sm text-muted">Your chat system sends each new customer message here as a JSON POST. Requests without a valid signature are rejected.</p>
          </div>
          <CopyField label="Endpoint" value={`POST ${q.data.webhookPath}`} />
          <p className="text-sm text-muted">The webhook is served by the API server, so use the API server's address with this path (see the README for the deployed URL).</p>
          <CopyField label="Signature header" value={`${q.data.signatureHeader}: ${q.data.signatureFormat}`} />
          <CopyField label="Brand ID" value={q.data.brandId} />
          <p className="text-xs text-muted">The signing secret is set on the server and is never shown in the app. This page is served from {origin}.</p>
        </section>
      </>)}
    </div>
  );
}
