"use client";
import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { Button, ErrorText } from "@/components/ui";
import { useApp } from "@/components/AppContext";
import { APP_NAME } from "@/lib/config";

function LoginForm() {
  const params = useSearchParams();
  const next = params.get("next") || "/home";
  const router = useRouter();
  const { refresh } = useApp();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(params.get("error"));

  async function send(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await supabase().auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: `${location.origin}/auth/callback?next=${encodeURIComponent(next)}` },
    });
    setBusy(false);
    if (error) setError(error.message);
    else setSent(true);
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await supabase().auth.verifyOtp({ email: email.trim(), token: code.trim(), type: "email" });
    setBusy(false);
    if (error) return setError(error.message);
    await refresh();
    router.replace(next);
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-6">
      <h1 className="mb-2 text-3xl font-extrabold">{APP_NAME}</h1>
      {!sent ? (
        <form onSubmit={send} className="space-y-4">
          <p className="text-ink-soft">Enter your email. We&apos;ll send you a sign-in link and code. No password needed.</p>
          <input className="field" type="email" required autoComplete="email" placeholder="you@example.com"
            value={email} onChange={(e) => setEmail(e.target.value)} />
          <Button className="w-full" disabled={busy}>{busy ? "Sending…" : "Send me a link"}</Button>
        </form>
      ) : (
        <form onSubmit={verify} className="space-y-4">
          <p className="text-ink-soft">
            Check <b>{email}</b>. Tap the link in the email, <b>or</b> type the code here.
            Using the app from your home screen? Use the code.
          </p>
          <input className="field text-center text-2xl tracking-[0.4em]" inputMode="numeric" autoComplete="one-time-code"
            placeholder="123456" maxLength={10} value={code} onChange={(e) => setCode(e.target.value)} />
          <Button className="w-full" disabled={busy || code.trim().length < 6}>{busy ? "Checking…" : "Sign in"}</Button>
          <button type="button" className="w-full text-sm text-ink-soft underline" onClick={() => setSent(false)}>
            Use a different email
          </button>
        </form>
      )}
      <ErrorText error={error} />
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
