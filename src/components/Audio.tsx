"use client";
import { useEffect, useRef, useState } from "react";
import { audioUrl, pickAudioMime } from "@/lib/audio";

const MAX_SECONDS = 30;

// Record a short clip in the browser. Gives back a Blob (or null when cleared).
export function AudioRecorder({ value, onChange, label = "Record" }: {
  value: Blob | null; onChange: (b: Blob | null) => void; label?: string;
}) {
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const rec = useRef<MediaRecorder | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!value) { setPreview(null); return; }
    const u = URL.createObjectURL(value);
    setPreview(u);
    return () => URL.revokeObjectURL(u);
  }, [value]);

  useEffect(() => () => { if (timer.current) clearInterval(timer.current); }, []);

  async function start() {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const { mime } = pickAudioMime();
      const r = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      const chunks: BlobPart[] = [];
      r.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      r.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        onChange(new Blob(chunks, { type: r.mimeType || mime || "audio/webm" }));
      };
      rec.current = r;
      r.start();
      setRecording(true);
      setSeconds(0);
      timer.current = setInterval(() => {
        setSeconds((s) => {
          if (s + 1 >= MAX_SECONDS) stop();
          return s + 1;
        });
      }, 1000);
    } catch {
      setError("Microphone not available. Allow microphone access and try again.");
    }
  }

  function stop() {
    if (timer.current) clearInterval(timer.current);
    if (rec.current && rec.current.state !== "inactive") rec.current.stop();
    setRecording(false);
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {recording ? (
        <button type="button" onClick={stop}
          className="flex items-center gap-2 rounded-full bg-red-500 px-4 py-2 text-sm font-semibold text-white">
          <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-white" /> Stop · {seconds}s
        </button>
      ) : value ? (
        <>
          {preview && <audio src={preview} controls className="h-9 max-w-[220px]" />}
          <button type="button" onClick={() => onChange(null)} className="text-sm text-ink-soft underline">
            Remove
          </button>
        </>
      ) : (
        <button type="button" onClick={start}
          className="flex items-center gap-2 rounded-full bg-brand-soft px-4 py-2 text-sm font-semibold text-brand-dark">
          🎙 {label}
        </button>
      )}
      {error && <p className="w-full text-xs text-red-600">{error}</p>}
    </div>
  );
}

// Play a clip stored in the private bucket. Fetches a short-lived link on first tap.
export function PlayButton({ path, size = "md" }: { path: string; size?: "sm" | "md" }) {
  const [state, setState] = useState<"idle" | "loading" | "playing" | "error">("idle");
  const audio = useRef<HTMLAudioElement | null>(null);

  async function play() {
    try {
      setState("loading");
      if (!audio.current) {
        audio.current = new Audio(await audioUrl(path));
        audio.current.onended = () => setState("idle");
      }
      audio.current.currentTime = 0;
      await audio.current.play();
      setState("playing");
    } catch {
      setState("error");
    }
  }

  const dim = size === "sm" ? "h-8 w-8 text-sm" : "h-11 w-11 text-lg";
  return (
    <button type="button" onClick={play} aria-label="Play recording"
      className={`inline-flex shrink-0 items-center justify-center rounded-full bg-brand text-white ${dim}`}>
      {state === "loading" ? "…" : state === "error" ? "!" : state === "playing" ? "♪" : "▶"}
    </button>
  );
}
