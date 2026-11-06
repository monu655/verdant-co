import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Spinner } from "./ui";

/** Inline editor shown in place of a chat bubble. Ctrl/Cmd+Enter saves, Escape cancels. */
export function MessageEditor({ initial, busy, onSave, onCancel, tone = "light", hint }: {
  initial: string; busy: boolean; onSave: (text: string) => void; onCancel: () => void; tone?: "light" | "dark"; hint?: string;
}) {
  const [text, setText] = useState(initial);
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { const el = ref.current; if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); } }, []);
  const changed = text.trim() !== initial.trim() && text.trim().length > 0;
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape") { e.preventDefault(); onCancel(); }
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && changed && !busy) { e.preventDefault(); onSave(text.trim()); }
  };
  return (
    <div className="w-full min-w-[min(18rem,100%)] space-y-2" role="group" aria-label="Edit message">
      <label htmlFor="edit-msg" className="sr-only">Edit message</label>
      <textarea ref={ref} id="edit-msg" rows={3} maxLength={2000} value={text} disabled={busy} onChange={(e) => setText(e.target.value)} onKeyDown={onKey}
        className={`w-full resize-y rounded-xl border p-3 text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-emerald-600/30 ${tone === "dark" ? "border-forest-900 bg-white" : "border-emerald-600 bg-white"}`} />
      {hint && <p className="text-xs text-muted">{hint}</p>}
      <div className="flex justify-end gap-2">
        <button type="button" className="btn-secondary h-9 px-3 text-sm" onClick={onCancel} disabled={busy}>Cancel</button>
        <button type="button" className="btn-primary h-9 px-3 text-sm" onClick={() => onSave(text.trim())} disabled={busy || !changed}>{busy && <Spinner />}Save</button>
      </div>
    </div>
  );
}
