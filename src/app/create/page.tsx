"use client";
import Link from "next/link";
import { useState } from "react";
import { BottomNav, Button, Card, ErrorText, Screen, Spinner, useRequirePair } from "@/components/ui";
import { supabase } from "@/lib/supabase/client";
import { pingNotify } from "@/lib/notify";
import { langName } from "@/lib/config";

export default function Create() {
  const app = useRequirePair();
  const [ask, setAsk] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!app.ready) return <Screen><Spinner /></Screen>;
  const partner = app.partner!.display_name || "your partner";

  async function sendRequest(e: React.FormEvent) {
    e.preventDefault();
    const { error } = await supabase().from("requests")
      .insert({ pair_id: app.pair!.id, from_id: app.me!.id, text: ask.trim() });
    if (error) return setError(error.message);
    pingNotify();
    setAsk("");
    setSent(true);
  }

  return (
    <Screen title="Create">
      <p className="mb-4 text-ink-soft">
        You teach {partner} <b>{langName(app.me!.native_lang)}</b>. {partner} teaches you <b>{langName(app.partner!.native_lang)}</b>.
      </p>
      <div className="space-y-3">
        <Link href="/teach/new?template=word_set" className="block">
          <Option icon="🧺" title="Word set" text="Up to 10 words with translations and your voice. Becomes flashcards and quizzes." />
        </Link>
        <Link href="/teach/new?template=phrase" className="block">
          <Option icon="💬" title="Phrase of the day" text="One phrase, what it means, and when to use it." />
        </Link>
        <Link href="/challenge/new" className="block">
          <Option icon="🎯" title="Challenge" text="A quiz from words you taught, a fill-the-gap, or a 'say it back' recording." />
        </Link>
      </div>

      <Card className="mt-6">
        <form onSubmit={sendRequest} className="space-y-3">
          <h2 className="font-bold">🙋 Ask {partner} to teach you something</h2>
          <input className="field" dir="auto" placeholder="e.g. How to order coffee" value={ask}
            onChange={(e) => { setAsk(e.target.value); setSent(false); }} />
          <Button variant="soft" className="w-full" disabled={!ask.trim()}>{sent ? "Sent ✓" : "Send request"}</Button>
          <ErrorText error={error} />
        </form>
      </Card>
      <BottomNav />
    </Screen>
  );
}

function Option({ icon, title, text }: { icon: string; title: string; text: string }) {
  return (
    <Card className="flex items-start gap-3 active:scale-[0.99]">
      <span className="text-3xl">{icon}</span>
      <div>
        <p className="font-bold">{title}</p>
        <p className="text-sm text-ink-soft">{text}</p>
      </div>
    </Card>
  );
}
