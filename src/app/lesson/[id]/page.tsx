"use client";
import Link from "next/link";
import { use, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { PlayButton } from "@/components/Audio";
import { Button, Card, ErrorText, Screen, Spinner, T, timeAgo, useRequirePair } from "@/components/ui";
import { supabase } from "@/lib/supabase/client";
import { langDir } from "@/lib/config";
import type { Item, Lesson } from "@/lib/types";

function LessonView({ id }: { id: string }) {
  const app = useRequirePair();
  const params = useSearchParams();
  const [lesson, setLesson] = useState<Lesson | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [done, setDone] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!app.ready) return;
    const sb = supabase();
    (async () => {
      const [{ data: l }, { data: it }] = await Promise.all([
        sb.from("lessons").select("*").eq("id", id).maybeSingle<Lesson>(),
        sb.from("items").select("*").eq("lesson_id", id).order("position"),
      ]);
      setLesson(l);
      setItems((it ?? []) as Item[]);
      if (l && l.recipient_id === app.me!.id && !l.opened_at) sb.rpc("open_lesson", { p_lesson: id });
    })();
  }, [app.ready, app.me, id]);

  if (!app.ready) return <Screen><Spinner /></Screen>;
  if (!lesson) return <Screen back="/home"><Spinner /></Screen>;

  const iAmLearner = lesson.recipient_id === app.me!.id;
  const teacher = iAmLearner ? app.partner! : app.me!;
  const learner = iAmLearner ? app.me! : app.partner!;
  const termDir = langDir(teacher.native_lang);
  const transDir = langDir(learner.native_lang);

  async function complete() {
    setBusy(true);
    const { data, error } = await supabase().rpc("complete_lesson", { p_lesson: id });
    setBusy(false);
    if (error) return setError(error.message);
    setDone(typeof data === "number" ? data : 0);
    setLesson((l) => (l ? { ...l, completed_at: new Date().toISOString() } : l));
  }

  return (
    <Screen back="/home">
      {params.get("sent") && (
        <Card className="mb-4 bg-mint-soft text-center">
          <p className="text-lg font-bold">Sent to {app.partner!.display_name}! 🎉</p>
          <p className="text-sm text-ink-soft">+5 points, plus 2 for each recording.</p>
          <Link href="/home" className="mt-2 inline-block text-sm font-semibold text-mint underline">Back home</Link>
        </Card>
      )}

      <p className="text-sm text-ink-soft">
        {iAmLearner ? `From ${teacher.display_name}` : `To ${learner.display_name}`} · {timeAgo(lesson.created_at)}
      </p>
      <T as="h2" className="mb-1 text-2xl font-bold">{lesson.title}</T>
      {lesson.prompt && <T as="p" className="mb-4 text-sm text-ink-soft">💡 {lesson.prompt}</T>}

      <div className="space-y-3">
        {items.map((it) => (
          <Card key={it.id} className="flex items-start gap-3">
            {it.audio_path ? <PlayButton path={it.audio_path} /> : <div className="h-11 w-11 shrink-0" />}
            <div className="min-w-0 flex-1">
              <p dir={termDir} className="text-xl font-bold">{it.term}</p>
              {it.translation && <p dir={transDir} className="text-ink-soft">{it.translation}</p>}
              {it.note && <T as="p" className="mt-1 rounded-lg bg-sun/20 px-2 py-1 text-sm">✍️ {it.note}</T>}
            </div>
          </Card>
        ))}
      </div>

      <div className="mt-6">
        {iAmLearner && !lesson.completed_at && (
          <Button className="w-full" disabled={busy} onClick={complete}>
            {busy ? "Saving…" : "Got it! Add to my cards"}
          </Button>
        )}
        {iAmLearner && lesson.completed_at && (
          <Card className="space-y-3 text-center">
            <p className="text-lg font-bold">{done !== null ? `+10 points · ${done} new cards 🃏` : "Done ✓"}</p>
            <div className="grid grid-cols-2 gap-2">
              <Link href="/cards"><Button variant="soft" className="w-full">Review cards</Button></Link>
              <Link href="/create"><Button className="w-full">Teach back</Button></Link>
            </div>
          </Card>
        )}
        {!iAmLearner && (
          <Card className="text-center text-sm text-ink-soft">
            {lesson.completed_at
              ? `✓ ${learner.display_name} learned this ${timeAgo(lesson.completed_at)}`
              : lesson.opened_at ? `👀 ${learner.display_name} opened it` : `Not opened yet`}
            {items.length >= 2 && (
              <Link href={`/challenge/new?kind=quiz&lesson=${lesson.id}`} className="mt-2 block font-semibold text-brand">
                Make a quiz from these →
              </Link>
            )}
          </Card>
        )}
        <ErrorText error={error} />
      </div>
    </Screen>
  );
}

export default function LessonPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <Suspense><LessonView id={id} /></Suspense>;
}
