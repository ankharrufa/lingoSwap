"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { BottomNav, Button, Card, Screen, Spinner, T, timeAgo, useRequirePair } from "@/components/ui";
import { supabase } from "@/lib/supabase/client";
import { pairStreak } from "@/lib/streak";
import { APP_NAME } from "@/lib/config";
import type { Challenge, Lesson, RequestRow } from "@/lib/types";

type ToRate = { id: string; challenge_id: string; challenges: { prompt: string; kind: string } };

const KIND_LABEL: Record<string, string> = { quiz: "Quiz", type: "Typing challenge", record: "Say it back" };

export default function Home() {
  const app = useRequirePair();
  const [data, setData] = useState<{
    lessons: Lesson[]; challenges: Challenge[]; waiting: number; toRate: ToRate[];
    requests: RequestRow[]; due: number; myPts: number; partnerPts: number; streak: number;
    partnerMastered: number;
  } | null>(null);

  const load = useCallback(async () => {
    if (!app.ready) return;
    const sb = supabase();
    const me = app.me!.id;
    const nowIso = new Date().toISOString();
    const [lessons, challenges, myOpenL, myOpenC, toRate, requests, due, points, mastered] = await Promise.all([
      sb.from("lessons").select("*").eq("recipient_id", me).is("completed_at", null).order("created_at", { ascending: false }),
      sb.from("challenges").select("*").eq("recipient_id", me).is("completed_at", null).order("created_at", { ascending: false }),
      sb.from("lessons").select("id", { count: "exact", head: true }).eq("author_id", me).is("completed_at", null),
      sb.from("challenges").select("id", { count: "exact", head: true }).eq("author_id", me).is("completed_at", null),
      sb.from("attempts").select("id, challenge_id, challenges!inner(prompt, kind, author_id)")
        .eq("challenges.author_id", me).is("rated_at", null).neq("user_id", me),
      sb.from("requests").select("*").neq("from_id", me).is("done_at", null).order("created_at"),
      sb.from("flashcards").select("id", { count: "exact", head: true }).eq("owner_id", me).lte("due_at", nowIso),
      // Fine for small pairs. Move totals into a database view when the ledger grows.
      sb.from("points").select("user_id, amount, created_at").order("created_at", { ascending: false }).limit(5000),
      sb.from("flashcards").select("id, items!inner(author_id)", { count: "exact", head: true })
        .eq("items.author_id", me).not("mastered_at", "is", null),
    ]);
    const pts = points.data ?? [];
    const sum = (id: string) => pts.filter((p) => p.user_id === id).reduce((a, p) => a + p.amount, 0);
    setData({
      lessons: (lessons.data ?? []) as Lesson[],
      challenges: (challenges.data ?? []) as Challenge[],
      waiting: (myOpenL.count ?? 0) + (myOpenC.count ?? 0),
      toRate: (toRate.data ?? []) as unknown as ToRate[],
      requests: (requests.data ?? []) as RequestRow[],
      due: due.count ?? 0,
      myPts: sum(me),
      partnerPts: sum(app.partner!.id),
      streak: pairStreak(pts, me, app.partner!.id),
      partnerMastered: mastered.count ?? 0,
    });
  }, [app.ready, app.me, app.partner]);

  useEffect(() => { load(); }, [load]);

  if (!app.ready || !data) return <Screen><Spinner /></Screen>;
  const partner = app.partner!.display_name || "your partner";
  const inbox = data.lessons.length + data.challenges.length;

  return (
    <Screen>
      <header className="mb-5 flex items-center justify-between">
        <div>
          <p className="text-sm text-ink-soft">{APP_NAME}</p>
          <h1 className="text-2xl font-bold">Hi {app.me!.display_name} 👋</h1>
        </div>
        <Link href="/me" className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-lg shadow-sm">
          {(app.me!.display_name[0] ?? "?").toUpperCase()}
        </Link>
      </header>

      <div className="mb-5 grid grid-cols-3 gap-2 text-center">
        <Stat label="Your points" value={data.myPts} />
        <Stat label={`${partner}`} value={data.partnerPts} />
        <Stat label="Week streak" value={`🔥 ${data.streak}`} />
      </div>

      <h2 className="mb-2 text-lg font-bold">For you {inbox > 0 && <span className="text-brand">· {inbox}</span>}</h2>
      {inbox === 0 ? (
        <Card className="mb-5 text-ink-soft">Nothing new from {partner} yet. Why not send them something?</Card>
      ) : (
        <div className="mb-5 space-y-2">
          {data.lessons.map((l) => (
            <Link key={l.id} href={`/lesson/${l.id}`}>
              <Card className="mb-2 flex items-center gap-3">
                <span className="text-2xl">🎁</span>
                <div className="min-w-0 flex-1">
                  <T as="p" className="truncate font-semibold">{l.title || "New lesson"}</T>
                  <p className="text-xs text-ink-soft">Lesson from {partner} · {timeAgo(l.created_at)}</p>
                </div>
                {!l.opened_at && <span className="h-2.5 w-2.5 rounded-full bg-brand" />}
              </Card>
            </Link>
          ))}
          {data.challenges.map((c) => (
            <Link key={c.id} href={`/challenge/${c.id}`}>
              <Card className="mb-2 flex items-center gap-3">
                <span className="text-2xl">🎯</span>
                <div className="min-w-0 flex-1">
                  <T as="p" className="truncate font-semibold">{c.prompt || KIND_LABEL[c.kind]}</T>
                  <p className="text-xs text-ink-soft">{KIND_LABEL[c.kind]} from {partner} · {timeAgo(c.created_at)}</p>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}

      {data.due > 0 && (
        <Link href="/cards">
          <Card className="mb-5 flex items-center gap-3 bg-mint-soft">
            <span className="text-2xl">🃏</span>
            <p className="flex-1 font-semibold">{data.due} flashcard{data.due === 1 ? "" : "s"} to review</p>
            <span className="text-mint">→</span>
          </Card>
        </Link>
      )}

      {data.toRate.length > 0 && (
        <>
          <h2 className="mb-2 text-lg font-bold">Waiting for your feedback</h2>
          <div className="mb-5">
            {data.toRate.map((a) => (
              <Link key={a.id} href={`/challenge/${a.challenge_id}`}>
                <Card className="mb-2 flex items-center gap-3">
                  <span className="text-2xl">👂</span>
                  <T as="p" className="flex-1 truncate">{a.challenges.prompt || KIND_LABEL[a.challenges.kind]}</T>
                  <span className="text-sm font-semibold text-brand">Rate</span>
                </Card>
              </Link>
            ))}
          </div>
        </>
      )}

      {data.requests.length > 0 && (
        <>
          <h2 className="mb-2 text-lg font-bold">{partner} asked you</h2>
          <div className="mb-5">
            {data.requests.map((r) => (
              <Link key={r.id} href={`/teach/new?request=${r.id}`}>
                <Card className="mb-2 flex items-center gap-3">
                  <span className="text-2xl">🙋</span>
                  <T as="p" className="flex-1">&ldquo;{r.text}&rdquo;</T>
                  <span className="text-sm font-semibold text-brand">Teach</span>
                </Card>
              </Link>
            ))}
          </div>
        </>
      )}

      <div className="grid grid-cols-2 gap-2">
        <Link href="/teach/new"><Button className="w-full">🎁 Teach</Button></Link>
        <Link href="/challenge/new"><Button variant="soft" className="w-full">🎯 Challenge</Button></Link>
      </div>
      <p className="mt-4 text-center text-xs text-ink-soft">
        {data.waiting > 0 ? `${data.waiting} thing${data.waiting === 1 ? "" : "s"} waiting for ${partner}` : `${partner} is all caught up`}
        {data.partnerMastered > 0 && ` · ${partner} mastered ${data.partnerMastered} of your cards`}
      </p>
      <BottomNav />
    </Screen>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-2xl bg-white px-2 py-3 shadow-sm ring-1 ring-black/5">
      <div className="text-xl font-bold">{value}</div>
      <div className="truncate text-xs text-ink-soft">{label}</div>
    </div>
  );
}
