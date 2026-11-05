"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { BottomNav, Button, Card, ErrorText, Screen, Spinner, useRequirePair } from "@/components/ui";
import { ProfileForm } from "@/components/ProfileForm";
import { supabase } from "@/lib/supabase/client";
import { langName } from "@/lib/config";

export default function Me() {
  const app = useRequirePair();
  const router = useRouter();
  if (!app.ready) return <Screen><Spinner /></Screen>;

  return (
    <Screen title="You" back="/home">
      <Card className="mb-4">
        <ProfileForm me={app.me!} onSaved={() => app.refresh()} />
      </Card>
      <Card className="mb-4">
        <EmailSwitch on={app.me!.email_notify !== false} partner={app.partner!.display_name} id={app.me!.id} onSaved={() => app.refresh()} />
      </Card>
      <Card className="mb-4 text-sm">
        Partner: <b>{app.partner!.display_name}</b> · teaches {langName(app.partner!.native_lang)},
        learns {langName(app.partner!.learning_lang)}
      </Card>
      <Button variant="ghost" className="w-full" onClick={async () => {
        await supabase().auth.signOut();
        await app.refresh();
        router.replace("/");
      }}>Sign out</Button>
      <BottomNav />
    </Screen>
  );
}

function EmailSwitch({ on, partner, id, onSaved }: { on: boolean; partner: string; id: string; onSaved: () => void }) {
  const [value, setValue] = useState(on);
  const [error, setError] = useState<string | null>(null);

  async function toggle(next: boolean) {
    setValue(next);
    setError(null);
    const { error } = await supabase().from("profiles").update({ email_notify: next }).eq("id", id);
    if (error) {
      setValue(!next);
      setError(error.message);
    } else onSaved();
  }

  return (
    <>
      <label className="flex items-center justify-between gap-3">
        <span>
          <span className="block font-semibold">Email me</span>
          <span className="block text-sm text-ink-soft">When {partner || "your partner"} sends a lesson, a challenge, an answer or a request.</span>
        </span>
        <input type="checkbox" className="h-6 w-6 shrink-0 accent-current" checked={value}
          onChange={(e) => toggle(e.target.checked)} />
      </label>
      <ErrorText error={error} />
    </>
  );
}
