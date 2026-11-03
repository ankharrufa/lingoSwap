"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useApp } from "@/components/AppContext";
import { ProfileForm } from "@/components/ProfileForm";
import { Button, Card, ErrorText, Screen, Spinner } from "@/components/ui";
import { supabase } from "@/lib/supabase/client";

export default function Onboarding() {
  const app = useApp();
  const router = useRouter();
  const [step, setStep] = useState<"profile" | "partner">("profile");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!app.loading && !app.user) router.replace("/login");
  }, [app.loading, app.user, router]);

  if (app.loading || !app.me) return <Screen><Spinner /></Screen>;

  const complete = !!app.pair?.user_b;
  const link = app.pair ? `${typeof location !== "undefined" ? location.origin : ""}/join/${app.pair.invite_code}` : "";

  async function createInvite() {
    setBusy(true);
    setError(null);
    const { error } = await supabase().rpc("create_pair");
    setBusy(false);
    if (error) setError(error.message);
    await app.refresh();
  }

  async function join(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await supabase().rpc("join_pair", { p_code: code.trim() });
    setBusy(false);
    if (error) return setError(error.message);
    await app.refresh();
    router.replace("/home");
  }

  async function share() {
    if (navigator.share) {
      try { await navigator.share({ title: "Learn with me", text: "Let's teach each other!", url: link }); return; }
      catch { /* user closed the share sheet */ }
    }
    await navigator.clipboard.writeText(link);
    setCopied(true);
  }

  if (step === "profile") {
    return (
      <Screen title="Welcome 👋">
        <p className="mb-5 text-ink-soft">First, a little about you.</p>
        <ProfileForm me={app.me} cta="Next" onSaved={async () => {
          await app.refresh();
          if (complete) router.replace("/home");
          else setStep("partner");
        }} />
      </Screen>
    );
  }

  return (
    <Screen title="Find your partner">
      {app.pair && !complete ? (
        <Card className="space-y-4">
          <p>Send this link to your partner. When they open it and sign in, you&apos;re paired.</p>
          <div className="break-all rounded-xl bg-paper p-3 font-mono text-sm">{link}</div>
          <p className="text-sm text-ink-soft">Or give them this code: <b className="font-mono text-ink">{app.pair.invite_code}</b></p>
          <Button className="w-full" onClick={share}>{copied ? "Copied ✓" : "Share invite"}</Button>
          <Button variant="soft" className="w-full" onClick={async () => {
            await app.refresh();
          }}>My partner joined, check again</Button>
        </Card>
      ) : !app.pair ? (
        <div className="space-y-4">
          <Card className="space-y-3">
            <h2 className="font-bold">Invite someone</h2>
            <p className="text-sm text-ink-soft">Get a link to send to your partner.</p>
            <Button className="w-full" onClick={createInvite} disabled={busy}>Create invite link</Button>
          </Card>
          <Card>
            <form onSubmit={join} className="space-y-3">
              <h2 className="font-bold">Got a code?</h2>
              <input className="field font-mono" placeholder="e.g. 3f9a12bc" value={code}
                onChange={(e) => setCode(e.target.value)} />
              <Button variant="soft" className="w-full" disabled={busy || !code.trim()}>Join partner</Button>
            </form>
          </Card>
        </div>
      ) : (
        <Button className="w-full" onClick={() => router.replace("/home")}>You&apos;re paired. Start!</Button>
      )}
      <ErrorText error={error} />
    </Screen>
  );
}
