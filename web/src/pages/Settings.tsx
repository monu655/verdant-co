import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Copy, LogOut, PlayCircle, RefreshCw, ShieldCheck, Webhook } from "lucide-react";
import { useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { Avatar, Badge, ConfirmDialog, ErrorState, Skeleton, Spinner, useToast } from "../components/ui";
import { api, errorMessage, type SettingsData, type WebhookSample } from "../lib/api";

function useCopy() {
  const toast = useToast();
  const [done, setDone] = useState<string | null>(null);
  return {
    done,
    copy: async (key: string, value: string) => {
      try { await navigator.clipboard.writeText(value); setDone(key); setTimeout(() => setDone((d) => (d === key ? null : d)), 1800); }
      catch { toast.push("error", "Couldn't copy. Select the text and copy it manually."); }
    },
  };
}

function CopyField({ id, label, value }: { id: string; label: string; value: string }) {
  const { done, copy } = useCopy();
  return (
    <div className="space-y-1.5">
      <p className="text-sm font-medium">{label}</p>
      <div className="flex items-center gap-2">
        <code className="min-w-0 flex-1 overflow-x-auto whitespace-nowrap rounded-lg border border-line bg-canvas px-3 py-2.5 text-sm">{value}</code>
        <button className="btn-secondary h-10 w-10 shrink-0 px-0" aria-label={`Copy ${label}`} onClick={() => copy(id, value)}>
          {done === id ? <Check aria-hidden className="h-4 w-4 text-ok" /> : <Copy aria-hidden className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );
}

function StatusRow({ ok, label, detail }: { ok: boolean; label: string; detail: ReactNode }) {
  return (
    <li className="flex items-center gap-3 py-3">
      <span aria-hidden className={`h-2.5 w-2.5 shrink-0 rounded-full ${ok ? "bg-ok" : "bg-danger"}`} />
      <span className="flex-1 text-sm font-medium">{label}</span>
      <span className="min-w-0 truncate text-sm text-muted">{detail}</span>
      <Badge tone={ok ? "green" : "red"}>{ok ? "OK" : "Needs attention"}</Badge>
    </li>
  );
}

function TryWebhook() {
  const { done, copy } = useCopy();
  const sample = useMutation({ mutationFn: () => api<WebhookSample>("/api/settings/webhook-sample") });
  const d = sample.data;
  const powershell = d ? `Invoke-WebRequest -Uri "${d.url}" -Method POST -ContentType "application/json" -Headers @{ "X-Signature" = "${d.signature}" } -Body '${d.payload}' -UseBasicParsing | Select-Object -ExpandProperty Content` : "";
  const curl = d ? `curl -X POST "${d.url}" -H "Content-Type: application/json" -H "X-Signature: ${d.signature}" -d '${d.payload}'` : "";
  return (
    <div className="rounded-xl border border-line bg-canvas p-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold">Try the webhook</h3>
          <p className="mt-0.5 text-xs text-muted">Creates a correctly signed sample request. Run it, and a "Webhook Test" conversation appears in your inbox. Sending it twice returns "duplicate".</p>
        </div>
        <button type="button" className="btn-primary" onClick={() => sample.mutate()} disabled={sample.isPending}>
          {sample.isPending ? <Spinner /> : d ? <RefreshCw aria-hidden className="h-4 w-4" /> : <PlayCircle aria-hidden className="h-4 w-4" />}{d ? "New sample" : "Generate sample"}
        </button>
      </div>
      {sample.isError && <p role="alert" className="mt-3 text-sm text-red-800">{errorMessage(sample.error)}</p>}
      {d && (
        <div className="mt-4 space-y-4">
          {([["powershell", "PowerShell (Windows)", powershell], ["curl", "curl (Mac, Linux)", curl]] as const).map(([key, label, text]) => (
            <div key={key}>
              <div className="mb-1.5 flex items-center justify-between">
                <p className="text-sm font-medium">{label}</p>
                <button type="button" className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-600 hover:underline" onClick={() => copy(key, text)}>
                  {done === key ? <><Check aria-hidden className="h-3.5 w-3.5" />Copied</> : <><Copy aria-hidden className="h-3.5 w-3.5" />Copy</>}
                </button>
              </div>
              <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-all rounded-lg border border-line bg-white p-3 text-xs leading-relaxed">{text}</pre>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function SettingsPage() {
  const qc = useQueryClient();
  const nav = useNavigate();
  const toast = useToast();
  const [confirm, setConfirm] = useState(false);
  const q = useQuery({ queryKey: ["settings"], queryFn: () => api<SettingsData>("/api/settings"), refetchInterval: 30000 });
  const logout = useMutation({
    mutationFn: () => api("/api/auth/logout", { method: "POST" }),
    onSuccess: () => { qc.clear(); qc.setQueryData(["me"], null); setConfirm(false); toast.push("success", "Signed out"); nav("/agent/login"); },
    onError: () => toast.push("error", "Couldn't sign out. Try again."),
  });
  const s = q.data;
  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4 sm:p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="mt-1 text-sm text-muted">Your account, system health and how your chat system connects.</p>
      </div>
      {q.isError && !s ? <div className="card"><ErrorState message="Couldn't load settings." onRetry={() => q.refetch()} /></div> : !s ? <div className="space-y-6"><Skeleton className="h-32" /><Skeleton className="h-56" /><Skeleton className="h-80" /></div> : (<>
        <section className="card p-5" aria-labelledby="acct">
          <div className="flex flex-wrap items-center gap-4">
            <Avatar name={s.agent.name} size={56} />
            <div className="min-w-0 flex-1">
              <h2 id="acct" className="truncate text-lg font-semibold">{s.agent.name}</h2>
              <p className="truncate text-sm text-muted">{s.agent.email}</p>
              <div className="mt-1.5"><Badge tone="green"><ShieldCheck aria-hidden className="h-3 w-3" />Support agent</Badge></div>
            </div>
            <button type="button" className="btn-secondary" onClick={() => setConfirm(true)}><LogOut aria-hidden className="h-4 w-4" />Sign out</button>
          </div>
        </section>

        <section className="card p-5" aria-labelledby="health">
          <h2 id="health" className="font-semibold">System status</h2>
          <ul className="mt-2 divide-y divide-line">
            <StatusRow ok={s.status.database} label="Database" detail={s.status.database ? "Connected" : "Not reachable"} />
            <StatusRow ok={s.status.aiConfigured} label="AI drafts" detail={s.status.aiConfigured ? `${s.status.aiModel} · ${s.status.aiHost}` : "No API key set on the server"} />
            <StatusRow ok={s.status.knowledgeEntries > 0} label="Knowledge base" detail={`${s.status.knowledgeEntries} ${s.status.knowledgeEntries === 1 ? "entry" : "entries"}`} />
          </ul>
          <p className="mt-2 text-xs text-muted">Refreshes every 30 seconds. Replies are never sent automatically, whatever the status.</p>
        </section>

        <section className="card space-y-4 p-5" aria-labelledby="hook">
          <div className="flex items-start gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-mint-100 text-forest-900"><Webhook aria-hidden className="h-[18px] w-[18px]" /></span>
            <div>
              <h2 id="hook" className="font-semibold">Webhook</h2>
              <p className="mt-0.5 text-sm text-muted">Your chat system sends each new customer message here as a JSON POST. Requests without a valid signature are rejected with 401.</p>
            </div>
          </div>
          <CopyField id="url" label="Endpoint (POST)" value={s.webhookUrl} />
          <CopyField id="sig" label="Signature header" value={`${s.signatureHeader}: ${s.signatureFormat}`} />
          <CopyField id="brand" label="Brand ID" value={s.brandId} />
          <p className="text-xs text-muted">The signing secret is set on the server and is never shown in the app.</p>
          <TryWebhook />
        </section>
      </>)}
      <ConfirmDialog open={confirm} title="Sign out?" body="You'll need to sign in again to review conversations." confirmLabel="Sign out" busy={logout.isPending} onConfirm={() => logout.mutate()} onCancel={() => setConfirm(false)} />
    </div>
  );
}
