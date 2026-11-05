import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, CheckCheck, CircleCheck, Clock, Copy, Inbox, Info, MessageSquare, Phone, RefreshCw, RotateCcw, Search, Send, Sparkles, TriangleAlert, Undo2, X, Zap } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Avatar, Badge, ConfirmDialog, EmptyState, ErrorState, Skeleton, Spinner, useToast } from "../components/ui";
import { api, errorMessage, type ConversationDetail, type ConversationSummary } from "../lib/api";
import { fullTime, shortTime, timeAgo } from "../lib/format";
import { useDebounced } from "../lib/hooks";

const FILTERS = [
  { id: "all", label: "Open" },
  { id: "needs_reply", label: "To reply" },
  { id: "unread", label: "Unread" },
  { id: "resolved", label: "Resolved" },
] as const;
type FilterId = (typeof FILTERS)[number]["id"];
interface Counts { open: number; needs_reply: number; unread: number; resolved: number }
const COUNT_KEY: Record<FilterId, keyof Counts> = { all: "open", needs_reply: "needs_reply", unread: "unread", resolved: "resolved" };

const QUICK_REPLIES = [
  { label: "Thanks", text: "Thank you for reaching out to Verdant & Co. " },
  { label: "Checking", text: "I am checking this with our team and will get back to you shortly. " },
  { label: "Need details", text: "Could you please share your order number so we can look into this? " },
  { label: "Anything else?", text: "Is there anything else I can help you with? " },
];

