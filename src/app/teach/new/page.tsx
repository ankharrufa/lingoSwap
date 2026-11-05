"use client";
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AudioRecorder } from "@/components/Audio";
import { Button, Card, ErrorText, Screen, Spinner, useRequirePair } from "@/components/ui";
import { supabase } from "@/lib/supabase/client";
import { pingNotify } from "@/lib/notify";
import { uploadAudio } from "@/lib/audio";
import { langDir, langName } from "@/lib/config";
import { randomPrompt } from "@/lib/prompts";
import type { RequestRow } from "@/lib/types";

type Draft = { term: string; translation: string; note: string; audio: Blob | null };
const empty = (): Draft => ({ term: "", translation: "", note: "", audio: null });
const MAX_ITEMS = 10;

function TeachForm() {
  const app = useRequirePair();
  const router = useRouter();
  const params = useSearchParams();
  const [template, setTemplate] = useState<"word_set" | "phrase">(
    params.get("template") === "phrase" ? "phrase" : "word_set");
  const [title, setTitle] = useState("");
  const [prompt, setPrompt] = useState<string | null>(null);
  const [request, setRequest] = useState<RequestRow | null>(null);
  const [items, setItems] = useState<Draft[]>([empty(), empty(), empty()]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Started from a partner's request?
  useEffect(() => {
    const id = params.get("request");
    if (!id || !app.ready) return;
    supabase().from("requests").select("*").eq("id", id).maybeSingle<RequestRow>().then(({ data }) => {
      if (data) { setRequest(data); setTitle(data.text); }
    });
  }, [params, app.ready]);

  useEffect(() => {
    if (template === "phrase") setItems((it) => it.slice(0, 1));
    else setItems((it) => (it.length < 3 ? [...it, ...Array.from({ length: 3 - it.length }, empty)] : it));
  }, [template]);

  if (!app.ready) return <Screen><Spinner /></Screen>;
  const myLang = app.me!.native_lang;
  const theirLang = app.partner!.native_lang;
  const partner = app.partner!.display_name || "your partner";

  function newPrompt() {
    const p = randomPrompt(myLang, prompt ?? undefined);
    setPrompt(p.text);
    setTitle(p.text);
    setTemplate(p.template);
  }

  const update = (i: number, patch: Partial<Draft>) =>
    setItems((it) => it.map((d, j) => (j === i ? { ...d, ...patch } : d)));

  const filled = items.filter((d) => d.term.trim());

  async function send() {
    if (filled.length === 0) return setError("Add at least one word or phrase.");
    setBusy(true);
    setError(null);
    try {
      const sb = supabase();
      const { data: lesson, error: e1 } = await sb.from("lessons").insert({
        pair_id: app.pair!.id, author_id: app.me!.id, recipient_id: app.partner!.id,
        template, title: title.trim() || filled.map((d) => d.term.trim()).slice(0, 3).join(", "),
        prompt: request ? `Request: ${request.text}` : prompt,
      }).select("id").single();
      if (e1) throw e1;

      const rows = [];
      for (const [i, d] of filled.entries()) {
        const audio_path = d.audio ? await uploadAudio(app.pair!.id, d.audio) : null;
        rows.push({
          lesson_id: lesson.id, pair_id: app.pair!.id, author_id: app.me!.id, position: i,
          term: d.term.trim(), translation: d.translation.trim(), note: d.note.trim() || null, audio_path,
        });
      }
      const { error: e2 } = await sb.from("items").insert(rows);
      if (e2) throw e2;
      if (request) await sb.from("requests").update({ done_at: new Date().toISOString() }).eq("id", request.id);
      pingNotify();
      router.replace(`/lesson/${lesson.id}?sent=1`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong. Try again.");
      setBusy(false);
    }
  }

  return (
    <Screen title={template === "phrase" ? "Phrase of the day" : "Word set"} back="/create">
      <Card className="mb-4 space-y-3">
        {request ? (
          <p className="text-sm">🙋 {partner} asked: <b dir="auto">&ldquo;{request.text}&rdquo;</b></p>
        ) : (
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm text-ink-soft">{prompt ? "Idea:" : "Need an idea?"}</p>
            <Button type="button" variant="soft" className="px-3 py-2 text-sm" onClick={newPrompt}>
              🎲 {prompt ? "Another" : "Give me one"}
            </Button>
          </div>
        )}
        <input className="field font-semibold" dir="auto" placeholder="Title, e.g. Bones of the hand"
          value={title} onChange={(e) => setTitle(e.target.value)} />
      </Card>

      <div className="space-y-3">
        {items.map((d, i) => (
          <Card key={i} className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-ink-soft">
                {template === "phrase" ? "Phrase" : `Word ${i + 1}`}
              </span>
              {items.length > 1 && (
                <button type="button" className="text-xs text-ink-soft" aria-label="Remove"
                  onClick={() => setItems((it) => it.filter((_, j) => j !== i))}>✕</button>
              )}
            </div>
            <input className="field text-lg" dir={langDir(myLang)} lang={myLang}
              placeholder={`In ${langName(myLang)}`} value={d.term} onChange={(e) => update(i, { term: e.target.value })} />
            <input className="field" dir={langDir(theirLang)} lang={theirLang}
              placeholder={`Meaning in ${langName(theirLang)}`} value={d.translation}
              onChange={(e) => update(i, { translation: e.target.value })} />
            <input className="field text-sm" dir="auto"
              placeholder={template === "phrase" ? "When do you use it?" : "Note (optional): how I really say it…"}
              value={d.note} onChange={(e) => update(i, { note: e.target.value })} />
            <AudioRecorder value={d.audio} onChange={(audio) => update(i, { audio })} label="Add your voice (+2)" />
          </Card>
        ))}
      </div>

      {template === "word_set" && items.length < MAX_ITEMS && (
        <Button type="button" variant="ghost" className="mt-2 w-full" onClick={() => setItems((it) => [...it, empty()])}>
          ＋ Add a word
        </Button>
      )}

      <div className="sticky bottom-4 mt-6">
        <Button className="w-full shadow-lg" disabled={busy || filled.length === 0} onClick={send}>
          {busy ? "Sending…" : `Send to ${partner} (${filled.length})`}
        </Button>
        <ErrorText error={error} />
      </div>
    </Screen>
  );
}

export default function TeachNew() {
  return <Suspense><TeachForm /></Suspense>;
}
