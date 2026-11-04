import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MessageCircle, Send } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { CustomerTopBar } from "../components/TopBar";
import { Avatar, ErrorState, Skeleton, Spinner, useToast } from "../components/ui";
import { api, errorMessage } from "../lib/api";
import { shortTime } from "../lib/format";

interface TestCustomer { id: string; name: string; phone: string }
interface PublicMessage { id: string; sender: "customer" | "agent"; body: string; created_at: string }
const NEW = "__new__";
const derivedId = (phone: string) => `web_${phone.replace(/\D/g, "")}`;

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

  const customers = meta.data?.customers ?? [];
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
  const submit = (e?: FormEvent) => { e?.preventDefault(); if (identity && text.trim() && !send.isPending) send.mutate(); };
  const onKey = (e: KeyboardEvent) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); } };

  return (
    <div className="flex h-dvh flex-col">
      <CustomerTopBar />
      <main className="mx-auto flex min-h-0 w-full max-w-3xl flex-1 flex-col p-3 sm:p-5">
        <div className="card flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className="flex flex-wrap items-center gap-3 border-b border-line p-4">
            {identity ? <Avatar name={identity.name} /> : <span className="flex h-10 w-10 items-center justify-center rounded-full bg-mint-100 text-forest-900"><MessageCircle aria-hidden className="h-5 w-5" /></span>}
            <div className="min-w-0 flex-1">
              <h1 className="truncate font-semibold">Chat with Verdant &amp; Co</h1>
              <p className="text-xs text-muted">Test as a customer. Your messages go through the same path as the webhook.</p>
            </div>
            <div className="w-full sm:w-56">
              <label htmlFor="who" className="sr-only">Customer</label>
              <select id="who" className="input" value={selected === NEW ? NEW : chosen?.id ?? ""} disabled={meta.isLoading}
                onChange={(e) => { setSelected(e.target.value); save("vc.customer", e.target.value); }}>
                {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                <option value={NEW}>New customer…</option>
              </select>
            </div>
            {selected === NEW && (
              <div className="grid w-full gap-2 sm:grid-cols-2">
                <div><label htmlFor="nn" className="sr-only">Name</label><input id="nn" className="input" placeholder="Name" value={newName} onChange={(e) => { setNewName(e.target.value); save("vc.newName", e.target.value); }} /></div>
                <div><label htmlFor="np" className="sr-only">Phone number</label><input id="np" className="input" placeholder="Phone, e.g. +919800000010" inputMode="tel" value={newPhone} onChange={(e) => { setNewPhone(e.target.value); save("vc.newPhone", e.target.value); }} /></div>
              </div>
            )}
          </div>

          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-canvas p-4" aria-live="polite">
            {meta.isError && <ErrorState message="Couldn't load the test customers." onRetry={() => meta.refetch()} />}
            {meta.isLoading && <Skeleton className="h-16 w-2/3" />}
            {!identity && !meta.isLoading && !meta.isError && <p className="py-10 text-center text-sm text-muted">Enter a name and a valid phone number to start chatting.</p>}
            {identity && convo.isError && !convo.data && <ErrorState message="Couldn't load your conversation." onRetry={() => convo.refetch()} />}
            {identity && convo.data && messages.length === 0 && (
              <div className="py-10 text-center">
                <p className="font-medium">Hi {identity.name.split(" ")[0]}, how can we help?</p>
                <p className="mt-1 text-sm text-muted">Send a message or pick a sample below.</p>
              </div>
            )}
            {messages.map((m) => (
              <div key={m.id} className={`message-in flex ${m.sender === "customer" ? "justify-end" : "justify-start"}`}>
                <div className="flex max-w-[85%] flex-col gap-1 sm:max-w-[75%]">
                  <p className={`whitespace-pre-wrap break-words rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${m.sender === "customer" ? "rounded-br-md bg-forest-900 text-white" : "rounded-bl-md border border-line bg-white"}`}>{m.body}</p>
                  <span className={`px-1 text-xs text-muted ${m.sender === "customer" ? "text-right" : ""}`}>{m.sender === "agent" ? "Verdant & Co · " : ""}{shortTime(m.created_at)}</span>
                </div>
              </div>
            ))}
            {last?.sender === "customer" && <p className="px-1 text-xs text-muted">Message received. A member of our team will reply here.</p>}
            <div ref={bottom} />
          </div>

          <div className="border-t border-line bg-white p-3 sm:p-4">
            <div className="mb-3 flex gap-2 overflow-x-auto pb-1" aria-label="Sample messages">
              {meta.data?.sampleMessages.map((s) => (
                <button key={s} type="button" className="shrink-0 rounded-full border border-line bg-white px-3 py-1.5 text-xs text-ink hover:border-emerald-600 hover:bg-mint-50" onClick={() => setText(s)}>{s.length > 42 ? s.slice(0, 40) + "…" : s}</button>
              ))}
            </div>
            <form onSubmit={submit} className="flex items-end gap-2">
              <label htmlFor="msg" className="sr-only">Message</label>
              <textarea id="msg" rows={2} maxLength={2000} className="min-h-[44px] flex-1 resize-none rounded-lg border border-line p-3 text-sm focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/20" placeholder="Type your message" value={text} disabled={!identity || send.isPending} onChange={(e) => setText(e.target.value)} onKeyDown={onKey} />
              <button type="submit" className="btn-primary h-11 w-11 shrink-0 px-0" aria-label="Send message" disabled={!identity || !text.trim() || send.isPending}>{send.isPending ? <Spinner /> : <Send aria-hidden className="h-4 w-4" />}</button>
            </form>
          </div>
        </div>
      </main>
    </div>
  );
}
