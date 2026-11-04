import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Eye, EyeOff, LogIn } from "lucide-react";
import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { CustomerTopBar } from "../components/TopBar";
import { Spinner } from "../components/ui";
import { api, errorMessage, type Agent } from "../lib/api";

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

  return (
    <div className="flex min-h-dvh flex-col">
      <CustomerTopBar />
      <main className="flex flex-1 items-center justify-center p-4">
        <form onSubmit={submit} className="card w-full max-w-sm space-y-4 p-6" noValidate>
          <div>
            <h1 className="text-xl font-semibold">Agent sign in</h1>
            <p className="mt-1 text-sm text-muted">Review AI-drafted replies and answer customers.</p>
          </div>
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
      </main>
    </div>
  );
}