const sameDay = (a: string, b: string) => new Date(a).toDateString() === new Date(b).toDateString();
function dayLabel(iso: string) {
  const d = new Date(iso); const now = new Date();
  if (d.toDateString() === now.toDateString()) return "Today";
  const y = new Date(now); y.setDate(now.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return "Yesterday";
  return d.toLocaleDateString([], { weekday: "long", day: "numeric", month: "long" });
}

/* ------------------------------ List ------------------------------ */
function ConversationList({ activeId }: { activeId?: string }) {
  const [filter, setFilter] = useState<FilterId>("all");
  const [q, setQ] = useState("");
  const dq = useDebounced(q.trim());
  const list = useQuery({
    queryKey: ["conversations", filter, dq],
    queryFn: () => api<{ conversations: ConversationSummary[]; counts: Counts }>(`/api/conversations?filter=${filter}&q=${encodeURIComponent(dq)}`),
    refetchInterval: 4000,
    placeholderData: (prev) => prev,
  });
  return (
    <section aria-label="Conversations" className="flex h-full min-h-0 flex-col bg-white">
      <div className="space-y-3 border-b border-line p-4">
        <h1 className="text-lg font-semibold">Conversations</h1>
        <div className="relative">
          <label htmlFor="list-search" className="sr-only">Filter conversations</label>
          <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input id="list-search" className="input pl-9" placeholder="Filter by name, phone or message" value={q} onChange={(e) => setQ(e.target.value)} />
          {q && <button aria-label="Clear filter" className="absolute right-1 top-1 flex h-8 w-8 items-center justify-center text-muted hover:text-ink" onClick={() => setQ("")}><X aria-hidden className="h-4 w-4" /></button>}
        </div>
        <div role="tablist" aria-label="Filter" className="flex gap-1 rounded-lg bg-canvas p-1">
          {FILTERS.map((f) => (
            <button key={f.id} role="tab" aria-selected={filter === f.id} onClick={() => setFilter(f.id)}
              className={`flex h-8 flex-1 items-center justify-center gap-1 whitespace-nowrap rounded-md px-1.5 text-[13px] font-medium transition-colors ${filter === f.id ? "bg-white text-forest-900 shadow-card" : "text-muted hover:text-ink"}`}>
              {f.label}
              {list.data?.counts && list.data.counts[COUNT_KEY[f.id]] > 0 && f.id !== "all" && f.id !== "resolved" && (
                <span className={`min-w-4 rounded-full px-1 text-[11px] font-semibold leading-4 ${filter === f.id ? "bg-emerald-600 text-white" : "bg-mint-100 text-forest-900"}`}>{list.data.counts[COUNT_KEY[f.id]]}</span>
              )}
            </button>
          ))}
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {list.isLoading && <div className="space-y-1 p-3">{Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="h-[72px]" />)}</div>}
        {list.isError && !list.data && <ErrorState message="Couldn't load conversations." onRetry={() => list.refetch()} />}
        {list.data?.conversations.length === 0 && (
          <EmptyState icon={<Inbox aria-hidden className="h-6 w-6" />} title={dq ? "No matches" : filter === "resolved" ? "Nothing resolved yet" : "No conversations here"}>
            {dq ? `Nothing matches “${dq}”. Try a name, phone number or a word from the message.` : "Customer messages arrive from the Customer view or the webhook."}
          </EmptyState>
        )}
        <ul>
          {list.data?.conversations.map((c) => (
            <li key={c.id}>
              <Link to={`/agent/conversations/${c.id}`} aria-current={c.id === activeId ? "true" : undefined}
                className={`flex gap-3 border-l-[3px] px-4 py-3.5 transition-colors ${c.id === activeId ? "border-emerald-600 bg-mint-50" : "border-transparent hover:bg-canvas"}`}>
                <Avatar name={c.customer_name} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline justify-between gap-2">
                    <span className={`truncate text-sm ${c.unread ? "font-semibold" : "font-medium"}`}>{c.customer_name}</span>
                    <time dateTime={c.last_message_at} className="shrink-0 text-xs text-muted">{shortTime(c.last_message_at)}</time>
                  </span>
                  <span className="mt-0.5 flex items-center justify-between gap-2">
                    <span className={`truncate text-sm ${c.unread ? "text-ink" : "text-muted"}`}>{c.last_sender === "agent" && "You: "}{c.last_body}</span>
                    {c.unread > 0 && <span aria-label={`${c.unread} unread`} className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-emerald-600 px-1.5 text-xs font-semibold text-white">{c.unread}</span>}
                  </span>
                  <span className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                    {c.has_draft && <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600"><Sparkles aria-hidden className="h-3 w-3" />Draft ready</span>}
                    {c.needs_reply && c.status === "open" && <span className="inline-flex items-center gap-1 text-xs text-muted"><Clock aria-hidden className="h-3 w-3" />Waiting {timeAgo(c.last_message_at).replace(" ago", "")}</span>}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/* ------------------------------ Draft card ------------------------------ */
function DraftCard({ detail }: { detail: ConversationDetail }) {
  const { draft, draftState } = detail;
  const qc = useQueryClient();
  const toast = useToast();
  const [text, setText] = useState(draft?.body ?? "");
  const draftId = draft?.status === "pending" ? draft.id : null;
  const lastDraftId = useRef<string | null>(null);
  useEffect(() => {
    if (draftId !== lastDraftId.current) { lastDraftId.current = draftId; setText(draft?.body ?? ""); }
  }, [draftId, draft?.body]);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["conversation", detail.conversation.id] });
    qc.invalidateQueries({ queryKey: ["conversations"] });
    qc.invalidateQueries({ queryKey: ["stats"] });
  };
  const regenerate = useMutation({
    mutationFn: () => api(`/api/conversations/${detail.conversation.id}/draft`, { method: "POST" }),
    onSuccess: () => { refresh(); toast.push("success", "New draft ready"); },
    onError: (e) => { refresh(); toast.push("error", errorMessage(e)); },
  });
  const approve = useMutation({
    mutationFn: () => api(`/api/drafts/${draftId}/approve`, { method: "POST", body: { text } }),
    onSuccess: () => { refresh(); toast.push("success", "Reply approved and sent to the customer"); },
    onError: (e) => { refresh(); toast.push("error", errorMessage(e)); },
  });
  const busy = regenerate.isPending || approve.isPending;

  if (draftState === "none") return null;
  const shell = "message-in rounded-2xl border border-emerald-600/30 bg-mint-50 p-4";
  const header = (
    <div className="mb-3 flex flex-wrap items-center gap-2">
      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-forest-900 text-mint-100"><Sparkles aria-hidden className="h-4 w-4" /></span>
      <h3 className="text-sm font-semibold text-forest-900">AI suggested reply</h3>
      <span className="text-xs text-muted">Only you can see this until you approve it</span>
    </div>
  );

  if (draftState === "generating") {
    return (
      <div className={shell} aria-busy="true">{header}
        <div className="space-y-2"><Skeleton className="h-4 w-11/12" /><Skeleton className="h-4 w-4/5" /><Skeleton className="h-4 w-2/3" /></div>
        <p className="mt-3 flex items-center gap-2 text-sm text-muted"><Spinner />Drafting a reply from the knowledge base…</p>
      </div>
    );
  }
  if (draftState === "failed" || draftState === "missing") {
    return (
      <div className="message-in rounded-2xl border border-red-200 bg-red-50 p-4" role="alert">
        <div className="mb-2 flex items-center gap-2"><TriangleAlert aria-hidden className="h-5 w-5 text-danger" /><h3 className="text-sm font-semibold text-red-900">{draftState === "failed" ? "The AI couldn't draft a reply" : "No draft was created for this message"}</h3></div>
        <p className="text-sm text-red-900/90">{draftState === "failed" ? draft?.error : "The draft job didn't finish."} The customer's message is saved. You can retry the draft or write a reply below.</p>
        <button className="btn-secondary mt-3" disabled={busy} onClick={() => regenerate.mutate()}>{regenerate.isPending ? <Spinner /> : <RefreshCw aria-hidden className="h-4 w-4" />}{draftState === "failed" ? "Retry draft" : "Generate draft"}</button>
      </div>
    );
  }
  const edited = text !== (draft?.body ?? "");
  return (
    <div className={shell}>{header}
      {draft?.needs_human && (
        <p className="mb-3 flex items-start gap-2 rounded-lg bg-amber-100 px-3 py-2 text-sm text-amber-900"><TriangleAlert aria-hidden className="mt-0.5 h-4 w-4 shrink-0" />The knowledge base doesn't fully cover this. Check the facts before you approve.</p>
      )}
      <label htmlFor="draft-text" className="sr-only">Edit suggested reply</label>
      <textarea id="draft-text" className="w-full resize-y rounded-lg border border-line bg-white p-3 text-sm leading-relaxed focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/20" rows={5} maxLength={2000} value={text} disabled={busy} onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && text.trim() && draftId && !busy) { e.preventDefault(); approve.mutate(); } }} />
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="flex items-center gap-2 text-xs text-muted">{edited ? <Badge tone="amber">Edited</Badge> : "Unedited"} · {text.length}/2000
          {edited && <button type="button" className="inline-flex items-center gap-1 font-medium text-emerald-600 hover:underline" disabled={busy} onClick={() => setText(draft?.body ?? "")}><Undo2 aria-hidden className="h-3 w-3" />Reset to AI draft</button>}
        </span>
        <div className="ml-auto flex gap-2">
          <button className="btn-secondary" disabled={busy} onClick={() => regenerate.mutate()}>{regenerate.isPending ? <Spinner /> : <RefreshCw aria-hidden className="h-4 w-4" />}Regenerate</button>
          <button className="btn-primary" disabled={busy || !text.trim() || !draftId} onClick={() => approve.mutate()}>{approve.isPending ? <Spinner /> : <CheckCheck aria-hidden className="h-4 w-4" />}Approve and send</button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------ Composer ------------------------------ */
function Composer({ conversationId, disabled }: { conversationId: string; disabled: boolean }) {
  const [text, setText] = useState("");
  const qc = useQueryClient();
  const toast = useToast();
  const send = useMutation({
    mutationFn: () => api(`/api/conversations/${conversationId}/replies`, { method: "POST", body: { text } }),
    onSuccess: () => { setText(""); qc.invalidateQueries({ queryKey: ["conversation", conversationId] }); qc.invalidateQueries({ queryKey: ["conversations"] }); qc.invalidateQueries({ queryKey: ["stats"] }); toast.push("success", "Reply sent"); },
    onError: (e) => toast.push("error", errorMessage(e)),
  });
  const submit = () => { if (text.trim() && !send.isPending) send.mutate(); };
  const onKey = (e: KeyboardEvent) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); submit(); } };
  return (
    <div className="border-t border-line bg-white p-3 sm:p-4">
      {!disabled && (
        <div className="-mx-1 mb-2 flex items-center gap-2 overflow-x-auto px-1 pb-1" aria-label="Quick replies">
          <span className="flex shrink-0 items-center gap-1 text-xs font-medium text-muted"><Zap aria-hidden className="h-3.5 w-3.5" />Quick replies</span>
          {QUICK_REPLIES.map((q) => (
            <button key={q.label} type="button" className="shrink-0 rounded-full border border-line px-3 py-1 text-xs hover:border-emerald-600 hover:bg-mint-50" onClick={() => { setText((t) => (t ? t + (t.endsWith(" ") ? "" : " ") : "") + q.text); document.getElementById("composer")?.focus(); }}>{q.label}</button>
          ))}
        </div>
      )}
      <div className="flex items-end gap-2">
        <label htmlFor="composer" className="sr-only">Write a reply</label>
        <textarea id="composer" rows={2} maxLength={2000} disabled={disabled || send.isPending} value={text} onChange={(e) => setText(e.target.value)} onKeyDown={onKey}
          placeholder={disabled ? "This conversation is resolved. Reopen it to reply." : "Write your own reply (Ctrl+Enter to send)"}
          className="min-h-[44px] flex-1 resize-none rounded-lg border border-line p-3 text-sm focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/20 disabled:bg-canvas" />
        <button className="btn-primary h-11 w-11 shrink-0 px-0" aria-label="Send reply" disabled={disabled || !text.trim() || send.isPending} onClick={submit}>{send.isPending ? <Spinner /> : <Send aria-hidden className="h-4 w-4" />}</button>
      </div>
    </div>
  );
}

