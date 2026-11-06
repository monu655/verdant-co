import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Banknote, Leaf, MessageSquare, Pencil, RotateCcw, Send, Truck } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { MessageEditor } from "../components/MessageEditor";
import { CustomerTopBar } from "../components/TopBar";
import { Avatar, ErrorState, Skeleton, Spinner, useToast } from "../components/ui";
import { api, errorMessage } from "../lib/api";
import { shortTime } from "../lib/format";

interface TestCustomer { id: string; name: string; phone: string }
interface PublicMessage { id: string; sender: "customer" | "agent"; body: string; created_at: string; edited_at?: string | null }
const NEW = "__new__";
const derivedId = (phone: string) => `web_${phone.replace(/\D/g, "")}`;

// Facts come straight from the knowledge base the AI uses.
const PROMISES = [
  { icon: Leaf, title: "Fragrance-free and vegan", text: "Every Verdant & Co product." },
  { icon: Truck, title: "Ships within 24 hours", text: "Monday to Saturday." },
  { icon: RotateCcw, title: "7-day returns", text: "For unopened, unused products." },
  { icon: Banknote, title: "Cash on delivery", text: "Orders under ₹3,000, with a ₹50 fee." },
];

function load(key: string, fallback: string) { try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; } }
function save(key: string, value: string) { try { localStorage.setItem(key, value); } catch { /* ignore */ } }

