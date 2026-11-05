"use client";
import Link from "next/link";
import { Suspense, use, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AudioRecorder, PlayButton } from "@/components/Audio";
import { Button, Card, ErrorText, Screen, Spinner, T, timeAgo, useRequirePair } from "@/components/ui";
import { supabase } from "@/lib/supabase/client";
import { pingNotify } from "@/lib/notify";
import { uploadAudio } from "@/lib/audio";
import { answersMatch } from "@/lib/normalize";
import { scoreQuiz, type QuizQuestion } from "@/lib/quiz";
import { langDir } from "@/lib/config";
import type { Attempt, Challenge } from "@/lib/types";

const RATINGS = [
  { k: "perfect", label: "Perfect", icon: "🌟" },
  { k: "close", label: "Close", icon: "👍" },
  { k: "try_again", label: "Try again", icon: "🔁" },
] as const;

function ChallengeView({ id }: { id: string }) {
  const app = useRequirePair();
  const params = useSearchParams();
  const [ch, setCh] = useState<Challenge | null>(null);
  const [attempt, setAttempt] = useState<Attempt | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const sb = supabase();
    const [{ data: c }, { data: a }] = await Promise.all([
      sb.from("challenges").select("*").eq("id", id).maybeSingle<Challenge>(),
      sb.from("attempts").select("*").eq("challenge_id", id).order("created_at", { ascending: false }).limit(1).maybeSingle<Attempt>(),
    ]);
    setCh(c);
    setAttempt(a);
  }, [id]);

  useEffect(() => { if (app.ready) load(); }, [app.ready, load]);

  if (!app.ready || !ch) return <Screen back="/home"><Spinner /></Screen>;
  const iAmLearner = ch.recipient_id === app.me!.id;
  const teacher = iAmLearner ? app.partner! : app.me!;
  const answerDir = langDir(teacher.native_lang);

  async function submit(answer: Record<string, unknown>, score: number | null, audio: string | null) {
    const { error } = await supabase().rpc("submit_attempt", {
      p_challenge: id, p_answer: answer, p_score: score, p_audio: audio,
    });
    if (error) return setError(error.message);
    pingNotify();
    await load();
  }

  async function rate(rating: string) {
    if (!attempt) return;
    const { error } = await supabase().rpc("rate_attempt", { p_attempt: attempt.id, p_rating: rating });
    if (error) return setError(error.message);
    pingNotify();
    await load();
  }

  return (
    <Screen back="/home">
      {params.get("sent") && (
        <Card className="mb-4 bg-mint-soft text-center font-bold">Challenge sent to {app.partner!.display_name}! 🎯</Card>
      )}
      <p className="text-sm text-ink-soft">
        {iAmLearner ? `Challenge from ${teacher.display_name}` : `Your challenge for ${app.partner!.display_name}`} · {timeAgo(ch.created_at)}
      </p>
      <T as="h2" className="mb-4 text-2xl font-bold">{ch.prompt}</T>

      {iAmLearner && !ch.completed_at ? (
        ch.kind === "quiz" ? <QuizPlay ch={ch} onDone={submit} />
          : ch.kind === "type" ? <TypePlay ch={ch} dir={answerDir} onDone={submit} />
          : <RecordPlay ch={ch} pairId={app.pair!.id} onDone={submit} />
      ) : (
        <Result ch={ch} attempt={attempt} iAmLearner={iAmLearner} learnerName={app.partner!.display_name} dir={answerDir} />
      )}

      {!iAmLearner && attempt && !attempt.rated_at && ch.kind !== "quiz" && (
        <Card className="mt-4">
          <p className="mb-3 font-semibold">How did they do?</p>
          <div className="grid grid-cols-3 gap-2">
            {RATINGS.map((r) => (
              <Button key={r.k} variant="soft" className="px-2" onClick={() => rate(r.k)}>
                {r.icon}<br /><span className="text-sm">{r.label}</span>
              </Button>
            ))}
          </div>
        </Card>
      )}
      <ErrorText error={error} />
    </Screen>
  );
}

type Done = (answer: Record<string, unknown>, score: number | null, audio: string | null) => Promise<void>;

