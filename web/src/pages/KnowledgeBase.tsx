import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BookOpen, FlaskConical, Pencil, Plus, RotateCcw, Search, Sparkles, Trash2, TriangleAlert } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Badge, ConfirmDialog, EmptyState, ErrorState, Skeleton, Spinner, useToast } from "../components/ui";
import { api, errorMessage, type KbEntry } from "../lib/api";
import { timeAgo } from "../lib/format";

interface KbData { entries: KbEntry[]; max: number }
const TOPIC_MAX = 60, POLICY_MAX = 600;

function EntryForm({ initial, busy, error, onSubmit, onCancel, submitLabel }: {
  initial: { topic: string; policy: string }; busy: boolean; error?: string; submitLabel: string;
  onSubmit: (v: { topic: string; policy: string }) => void; onCancel: () => void;
}) {
  const [topic, setTopic] = useState(initial.topic);
  const [policy, setPolicy] = useState(initial.policy);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { ref.current?.focus(); }, []);
  const submit = (e: FormEvent) => { e.preventDefault(); onSubmit({ topic: topic.trim(), policy: policy.trim() }); };
  return (
    <form onSubmit={submit} className="space-y-3">
      {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}
      <div className="space-y-1.5">
        <label className="text-sm font-medium" htmlFor="kb-topic">Topic</label>
        <input ref={ref} id="kb-topic" className="input" maxLength={TOPIC_MAX} value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="e.g. Gift wrapping" />
      </div>
      <div className="space-y-1.5">
        <div className="flex items-baseline justify-between"><label className="text-sm font-medium" htmlFor="kb-policy">Policy</label><span className={`text-xs tabular-nums ${policy.length > POLICY_MAX - 40 ? "text-amber-800" : "text-muted"}`}>{policy.length}/{POLICY_MAX}</span></div>
        <textarea id="kb-policy" rows={4} maxLength={POLICY_MAX} className="w-full resize-y rounded-lg border border-line p-3 text-sm leading-relaxed focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/20" value={policy} onChange={(e) => setPolicy(e.target.value)} placeholder="State the rule exactly as customers should hear it, including limits and time windows." />
      </div>
      <div className="flex justify-end gap-2 pt-1">
        <button type="button" className="btn-secondary" onClick={onCancel} disabled={busy}>Cancel</button>
        <button type="submit" className="btn-primary" disabled={busy || topic.trim().length < 2 || policy.trim().length < 10}>{busy && <Spinner />}{submitLabel}</button>
      </div>
    </form>
  );
}

function Playground() {
  const [question, setQuestion] = useState("");
  const run = useMutation({ mutationFn: () => api<{ reply: string; needsHuman: boolean }>("/api/knowledge-base/test", { method: "POST", body: { question } }) });
  const examples = ["Can I return an opened serum?", "Is cash on delivery available for ₹3,500?", "Do you deliver to Dubai?"];
  const submit = (e: FormEvent) => { e.preventDefault(); if (question.trim().length >= 3 && !run.isPending) run.mutate(); };
  return (
    <section className="card p-5">
      <div className="flex items-center gap-2.5">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-mint-100 text-forest-900"><FlaskConical aria-hidden className="h-[18px] w-[18px]" /></span>
        <div><h2 className="font-semibold">Test the AI</h2><p className="text-xs text-muted">See how it answers with your current policies. Nothing is saved or sent.</p></div>
      </div>
      <form onSubmit={submit} className="mt-4 flex gap-2">
        <label htmlFor="kb-test" className="sr-only">Test question</label>
        <input id="kb-test" className="input" maxLength={500} value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="Ask a customer question…" />
        <button type="submit" className="btn-primary shrink-0" disabled={run.isPending || question.trim().length < 3}>{run.isPending ? <Spinner /> : <Sparkles aria-hidden className="h-4 w-4" />}Ask</button>
      </form>
      <div className="mt-2 flex flex-wrap gap-2">
        {examples.map((x) => <button key={x} type="button" className="rounded-full border border-line px-3 py-1 text-xs text-muted hover:border-emerald-600 hover:bg-mint-50 hover:text-forest-900" onClick={() => { setQuestion(x); run.reset(); }}>{x}</button>)}
      </div>
      <div aria-live="polite">
        {run.isError && <p role="alert" className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{errorMessage(run.error)}</p>}
        {run.data && (
          <div className="mt-4 rounded-xl border border-line bg-canvas p-4">
            <p className="text-sm leading-relaxed">{run.data.reply}</p>
            <div className="mt-3">{run.data.needsHuman
              ? <Badge tone="amber"><TriangleAlert aria-hidden className="h-3 w-3" />Would be flagged for a person</Badge>
              : <Badge tone="green">Answered from the policies</Badge>}</div>
          </div>
        )}
      </div>
    </section>
  );
}

