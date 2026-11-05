"use client";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AudioRecorder } from "@/components/Audio";
import { Button, Card, ErrorText, Screen, Spinner, useRequirePair } from "@/components/ui";
import { supabase } from "@/lib/supabase/client";
import { pingNotify } from "@/lib/notify";
import { uploadAudio } from "@/lib/audio";
import { buildQuiz } from "@/lib/quiz";
import { langDir, langName } from "@/lib/config";
import type { Item } from "@/lib/types";

type Kind = "quiz" | "gap" | "translate" | "record";

function NewChallenge() {
  const app = useRequirePair();
  const router = useRouter();
  const params = useSearchParams();
  const [kind, setKind] = useState<Kind>((params.get("kind") as Kind) || "quiz");
  const [pool, setPool] = useState<(Item & { lessons: { title: string; created_at: string } })[]>([]);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [sentence, setSentence] = useState("");
  const [gap, setGap] = useState<number | null>(null);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [recordPrompt, setRecordPrompt] = useState("");
  const [model, setModel] = useState<Blob | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!app.ready) return;
    supabase().from("items").select("*, lessons!inner(title, created_at, author_id)")
      .eq("lessons.author_id", app.me!.id).order("created_at", { ascending: false }).limit(200)
      .then(({ data }) => {
        const rows = (data ?? []) as typeof pool;
        setPool(rows);
        const fromLesson = params.get("lesson");
        const first = fromLesson ? rows.filter((r) => r.lesson_id === fromLesson) : rows.slice(0, 5);
        setPicked(new Set(first.map((r) => r.id)));
      });
  }, [app.ready, app.me, params]);

  const words = useMemo(() => sentence.trim().split(/\s+/).filter(Boolean), [sentence]);

  if (!app.ready) return <Screen><Spinner /></Screen>;
  const myLang = app.me!.native_lang;
  const theirLang = app.partner!.native_lang;
  const partner = app.partner!.display_name || "your partner";

  async function send() {
    setBusy(true);
    setError(null);
    try {
      let row: { kind: string; prompt: string; data: Record<string, unknown> };
      if (kind === "quiz") {
        const chosen = pool.filter((p) => picked.has(p.id));
        if (chosen.length < 2 || pool.length < 2) throw new Error("Pick at least 2 words for a quiz.");
        row = { kind: "quiz", prompt: `Quiz: ${chosen.length} words`, data: { questions: buildQuiz(chosen, pool) } };
      } else if (kind === "gap") {
        if (gap === null) throw new Error("Tap a word to hide it.");
        row = { kind: "type", prompt: "Fill the gap",
          data: { mode: "gap", sentence: words.map((w, i) => (i === gap ? "____" : w)).join(" "), answer: words[gap] } };
      } else if (kind === "translate") {
        if (!question.trim() || !answer.trim()) throw new Error("Write the question and the answer.");
        row = { kind: "type", prompt: question.trim(), data: { mode: "translate", answer: answer.trim() } };
      } else {
        if (!recordPrompt.trim()) throw new Error("Write what they should say.");
        const audio_path = model ? await uploadAudio(app.pair!.id, model) : null;
        row = { kind: "record", prompt: recordPrompt.trim(), data: { audio_path } };
      }
      const { data, error } = await supabase().from("challenges").insert({
        pair_id: app.pair!.id, author_id: app.me!.id, recipient_id: app.partner!.id, ...row,
      }).select("id").single();
      if (error) throw error;
      pingNotify();
      router.replace(`/challenge/${data.id}?sent=1`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
      setBusy(false);
    }
  }

  const tabs: { k: Kind; label: string }[] = [
    { k: "quiz", label: "Quiz" }, { k: "gap", label: "Fill gap" },
    { k: "translate", label: "Translate" }, { k: "record", label: "Say it" },
  ];

  return (
    <Screen title="New challenge" back="/create">
      <div className="mb-4 grid grid-cols-4 gap-1 rounded-xl bg-white p-1 shadow-sm">
        {tabs.map((t) => (
          <button key={t.k} type="button" onClick={() => setKind(t.k)}
            className={`rounded-lg py-2 text-sm font-semibold ${kind === t.k ? "bg-brand text-white" : "text-ink-soft"}`}>
            {t.label}
          </button>
        ))}
      </div>

      {kind === "quiz" && (
        <Card>
          <p className="mb-3 text-sm text-ink-soft">
            Pick words you already taught {partner}. The app makes the questions and wrong answers.
          </p>
          {pool.length < 2 ? (
            <p className="text-sm">Teach at least 2 words first. Then you can quiz {partner} on them.</p>
          ) : (
            <ul className="max-h-[50dvh] space-y-1 overflow-y-auto">
              {pool.map((p) => (
                <li key={p.id}>
                  <label className="flex items-center gap-3 rounded-lg px-1 py-2">
                    <input type="checkbox" className="h-5 w-5 accent-brand" checked={picked.has(p.id)}
                      onChange={(e) => setPicked((s) => {
                        const n = new Set(s);
                        if (e.target.checked) n.add(p.id); else n.delete(p.id);
                        return n;
                      })} />
                    <span dir={langDir(myLang)} className="font-semibold">{p.term}</span>
                    <span dir={langDir(theirLang)} className="truncate text-sm text-ink-soft">{p.translation}</span>
                  </label>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      {kind === "gap" && (
        <Card className="space-y-3">
          <p className="text-sm text-ink-soft">Write a sentence in {langName(myLang)}. Then tap the word to hide.</p>
          <textarea className="field" rows={2} dir={langDir(myLang)} value={sentence}
            onChange={(e) => { setSentence(e.target.value); setGap(null); }} placeholder="e.g. The scaphoid is a bone in the wrist" />
          {words.length > 1 && (
            <div dir={langDir(myLang)} className="flex flex-wrap gap-2">
              {words.map((w, i) => (
                <button key={i} type="button" onClick={() => setGap(i)}
                  className={`rounded-lg px-2 py-1 ${gap === i ? "bg-brand text-white" : "bg-paper"}`}>
                  {gap === i ? "____" : w}
                </button>
              ))}
            </div>
          )}
        </Card>
      )}

      {kind === "translate" && (
        <Card className="space-y-3">
          <p className="text-sm text-ink-soft">Ask {partner} to type something. Accents and Arabic vowel marks don&apos;t matter.</p>
          <input className="field" dir="auto" value={question} onChange={(e) => setQuestion(e.target.value)}
            placeholder={`e.g. How do you say "wrist" in ${langName(myLang)}?`} />
          <input className="field" dir={langDir(myLang)} value={answer} onChange={(e) => setAnswer(e.target.value)}
            placeholder="The right answer" />
        </Card>
      )}

      {kind === "record" && (
        <Card className="space-y-3">
          <p className="text-sm text-ink-soft">{partner} records themselves. You listen and rate it.</p>
          <input className="field" dir="auto" value={recordPrompt} onChange={(e) => setRecordPrompt(e.target.value)}
            placeholder="e.g. Say: صباح الخير" />
          <AudioRecorder value={model} onChange={setModel} label="Record how it should sound (optional)" />
        </Card>
      )}

      <Button className="mt-6 w-full" disabled={busy} onClick={send}>{busy ? "Sending…" : `Send to ${partner}`}</Button>
      <ErrorText error={error} />
    </Screen>
  );
}

export default function Page() {
  return <Suspense><NewChallenge /></Suspense>;
}
