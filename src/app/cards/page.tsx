"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { PlayButton } from "@/components/Audio";
import { BottomNav, Button, Card, Screen, Spinner, T, useRequirePair } from "@/components/ui";
import { supabase } from "@/lib/supabase/client";
import { MASTERED_BOX, review } from "@/lib/srs";
import { langDir } from "@/lib/config";
import type { Flashcard } from "@/lib/types";

export default function Cards() {
  const app = useRequirePair();
  const [queue, setQueue] = useState<Flashcard[] | null>(null);
  const [stats, setStats] = useState({ total: 0, mastered: 0 });
  const [flipped, setFlipped] = useState(false);
  const [reviewed, setReviewed] = useState(0);
  const [bonus, setBonus] = useState(false);

  const load = useCallback(async () => {
    const sb = supabase();
    const me = app.me!.id;
    const [{ data: due }, all] = await Promise.all([
      sb.from("flashcards").select("*, items(*)").eq("owner_id", me)
        .lte("due_at", new Date().toISOString()).order("due_at").limit(30),
      sb.from("flashcards").select("box").eq("owner_id", me),
    ]);
    setQueue((due ?? []) as Flashcard[]);
    const boxes = all.data ?? [];
    setStats({ total: boxes.length, mastered: boxes.filter((b) => b.box >= MASTERED_BOX).length });
  }, [app.me]);

  useEffect(() => { if (app.ready) load(); }, [app.ready, load]);

  if (!app.ready || !queue) return <Screen title="Flashcards"><Spinner /></Screen>;

  const card = queue[0];
  const termDir = langDir(app.partner!.native_lang);
  const transDir = langDir(app.me!.native_lang);

  async function answer(correct: boolean) {
    const next = review(card, correct);
    await supabase().from("flashcards").update(next).eq("id", card.id);
    setFlipped(false);
    setReviewed((n) => n + 1);
    // A wrong card comes back at the end of this session.
    setQueue((q) => (q ? [...q.slice(1), ...(correct ? [] : [{ ...card, ...next }])] : q));
    if (reviewed === 0) {
      const { data } = await supabase().rpc("claim_daily_review");
      if (data) setBonus(true);
    }
  }

  return (
    <Screen title="Flashcards">
      <p className="mb-4 text-sm text-ink-soft">
        {stats.total} card{stats.total === 1 ? "" : "s"} · {stats.mastered} mastered
        {bonus && <span className="ml-2 font-semibold text-mint">+5 daily review bonus</span>}
      </p>

      {!card ? (
        <Card className="text-center">
          <p className="mb-2 text-4xl">✨</p>
          <p className="font-bold">{reviewed > 0 ? `Done! You reviewed ${reviewed} cards.` : "No cards due right now."}</p>
          <p className="mt-1 text-sm text-ink-soft">
            {stats.total === 0 ? "Finish a lesson from your partner to get cards." : "Come back later for the next ones."}
          </p>
          <Link href="/home" className="mt-4 block font-semibold text-brand">Back home</Link>
        </Card>
      ) : (
        <>
          <p className="mb-2 text-xs text-ink-soft">{queue.length} left</p>
          <button type="button" className="flip block w-full" onClick={() => setFlipped((f) => !f)}>
            <div className={`flip-inner relative h-72 ${flipped ? "flipped" : ""}`}>
              <div className="flip-face absolute inset-0 flex flex-col items-center justify-center rounded-3xl bg-white p-6 shadow-md">
                <p dir={termDir} className="text-3xl font-bold">{card.items?.term}</p>
                <p className="mt-6 text-xs text-ink-soft">Tap to see the meaning</p>
              </div>
              <div className="flip-face flip-back absolute inset-0 flex flex-col items-center justify-center rounded-3xl bg-mint-soft p-6 shadow-md">
                <p dir={termDir} className="text-xl font-semibold text-ink-soft">{card.items?.term}</p>
                <p dir={transDir} className="mt-2 text-3xl font-bold">{card.items?.translation || "—"}</p>
                {card.items?.note && <T as="p" className="mt-3 text-sm">✍️ {card.items.note}</T>}
              </div>
            </div>
          </button>
          {card.items?.audio_path && (
            <div className="mt-3 flex justify-center"><PlayButton path={card.items.audio_path} /></div>
          )}
          <div className="mt-5 grid grid-cols-2 gap-3">
            <Button variant="soft" onClick={() => answer(false)}>😅 Didn&apos;t know</Button>
            <Button onClick={() => answer(true)}>😎 Knew it</Button>
          </div>
        </>
      )}
      <BottomNav />
    </Screen>
  );
}