function QuizPlay({ ch, onDone }: { ch: Challenge; onDone: Done }) {
  const questions = ((ch.data as { questions?: QuizQuestion[] }).questions ?? []);
  const [i, setI] = useState(0);
  const [picks, setPicks] = useState<number[]>([]);
  const [chosen, setChosen] = useState<number | null>(null);
  const q = questions[i];
  if (!q) return <Card>This quiz has no questions.</Card>;

  function pick(n: number) {
    if (chosen !== null) return;
    setChosen(n);
  }
  async function next() {
    const all = [...picks, chosen!];
    setPicks(all);
    setChosen(null);
    if (i + 1 < questions.length) setI(i + 1);
    else await onDone({ picks: all }, scoreQuiz(questions, all), null);
  }

  return (
    <Card>
      <p className="mb-1 text-xs text-ink-soft">Question {i + 1} of {questions.length}</p>
      <T as="p" className="mb-4 text-2xl font-bold">{q.q}</T>
      <div className="space-y-2">
        {q.options.map((o, n) => {
          const state = chosen === null ? "" : n === q.answer ? "bg-mint text-white" : n === chosen ? "bg-red-400 text-white" : "opacity-50";
          return (
            <button key={n} type="button" dir="auto" onClick={() => pick(n)}
              className={`w-full rounded-xl bg-paper px-4 py-3 text-start text-lg ${state}`}>{o}</button>
          );
        })}
      </div>
      {chosen !== null && (
        <Button className="mt-4 w-full" onClick={next}>{i + 1 < questions.length ? "Next" : "Finish"}</Button>
      )}
    </Card>
  );
}

function TypePlay({ ch, dir, onDone }: { ch: Challenge; dir: "rtl" | "ltr"; onDone: Done }) {
  const data = ch.data as { mode?: string; sentence?: string; answer?: string };
  const [text, setText] = useState("");
  const [checked, setChecked] = useState<boolean | null>(null);
  const expected = data.answer ?? "";

  return (
    <Card className="space-y-3">
      {data.mode === "gap" && <p dir={dir} className="text-xl">{data.sentence}</p>}
      <input className="field text-lg" dir={dir} value={text} disabled={checked !== null}
        onChange={(e) => setText(e.target.value)} placeholder="Your answer" />
      {checked === null ? (
        <Button className="w-full" disabled={!text.trim()} onClick={() => setChecked(answersMatch(text, expected))}>Check</Button>
      ) : (
        <>
          <p className={`rounded-xl p-3 font-semibold ${checked ? "bg-mint-soft" : "bg-red-50"}`}>
            {checked ? "Correct! 🎉" : <>Not quite. Answer: <span dir={dir}>{expected}</span></>}
          </p>
          <Button className="w-full" onClick={() => onDone({ text }, checked ? 1 : 0, null)}>Send my answer</Button>
        </>
      )}
    </Card>
  );
}

function RecordPlay({ ch, pairId, onDone }: { ch: Challenge; pairId: string; onDone: Done }) {
  const model = (ch.data as { audio_path?: string | null }).audio_path;
  const [clip, setClip] = useState<Blob | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <Card className="space-y-4">
      {model && (
        <div className="flex items-center gap-3"><PlayButton path={model} /><span className="text-sm text-ink-soft">Listen first</span></div>
      )}
      <AudioRecorder value={clip} onChange={setClip} label="Record yourself" />
      <Button className="w-full" disabled={!clip || busy} onClick={async () => {
        setBusy(true);
        const path = await uploadAudio(pairId, clip!);
        await onDone({}, null, path);
        setBusy(false);
      }}>{busy ? "Sending…" : "Send recording"}</Button>
    </Card>
  );
}

function Result({ ch, attempt, iAmLearner, learnerName, dir }: {
  ch: Challenge; attempt: Attempt | null; iAmLearner: boolean; learnerName: string; dir: "rtl" | "ltr";
}) {
  if (!attempt) return <Card className="text-ink-soft">Waiting for {learnerName} to answer.</Card>;
  const text = (attempt.answer as { text?: string }).text;
  const rating = RATINGS.find((r) => r.k === attempt.rating);
  return (
    <Card className="space-y-3">
      {attempt.score !== null && ch.kind !== "record" && (
        <p className="text-3xl font-bold">{Math.round(Number(attempt.score) * 100)}%</p>
      )}
      {text && <p dir={dir} className="text-lg">&ldquo;{text}&rdquo;</p>}
      {attempt.audio_path && (
        <div className="flex items-center gap-3"><PlayButton path={attempt.audio_path} />
          <span className="text-sm text-ink-soft">{iAmLearner ? "Your recording" : `${learnerName}'s recording`}</span></div>
      )}
      {rating ? (
        <p className="font-semibold">{rating.icon} Rated: {rating.label}</p>
      ) : ch.kind === "record" ? (
        <p className="text-sm text-ink-soft">{iAmLearner ? "Waiting for feedback." : ""}</p>
      ) : null}
      {iAmLearner && <Link href="/home" className="block text-center font-semibold text-brand">Back home</Link>}
    </Card>
  );
}

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <Suspense><ChallengeView id={id} /></Suspense>;
}
