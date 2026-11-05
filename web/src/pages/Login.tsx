import { useMutation, useQueryClient } from "@tanstack/react-query";
import { BookOpen, Eye, EyeOff, KeyRound, LifeBuoy, LogIn, ShieldCheck, type LucideIcon } from "lucide-react";
import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { Botanical } from "../components/Botanical";
import { CustomerTopBar } from "../components/TopBar";
import { Spinner } from "../components/ui";
import { api, errorMessage, type Agent } from "../lib/api";

// Demo account details shown below the sign-in form (sample data only).
const DEMO_EMAIL = "APNA-AGENT-EMAIL";
const DEMO_PASSWORD = "APNA-AGENT-PASSWORD";
const HAS_DEMO = Boolean(DEMO_EMAIL && DEMO_PASSWORD);

const POINTS: { icon: LucideIcon; title: string; text: string }[] = [
  { icon: BookOpen, title: "Drafts from your policies", text: "Suggested replies use only the knowledge base." },
  { icon: ShieldCheck, title: "You approve every reply", text: "Nothing reaches a customer until you send it." },
  { icon: LifeBuoy, title: "Careful when unsure", text: "Questions the policies don't cover are flagged for a person." },
];

export function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const qc = useQueryClient();
  const nav = useNavigate();
  const login = useMutation({
    mutationFn: () => api<{ agent: Agent }>("/api/auth/login", { method: "POST", body: { email, password } }),
    onSuccess: (d) => { qc.setQueryData(["me"], d.agent); nav("/agent", { replace: true }); },
  });
  const submit = (e: FormEvent) => { e.preventDefault(); if (!login.isPending) login.mutate(); };
  const fillDemo = () => { setEmail(DEMO_EMAIL ?? ""); setPassword(DEMO_PASSWORD ?? ""); setShow(true); login.reset(); };

  return (
    <div className="flex min-h-dvh flex-col">
      <CustomerTopBar />
      <main className="grid flex-1 lg:grid-cols-[1.1fr_1fr]">
        <section className="relative hidden overflow-hidden bg-forest-950 text-mint-100 lg:flex lg:items-center lg:px-14 xl:px-24">
          <Botanical className="pointer-events-none absolute bottom-0 -right-10 h-[92%] w-auto text-emerald-600/30" />
          <div className="relative max-w-md py-16">
            <h2 className="text-4xl font-semibold leading-[1.15] tracking-tight text-white">Every reply, reviewed by a person.</h2>
            <p className="mt-4 text-base leading-relaxed text-mint-100/80">The AI drafts. You edit and approve. Customers only see what you send.</p>
            <ul className="mt-10 space-y-6">
              {POINTS.map(({ icon: Icon, title, text }) => (
                <li key={title} className="flex gap-4">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-mint-100/20 text-mint-100"><Icon aria-hidden className="h-5 w-5" /></span>
                  <span>
                    <span className="block text-sm font-semibold text-white">{title}</span>
                    <span className="mt-0.5 block text-sm text-mint-100/70">{text}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="flex items-center justify-center bg-canvas px-4 py-10 sm:px-8">
          <div className="w-full max-w-sm">
            <h1 className="text-2xl font-semibold tracking-tight">Welcome back</h1>
            <p className="mt-1.5 text-sm text-muted">Sign in to review drafts and answer customers.</p>

            <form onSubmit={submit} className="card mt-6 space-y-4 p-5 sm:p-6" noValidate>
              {login.isError && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{errorMessage(login.error)}</p>}
              <div className="space-y-1.5">
                <label htmlFor="email" className="text-sm font-medium">Email</label>
                <input id="email" type="email" autoComplete="username" required className="input" value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="password" className="text-sm font-medium">Password</label>
                <div className="relative">
                  <input id="password" type={show ? "text" : "password"} autoComplete="current-password" required className="input pr-11" value={password} onChange={(e) => setPassword(e.target.value)} />
                  <button type="button" aria-label={show ? "Hide password" : "Show password"} className="absolute right-1 top-1 flex h-8 w-8 items-center justify-center rounded-md text-muted hover:text-ink" onClick={() => setShow((s) => !s)}>
                    {show ? <EyeOff aria-hidden className="h-4 w-4" /> : <Eye aria-hidden className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              <button type="submit" className="btn-primary w-full" disabled={login.isPending || !email || !password}>
                {login.isPending ? <Spinner /> : <LogIn aria-hidden className="h-4 w-4" />}Sign in
              </button>
            </form>

            {HAS_DEMO && (
              <div className="mt-4 rounded-xl border border-dashed border-emerald-600/50 bg-mint-50 p-4">
                <p className="text-sm font-semibold text-forest-900">Demo account</p>
                <p className="mt-0.5 text-xs text-muted">Sample data only. Use these details to sign in.</p>
                <dl className="mt-3 space-y-2 text-sm">
                  <div className="flex items-baseline justify-between gap-3"><dt className="text-muted">Email</dt><dd className="select-all break-all text-right font-medium">{DEMO_EMAIL}</dd></div>
                  <div className="flex items-baseline justify-between gap-3"><dt className="text-muted">Password</dt><dd className="select-all break-all text-right font-medium">{DEMO_PASSWORD}</dd></div>
                </dl>
                <button type="button" className="btn-secondary mt-3 w-full" onClick={fillDemo}><KeyRound aria-hidden className="h-4 w-4" />Fill in these details</button>
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}