export function CustomerView() {
  const toast = useToast();
  const qc = useQueryClient();
  const meta = useQuery({ queryKey: ["test-customers"], queryFn: () => api<{ customers: TestCustomer[]; sampleMessages: string[] }>("/api/customer/test-customers"), staleTime: Infinity });
  const [selected, setSelected] = useState(() => load("vc.customer", ""));
  const [newName, setNewName] = useState(() => load("vc.newName", ""));
  const [newPhone, setNewPhone] = useState(() => load("vc.newPhone", ""));
  const [text, setText] = useState("");
  const input = useRef<HTMLTextAreaElement>(null);

  const customers = meta.data?.customers ?? [];
  const samples = meta.data?.sampleMessages ?? [];
  const chosen = selected === NEW ? null : customers.find((c) => c.id === selected) ?? customers[0] ?? null;
  const identity: { id?: string; name: string; phone: string } | null =
    selected === NEW ? (newName.trim() && /^\+?[0-9 ()-]{7,20}$/.test(newPhone.trim()) ? { name: newName.trim(), phone: newPhone.trim() } : null) : chosen;
  const convoId = identity ? (identity.id ?? derivedId(identity.phone)) : null;

  const convo = useQuery({
    queryKey: ["customer-convo", convoId, identity?.phone],
    queryFn: () => api<{ messages: PublicMessage[] }>(`/api/customer/conversation?customerId=${encodeURIComponent(convoId!)}&phone=${encodeURIComponent(identity!.phone)}`),
    enabled: !!convoId && !!identity,
    refetchInterval: 3000,
  });
  const messages = convo.data?.messages ?? [];
  const last = messages[messages.length - 1];

  const bottom = useRef<HTMLDivElement>(null);
  useEffect(() => { bottom.current?.scrollIntoView({ block: "end" }); }, [last?.id]);

  const send = useMutation({
    mutationFn: () => api("/api/customer/messages", { method: "POST", body: { customer: identity, text } }),
    onSuccess: () => { setText(""); qc.invalidateQueries({ queryKey: ["customer-convo"] }); qc.invalidateQueries({ queryKey: ["stats"] }); },
    onError: (e) => toast.push("error", errorMessage(e)),
  });
  const [editing, setEditing] = useState<string | null>(null);
  const edit = useMutation({
    mutationFn: (v: { id: string; text: string }) => api(`/api/customer/messages/${v.id}`, { method: "PATCH", body: { customer: { id: convoId, phone: identity?.phone }, text: v.text } }),
    onSuccess: () => { setEditing(null); qc.invalidateQueries({ queryKey: ["customer-convo"] }); toast.push("success", "Message updated"); },
    onError: (e) => { toast.push("error", errorMessage(e)); qc.invalidateQueries({ queryKey: ["customer-convo"] }); setEditing(null); },
  });
  const submit = (e?: FormEvent) => { e?.preventDefault(); if (identity && text.trim() && !send.isPending) send.mutate(); };
  const onKey = (e: KeyboardEvent) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); } };
  const pick = (s: string) => { setText(s); input.current?.focus(); };

  return (
    <div className="flex h-dvh flex-col">
      <CustomerTopBar />
      <main className="mx-auto grid min-h-0 w-full max-w-6xl flex-1 gap-8 px-3 py-3 sm:px-8 sm:py-6 lg:grid-cols-[minmax(0,360px)_minmax(0,1fr)]">
        <aside className="hidden min-h-0 flex-col gap-8 overflow-y-auto pr-2 lg:flex">
          <div>
            <h1 className="text-3xl font-semibold leading-tight tracking-tight text-forest-900">How can we help?</h1>
            <p className="mt-3 text-[15px] leading-relaxed text-muted">Ask about your order, shipping, returns or ingredients. Our team reads every reply before it reaches you.</p>
          </div>

          <section aria-labelledby="quick">
            <h2 id="quick" className="text-sm font-semibold">Quick questions</h2>
            <ul className="mt-3 space-y-2">
              {samples.map((s) => (
                <li key={s}>
                  <button type="button" onClick={() => pick(s)} className="flex w-full items-start gap-3 rounded-xl border border-line bg-white p-3 text-left text-sm transition-colors hover:border-emerald-600 hover:bg-mint-50">
                    <MessageSquare aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                    <span>{s}</span>
                  </button>
                </li>
              ))}
              {meta.isLoading && <li><Skeleton className="h-12" /></li>}
            </ul>
          </section>

          <section aria-labelledby="know">
            <h2 id="know" className="text-sm font-semibold">Good to know</h2>
            <ul className="mt-3 space-y-4">
              {PROMISES.map(({ icon: Icon, title, text }) => (
                <li key={title} className="flex gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-mint-100 text-forest-900"><Icon aria-hidden className="h-[18px] w-[18px]" /></span>
                  <span>
                    <span className="block text-sm font-medium">{title}</span>
                    <span className="block text-sm text-muted">{text}</span>
                  </span>
                </li>
              ))}
            </ul>
          </section>
        </aside>

        <section className="card flex min-h-0 flex-col overflow-hidden" aria-label="Chat">
          <div className="border-b border-line p-4">
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-forest-900 text-mint-100"><Leaf aria-hidden className="h-5 w-5" /></span>
              <div className="min-w-0 flex-1">
                <h2 className="truncate font-semibold">Verdant &amp; Co care team</h2>
                <p className="flex items-center gap-1.5 text-xs text-muted"><span aria-hidden className="h-2 w-2 rounded-full bg-ok" />Every reply is reviewed by a person</p>
              </div>
            </div>
            <div className="mt-3 flex items-center gap-3">
              <label htmlFor="who" className="shrink-0 text-sm text-muted">Chatting as</label>
              <select id="who" className="input h-9" value={selected === NEW ? NEW : chosen?.id ?? ""} disabled={meta.isLoading}
                onChange={(e) => { setSelected(e.target.value); save("vc.customer", e.target.value); }}>
                {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                <option value={NEW}>New customer…</option>
              </select>
            </div>
            {selected === NEW && (
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                <div><label htmlFor="nn" className="sr-only">Name</label><input id="nn" className="input h-9" placeholder="Name" value={newName} onChange={(e) => { setNewName(e.target.value); save("vc.newName", e.target.value); }} /></div>
                <div><label htmlFor="np" className="sr-only">Phone number</label><input id="np" className="input h-9" placeholder="Phone, e.g. +919800000010" inputMode="tel" value={newPhone} onChange={(e) => { setNewPhone(e.target.value); save("vc.newPhone", e.target.value); }} /></div>
              </div>
            )}
          </div>

          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-canvas p-4" aria-live="polite">
            {meta.isError && <ErrorState message="Couldn't load the test customers." onRetry={() => meta.refetch()} />}
            {meta.isLoading && <Skeleton className="h-16 w-2/3" />}
            {!identity && !meta.isLoading && !meta.isError && <p className="py-10 text-center text-sm text-muted">Enter a name and a valid phone number to start chatting.</p>}
            {identity && convo.isError && !convo.data && <ErrorState message="Couldn't load your conversation." onRetry={() => convo.refetch()} />}
            {identity && convo.data && messages.length === 0 && (
              <div className="flex flex-col items-center gap-2 py-12 text-center">
                <span className="flex h-12 w-12 items-center justify-center rounded-full bg-mint-100 text-forest-900"><Leaf aria-hidden className="h-6 w-6" /></span>
                <p className="font-semibold">Hi {identity.name.split(" ")[0]}, how can we help?</p>
                <p className="max-w-xs text-sm text-muted">Type a question below or pick one of the quick questions.</p>
              </div>
            )}
            {messages.map((m) => {
              const mine = m.sender === "customer";
              const canEdit = mine && m.id === last?.id; // only until the team has replied
              return (
                <div key={m.id} className={`message-in flex items-end gap-2 ${mine ? "justify-end" : "justify-start"}`}>
                  {!mine && <span className="mb-5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-forest-900 text-mint-100"><Leaf aria-hidden className="h-3.5 w-3.5" /></span>}
                  <div className={`flex flex-col gap-1 ${editing === m.id ? "w-full max-w-[92%] sm:max-w-[80%]" : "max-w-[82%] sm:max-w-[72%]"} ${mine ? "items-end" : "items-start"}`}>
                    {editing === m.id ? (
                      <MessageEditor initial={m.body} busy={edit.isPending} hint="Our team will see the updated message." onCancel={() => setEditing(null)} onSave={(t) => edit.mutate({ id: m.id, text: t })} />
                    ) : (
                      <p className={`whitespace-pre-wrap break-words rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${mine ? "rounded-br-md bg-forest-900 text-white" : "rounded-bl-md border border-line bg-white"}`}>{m.body}</p>
                    )}
                    {editing !== m.id && (
                      <span className="flex items-center gap-2 px-1 text-xs text-muted">
                        {!mine ? "Verdant & Co · " : ""}{shortTime(m.created_at)}{m.edited_at ? " · Edited" : ""}
                        {canEdit && <button type="button" className="inline-flex items-center gap-1 font-medium text-emerald-600 hover:underline" onClick={() => setEditing(m.id)}><Pencil aria-hidden className="h-3 w-3" />Edit</button>}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
            {last?.sender === "customer" && <p className="px-1 text-xs text-muted">Message received. A member of our team will reply here.</p>}
            <div ref={bottom} />
          </div>

          <div className="border-t border-line bg-white p-3 sm:p-4">
            <div className="-mx-1 mb-3 flex gap-2 overflow-x-auto px-1 pb-1 lg:hidden" aria-label="Quick questions">
              {samples.map((s) => (
                <button key={s} type="button" className="shrink-0 rounded-full border border-line bg-white px-3 py-1.5 text-xs hover:border-emerald-600 hover:bg-mint-50" onClick={() => pick(s)}>{s.length > 40 ? s.slice(0, 38) + "…" : s}</button>
              ))}
            </div>
            <form onSubmit={submit} className="flex items-end gap-2">
              <label htmlFor="msg" className="sr-only">Message</label>
              <textarea ref={input} id="msg" rows={2} maxLength={2000} className="min-h-[44px] flex-1 resize-none rounded-lg border border-line p-3 text-sm focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/20" placeholder="Type your message" value={text} disabled={!identity || send.isPending} onChange={(e) => setText(e.target.value)} onKeyDown={onKey} />
              <button type="submit" className="btn-primary h-11 w-11 shrink-0 px-0" aria-label="Send message" disabled={!identity || !text.trim() || send.isPending}>{send.isPending ? <Spinner /> : <Send aria-hidden className="h-4 w-4" />}</button>
            </form>
          </div>
        </section>
      </main>
    </div>
  );
}
