import { AlertCircle, CheckCircle2, Info, Loader2, X } from "lucide-react";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { initials } from "../lib/format";

export function Spinner({ className = "" }: { className?: string }) {
  return <Loader2 aria-hidden className={`h-4 w-4 animate-spin ${className}`} />;
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div aria-hidden className={`animate-pulse rounded-md bg-mint-100/70 ${className}`} />;
}

const AVATAR_TONES = ["bg-mint-100 text-forest-900", "bg-emerald-600 text-white", "bg-forest-900 text-mint-100", "bg-stone-200 text-stone-700", "bg-teal-100 text-teal-900"];
export function Avatar({ name, size = 40 }: { name: string; size?: number }) {
  const tone = AVATAR_TONES[[...name].reduce((a, c) => a + c.charCodeAt(0), 0) % AVATAR_TONES.length];
  return (
    <span aria-hidden style={{ width: size, height: size, fontSize: Math.max(11, size * 0.36) }}
      className={`inline-flex shrink-0 select-none items-center justify-center rounded-full font-semibold ${tone}`}>
      {initials(name)}
    </span>
  );
}

export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "green" | "amber" | "red" }) {
  const tones = { neutral: "bg-slate-100 text-slate-700", green: "bg-mint-100 text-forest-900", amber: "bg-amber-100 text-amber-800", red: "bg-red-100 text-red-800" };
  return <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${tones[tone]}`}>{children}</span>;
}

export function EmptyState({ icon, title, children, action }: { icon: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-12 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-mint-50 text-forest-900">{icon}</span>
      <h3 className="text-base font-semibold">{title}</h3>
      {children && <p className="max-w-sm text-sm text-muted">{children}</p>}
      {action}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-center gap-3 px-6 py-10 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-red-50 text-danger"><AlertCircle aria-hidden className="h-6 w-6" /></span>
      <p className="max-w-sm text-sm text-muted">{message}</p>
      {onRetry && <button className="btn-secondary" onClick={onRetry}>Try again</button>}
    </div>
  );
}

// ---- Toasts ----
type Toast = { id: number; kind: "success" | "error" | "info"; text: string };
const ToastCtx = createContext<{ push: (kind: Toast["kind"], text: string) => void }>({ push: () => undefined });
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);
  const push = useCallback((kind: Toast["kind"], text: string) => {
    const id = nextId.current++;
    setToasts((t) => [...t.slice(-3), { id, kind, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === "error" ? 7000 : 4000);
  }, []);
  const icons = { success: <CheckCircle2 className="h-5 w-5 text-ok" />, error: <AlertCircle className="h-5 w-5 text-danger" />, info: <Info className="h-5 w-5 text-emerald-600" /> };
  return (
    <ToastCtx.Provider value={{ push }}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-20 z-[60] flex flex-col items-center gap-2 px-4 md:bottom-6 md:items-end md:px-6">
        {toasts.map((t) => (
          <div key={t.id} role={t.kind === "error" ? "alert" : "status"} className="toast-in pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-xl border border-line bg-white p-3.5 text-sm shadow-pop">
            <span className="mt-0.5">{icons[t.kind]}</span>
            <p className="flex-1">{t.text}</p>
            <button aria-label="Dismiss notification" className="text-muted hover:text-ink" onClick={() => setToasts((x) => x.filter((y) => y.id !== t.id))}><X className="h-4 w-4" /></button>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

// ---- Dialog ----
export function ConfirmDialog({ open, title, body, confirmLabel, tone = "primary", busy, onConfirm, onCancel }: {
  open: boolean; title: string; body: string; confirmLabel: string; tone?: "primary" | "danger"; busy?: boolean; onConfirm: () => void; onCancel: () => void;
}) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    cancelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !busy && onCancel();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, busy, onCancel]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-forest-950/40 p-4 sm:items-center" onMouseDown={(e) => e.target === e.currentTarget && !busy && onCancel()}>
      <div role="alertdialog" aria-modal="true" aria-labelledby="dlg-title" aria-describedby="dlg-body" className="toast-in w-full max-w-sm rounded-2xl bg-white p-5 shadow-pop">
        <h2 id="dlg-title" className="text-base font-semibold">{title}</h2>
        <p id="dlg-body" className="mt-1.5 text-sm text-muted">{body}</p>
        <div className="mt-5 flex justify-end gap-2">
          <button ref={cancelRef} className="btn-secondary" disabled={busy} onClick={onCancel}>Cancel</button>
          <button className={tone === "danger" ? "btn-danger" : "btn-primary"} disabled={busy} onClick={onConfirm}>
            {busy && <Spinner />}{confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export function Logo({ compact = false, light = false }: { compact?: boolean; light?: boolean }) {
  return (
    <span className="flex items-center gap-2.5">
      <svg aria-hidden viewBox="0 0 32 32" className="h-8 w-8 shrink-0"><rect width="32" height="32" rx="8" fill={light ? "#D1FAE5" : "#064E3B"} /><path d="M9 21c0-7 5-11 14-12 0 8-4 13-11 13-1 0-2 0-3-1Z" fill={light ? "#064E3B" : "#D1FAE5"} /><path d="M9 23c3-5 6-8 11-11" stroke={light ? "#D1FAE5" : "#064E3B"} strokeWidth="1.6" strokeLinecap="round" fill="none" /></svg>
      {!compact && (
        <span className="leading-tight">
          <span className={`block text-[15px] font-semibold ${light ? "text-white" : "text-forest-900"}`}>Verdant &amp; Co</span>
          <span className={`block text-xs ${light ? "text-mint-100/80" : "text-muted"}`}>Pure Care. Naturally.</span>
        </span>
      )}
    </span>
  );
}