export function KnowledgeBasePage() {
  const qc = useQueryClient();
  const toast = useToast();
  const q = useQuery({ queryKey: ["kb"], queryFn: () => api<KbData>("/api/knowledge-base") });
  const [search, setSearch] = useState("");
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<KbEntry | null>(null);
  const [resetting, setResetting] = useState(false);

  const done = (text: string) => { qc.invalidateQueries({ queryKey: ["kb"] }); toast.push("success", text); };
  const add = useMutation({ mutationFn: (v: { topic: string; policy: string }) => api("/api/knowledge-base", { method: "POST", body: v }), onSuccess: () => { setAdding(false); done("Entry added. The AI will use it from the next draft."); } });
  const edit = useMutation({ mutationFn: (v: { id: string; topic: string; policy: string }) => api(`/api/knowledge-base/${v.id}`, { method: "PATCH", body: { topic: v.topic, policy: v.policy } }), onSuccess: () => { setEditing(null); done("Entry updated."); } });
  const del = useMutation({ mutationFn: (id: string) => api(`/api/knowledge-base/${id}`, { method: "DELETE" }), onSuccess: () => { setDeleting(null); done("Entry deleted."); }, onError: (e) => { setDeleting(null); toast.push("error", errorMessage(e)); } });
  const reset = useMutation({ mutationFn: () => api("/api/knowledge-base/reset", { method: "POST" }), onSuccess: () => { setResetting(false); setEditing(null); done("Original policies restored."); }, onError: (e) => { setResetting(false); toast.push("error", errorMessage(e)); } });

  const entries = q.data?.entries ?? [];
  const max = q.data?.max ?? 30;
  const shown = useMemo(() => {
    const t = search.trim().toLowerCase();
    return t ? entries.filter((e) => e.topic.toLowerCase().includes(t) || e.policy.toLowerCase().includes(t)) : entries;
  }, [entries, search]);

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="max-w-2xl">
          <h1 className="text-2xl font-semibold tracking-tight">Knowledge base</h1>
          <p className="mt-1 text-sm text-muted">The only policies the AI uses when it drafts a reply. Changes apply to the next draft. If a question isn't covered here, the draft says so and flags it for a person.</p>
        </div>
        <div className="flex gap-2">
          <button type="button" className="btn-secondary h-10" onClick={() => setResetting(true)} disabled={!q.data}><RotateCcw aria-hidden className="h-4 w-4" />Restore originals</button>
          <button type="button" className="btn-primary h-10" onClick={() => { setAdding(true); setEditing(null); }} disabled={!q.data || entries.length >= max}><Plus aria-hidden className="h-4 w-4" />Add entry</button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0 space-y-4">
          <div className="flex items-center gap-3">
            <div className="relative flex-1">
              <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
              <label htmlFor="kb-search" className="sr-only">Search the knowledge base</label>
              <input id="kb-search" className="input pl-9" placeholder="Search policies" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <Badge tone="neutral">{entries.length} of {max} entries</Badge>
          </div>

          {adding && (
            <div className="card border-emerald-600/40 p-5">
              <h2 className="mb-3 font-semibold">New entry</h2>
              <EntryForm initial={{ topic: "", policy: "" }} busy={add.isPending} error={add.isError ? errorMessage(add.error) : undefined} submitLabel="Add entry" onSubmit={(v) => add.mutate(v)} onCancel={() => { setAdding(false); add.reset(); }} />
            </div>
          )}

          {q.isError ? <div className="card"><ErrorState message="Couldn't load the knowledge base." onRetry={() => q.refetch()} /></div>
            : !q.data ? <Skeleton className="h-96" />
            : shown.length === 0 ? <div className="card"><EmptyState icon={<BookOpen aria-hidden className="h-6 w-6" />} title="No matching entries">Try a different word, or add a new entry.</EmptyState></div>
            : (
              <ul className="card divide-y divide-line">
                {shown.map((e) => (
                  <li key={e.id} className="p-5">
                    {editing === e.id ? (
                      <EntryForm initial={e} busy={edit.isPending} error={edit.isError ? errorMessage(edit.error) : undefined} submitLabel="Save changes" onSubmit={(v) => edit.mutate({ id: e.id, ...v })} onCancel={() => { setEditing(null); edit.reset(); }} />
                    ) : (
                      <div>
                        <div className="flex items-start justify-between gap-3">
                          <h3 className="min-w-0 font-medium text-forest-900">{e.topic}</h3>
                          <div className="-mr-2 -mt-2 flex shrink-0 items-center">
                            <button type="button" aria-label={`Edit ${e.topic}`} title="Edit" className="flex h-9 w-9 items-center justify-center rounded-lg text-muted hover:bg-mint-50 hover:text-forest-900" onClick={() => { setEditing(e.id); setAdding(false); edit.reset(); }}><Pencil aria-hidden className="h-4 w-4" /></button>
                            <button type="button" aria-label={`Delete ${e.topic}`} title="Delete" className="flex h-9 w-9 items-center justify-center rounded-lg text-muted hover:bg-red-50 hover:text-danger" onClick={() => setDeleting(e)}><Trash2 aria-hidden className="h-4 w-4" /></button>
                          </div>
                        </div>
                        <p className="-mt-1 text-sm leading-relaxed">{e.policy}</p>
                        <p className="mt-2 text-xs text-muted">Updated {timeAgo(e.updated_at)}</p>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
        </div>

        <aside className="space-y-6 lg:sticky lg:top-6 lg:self-start">
          <Playground />
          <section className="card p-5 text-sm">
            <h2 className="font-semibold">Writing good policies</h2>
            <ul className="mt-3 list-disc space-y-1.5 pl-5 text-muted">
              <li>Be exact: include amounts, time windows and conditions.</li>
              <li>One topic per entry, so the AI finds the right rule.</li>
              <li>Don't promise what a person must decide. Say a team member will review.</li>
            </ul>
          </section>
        </aside>
      </div>

      <ConfirmDialog open={!!deleting} title="Delete this entry?" body={deleting ? `"${deleting.topic}" will no longer be used by the AI. You can restore the original policies at any time.` : ""} confirmLabel="Delete" tone="danger" busy={del.isPending} onConfirm={() => deleting && del.mutate(deleting.id)} onCancel={() => setDeleting(null)} />
      <ConfirmDialog open={resetting} title="Restore the original policies?" body="Your added and edited entries will be replaced by the seven original policies." confirmLabel="Restore" busy={reset.isPending} onConfirm={() => reset.mutate()} onCancel={() => setResetting(false)} />
    </div>
  );
}