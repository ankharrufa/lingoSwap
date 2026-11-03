"use client";
import { useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { LANGUAGES } from "@/lib/config";
import type { Profile } from "@/lib/types";
import { Button, ErrorText } from "./ui";

export function ProfileForm({ me, onSaved, cta = "Save" }: { me: Profile; onSaved: () => void; cta?: string }) {
  const [name, setName] = useState(me.display_name);
  const [teach, setTeach] = useState(me.native_lang);
  const [learn, setLearn] = useState(me.learning_lang);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (teach === learn) return setError("Pick two different languages.");
    setBusy(true);
    const { error } = await supabase()
      .from("profiles")
      .update({ display_name: name.trim(), native_lang: teach, learning_lang: learn })
      .eq("id", me.id);
    setBusy(false);
    if (error) setError(error.message);
    else onSaved();
  }

  const options = Object.entries(LANGUAGES).map(([code, label]) => (
    <option key={code} value={code}>{label}</option>
  ));

  return (
    <form onSubmit={save} className="space-y-4">
      <label className="block">
        <span className="mb-1 block text-sm font-semibold">Your name</span>
        <input className="field" required value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Baba" />
      </label>
      <label className="block">
        <span className="mb-1 block text-sm font-semibold">I can teach</span>
        <select className="field" value={teach} onChange={(e) => setTeach(e.target.value)}>{options}</select>
      </label>
      <label className="block">
        <span className="mb-1 block text-sm font-semibold">I want to learn</span>
        <select className="field" value={learn} onChange={(e) => setLearn(e.target.value)}>{options}</select>
      </label>
      <p className="text-xs text-ink-soft">
        &quot;I can teach&quot; doesn&apos;t have to be your mother tongue. It can be a topic you know well, like medical English.
      </p>
      <Button className="w-full" disabled={busy}>{busy ? "Saving…" : cta}</Button>
      <ErrorText error={error} />
    </form>
  );
}
