"use client";
import { supabase } from "./supabase/client";

// Browsers record in different formats: Chrome/Android use webm, iPhone Safari uses mp4.
export function pickAudioMime(): { mime: string; ext: string } {
  const options = [
    { mime: "audio/webm;codecs=opus", ext: "webm" },
    { mime: "audio/webm", ext: "webm" },
    { mime: "audio/mp4", ext: "m4a" },
    { mime: "audio/ogg;codecs=opus", ext: "ogg" },
  ];
  if (typeof MediaRecorder !== "undefined") {
    for (const o of options) if (MediaRecorder.isTypeSupported(o.mime)) return o;
  }
  return { mime: "", ext: "webm" };
}

export async function uploadAudio(pairId: string, blob: Blob): Promise<string> {
  const ext = blob.type.includes("mp4") ? "m4a" : blob.type.includes("ogg") ? "ogg" : "webm";
  const path = `${pairId}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase()
    .storage.from("audio")
    .upload(path, blob, { contentType: blob.type || "audio/webm", upsert: false });
  if (error) throw error;
  return path;
}

const urlCache = new Map<string, { url: string; expires: number }>();

export async function audioUrl(path: string): Promise<string> {
  const hit = urlCache.get(path);
  if (hit && hit.expires > Date.now()) return hit.url;
  const { data, error } = await supabase().storage.from("audio").createSignedUrl(path, 3600);
  if (error || !data) throw error ?? new Error("no url");
  urlCache.set(path, { url: data.signedUrl, expires: Date.now() + 50 * 60 * 1000 });
  return data.signedUrl;
}