/* ------------------------------ Details ------------------------------ */
function Details({ detail, onToggleStatus, onClose }: { detail: ConversationDetail; onToggleStatus: () => void; onClose?: () => void }) {
  const toast = useToast();
  const resolved = detail.conversation.status === "resolved";
  const copy = async () => { try { await navigator.clipboard.writeText(detail.customer.phone); toast.push("success", "Phone number copied"); } catch { toast.push("error", "Couldn't copy the number"); } };
  return (
    <aside aria-label="Customer details" className="flex h-full flex-col overflow-y-auto bg-white">
      <div className="flex items-center justify-between border-b border-line px-5 py-4">
        <h2 className="font-semibold">Customer details</h2>
        {onClose && <button aria-label="Close details" className="btn-ghost h-9 w-9 px-0" onClick={onClose}><X aria-hidden className="h-5 w-5" /></button>}
      </div>
      <div className="flex flex-col items-center gap-2 px-5 py-6 text-center">
        <Avatar name={detail.customer.name} size={64} />
        <p className="text-lg font-semibold">{detail.customer.name}</p>
        <Badge tone={resolved ? "neutral" : "green"}>{resolved ? "Resolved" : "Open"}</Badge>
      </div>
      <dl className="space-y-3 border-t border-line px-5 py-4 text-sm">
        <div className="flex justify-between gap-3"><dt className="text-muted">Phone</dt><dd className="font-medium">{detail.customer.phone}</dd></div>
        <div className="flex justify-between gap-3"><dt className="text-muted">Customer ID</dt><dd className="truncate font-medium">{detail.customer.externalId}</dd></div>
        <div className="flex justify-between gap-3"><dt className="text-muted">Started</dt><dd className="font-medium">{fullTime(detail.conversation.createdAt)}</dd></div>
        <div className="flex justify-between gap-3"><dt className="text-muted">Messages</dt><dd className="font-medium">{detail.messages.length}</dd></div>
      </dl>
      <div className="grid grid-cols-2 gap-2 border-t border-line px-5 py-4">
        <a className="btn-secondary" href={`tel:${detail.customer.phone}`}><Phone aria-hidden className="h-4 w-4" />Call</a>
        <button className="btn-secondary" onClick={copy}><Copy aria-hidden className="h-4 w-4" />Copy</button>
        <button className="btn-secondary col-span-2" onClick={onToggleStatus}>{resolved ? <RotateCcw aria-hidden className="h-4 w-4" /> : <CircleCheck aria-hidden className="h-4 w-4" />}{resolved ? "Reopen conversation" : "Mark as resolved"}</button>
      </div>
      <div className="border-t border-line px-5 py-4">
        <h3 className="text-sm font-semibold">Conversation history</h3>
        {detail.history.length === 0 ? <p className="mt-2 text-sm text-muted">This is their first conversation.</p> : (
          <ul className="mt-3 space-y-2">
            {detail.history.map((h) => (
              <li key={h.id}>
                <Link to={`/agent/conversations/${h.id}`} className="block rounded-lg border border-line p-3 hover:bg-mint-50">
                  <span className="block truncate text-sm font-medium">{h.first_message ?? "Conversation"}</span>
                  <span className="mt-0.5 flex items-center justify-between text-xs text-muted"><span>{fullTime(h.created_at)}</span><Badge tone={h.status === "open" ? "green" : "neutral"}>{h.status === "open" ? "Open" : "Resolved"}</Badge></span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </aside>
  );
}

/* ------------------------------ Chat ------------------------------ */
function Chat({ id, onShowDetails, onToggleStatus, toggling }: { id: string; onShowDetails: () => void; onToggleStatus: () => void; toggling: boolean }) {
  const qc = useQueryClient();
  const detailQ = useQuery({
    queryKey: ["conversation", id],
    queryFn: () => api<ConversationDetail>(`/api/conversations/${id}`),
    refetchInterval: 3000,
  });
  const detail = detailQ.data;
  const bottom = useRef<HTMLDivElement>(null);
  const lastMsg = detail?.messages[detail.messages.length - 1]?.id;
  const draftKey = detail?.draft?.id ?? detail?.draftState;

  useEffect(() => { bottom.current?.scrollIntoView({ block: "end" }); }, [lastMsg, draftKey]);

  // Mark as read when opened and whenever a new customer message arrives while open.
  const markRead = useMutation({
    mutationFn: () => api(`/api/conversations/${id}/read`, { method: "POST" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["conversations"] }); qc.invalidateQueries({ queryKey: ["unread"] }); },
  });
  const readFor = useRef<string | undefined>();
  useEffect(() => {
    if (lastMsg && readFor.current !== `${id}:${lastMsg}`) { readFor.current = `${id}:${lastMsg}`; markRead.mutate(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, lastMsg]);

  if (detailQ.isLoading) return <div className="space-y-4 p-6"><Skeleton className="h-14" /><Skeleton className="ml-auto h-20 w-2/3" /><Skeleton className="h-20 w-2/3" /></div>;
  if (detailQ.isError || !detail) return <ErrorState message={errorMessage(detailQ.error)} onRetry={() => detailQ.refetch()} />;

  const resolved = detail.conversation.status === "resolved";
  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex items-center gap-3 border-b border-line bg-white px-3 py-3 sm:px-5">
        <Link to="/agent/conversations" aria-label="Back to conversations" className="btn-ghost h-10 w-10 px-0 lg:hidden"><ArrowLeft aria-hidden className="h-5 w-5" /></Link>
        <Avatar name={detail.customer.name} />
        <div className="min-w-0 flex-1">
          <h2 className="truncate font-semibold">{detail.customer.name}</h2>
          <p className="flex items-center gap-1.5 text-xs text-muted"><span aria-hidden className={`h-2 w-2 rounded-full ${resolved ? "bg-slate-300" : "bg-ok"}`} />{resolved ? "Resolved" : "Open"} · {detail.customer.phone}</p>
        </div>
        <button className="btn-secondary hidden sm:inline-flex" onClick={onToggleStatus} disabled={toggling}>{resolved ? <RotateCcw aria-hidden className="h-4 w-4" /> : <CircleCheck aria-hidden className="h-4 w-4" />}{resolved ? "Reopen" : "Resolve"}</button>
        <button aria-label="Customer details" className="btn-ghost h-10 w-10 px-0 xl:hidden" onClick={onShowDetails}><Info aria-hidden className="h-5 w-5" /></button>
      </header>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-canvas p-3 sm:p-5">
        {detail.messages.map((m, i) => (
          <div key={m.id} className="space-y-3">
            {(i === 0 || !sameDay(detail.messages[i - 1]!.created_at, m.created_at)) && (
              <div className="flex items-center gap-3 py-1" role="separator"><span className="h-px flex-1 bg-line" /><span className="text-xs font-medium text-muted">{dayLabel(m.created_at)}</span><span className="h-px flex-1 bg-line" /></div>
            )}
          <div className={`message-in flex ${m.sender === "agent" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[85%] sm:max-w-[70%] ${m.sender === "agent" ? "items-end" : "items-start"} flex flex-col gap-1`}>
              <p className={`whitespace-pre-wrap break-words rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${m.sender === "agent" ? "rounded-br-md bg-forest-900 text-white" : "rounded-bl-md border border-line bg-white"}`}>{m.body}</p>
              <span className="px-1 text-xs text-muted">{m.sender === "agent" ? "Approved reply · " : ""}{new Date(m.created_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</span>
            </div>
          </div>
          </div>
        ))}
        {!resolved && <DraftCard detail={detail} />}
        <div ref={bottom} />
      </div>
      <Composer conversationId={id} disabled={resolved} />
    </div>
  );
}

/* ------------------------------ Page ------------------------------ */
export function ConversationsPage() {
  const { id } = useParams();
  const nav = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const [sheet, setSheet] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const detail = useQuery({ queryKey: ["conversation", id], queryFn: () => api<ConversationDetail>(`/api/conversations/${id}`), enabled: !!id, refetchInterval: 3000 });
  const closeSheet = useCallback(() => setSheet(false), []);
  useEffect(() => { setSheet(false); }, [id]);

  const toggle = useMutation({
    mutationFn: (status: "open" | "resolved") => api(`/api/conversations/${id}`, { method: "PATCH", body: { status } }),
    onSuccess: (_d, status) => { setConfirm(false); qc.invalidateQueries({ queryKey: ["conversation", id] }); qc.invalidateQueries({ queryKey: ["conversations"] }); qc.invalidateQueries({ queryKey: ["stats"] }); toast.push("success", status === "resolved" ? "Conversation resolved" : "Conversation reopened"); },
    onError: (e) => { setConfirm(false); toast.push("error", errorMessage(e)); },
  });
  const onToggleStatus = () => (detail.data?.conversation.status === "resolved" ? toggle.mutate("open") : setConfirm(true));

  return (
    <div className="flex h-full min-h-0">
      <div className={`${id ? "hidden lg:block" : "block"} h-full w-full shrink-0 border-r border-line lg:w-[340px]`}><ConversationList activeId={id} /></div>
      <div className={`${id ? "block" : "hidden lg:block"} h-full min-w-0 flex-1`}>
        {id ? <Chat id={id} onShowDetails={() => setSheet(true)} onToggleStatus={onToggleStatus} toggling={toggle.isPending} /> : (
          <div className="flex h-full items-center justify-center bg-canvas"><EmptyState icon={<MessageSquare aria-hidden className="h-6 w-6" />} title="Select a conversation">Pick a customer on the left to read their messages and review the AI's suggested reply.</EmptyState></div>
        )}
      </div>
      {id && detail.data && <div className="hidden h-full w-[320px] shrink-0 border-l border-line xl:block"><Details detail={detail.data} onToggleStatus={onToggleStatus} /></div>}
      {id && detail.data && sheet && (
        <div className="fixed inset-0 z-40 xl:hidden" onMouseDown={(e) => e.target === e.currentTarget && closeSheet()}>
          <div className="absolute inset-0 bg-forest-950/40" aria-hidden />
          <div className="sheet-in absolute inset-y-0 right-0 w-full max-w-sm shadow-pop"><Details detail={detail.data} onToggleStatus={() => { closeSheet(); onToggleStatus(); }} onClose={closeSheet} /></div>
        </div>
      )}
      <ConfirmDialog open={confirm} title="Mark as resolved?" body="The conversation moves to Resolved. If the customer writes again, a new conversation starts." confirmLabel="Mark as resolved" busy={toggle.isPending} onConfirm={() => toggle.mutate("resolved")} onCancel={() => setConfirm(false)} />
    </div>
  );
}
