"use client";
import { useRouter } from "next/navigation";
import { BottomNav, Button, Card, Screen, Spinner, useRequirePair } from "@/components/ui";
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
