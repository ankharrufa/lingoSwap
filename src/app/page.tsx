import Link from "next/link";
import { redirect } from "next/navigation";
import { serverSupabase } from "@/lib/supabase/server";
import { APP_NAME, APP_TAGLINE } from "@/lib/config";

export const dynamic = "force-dynamic";

export default async function Landing() {
  if (process.env.NEXT_PUBLIC_SUPABASE_URL) {
    const sb = await serverSupabase();
    const { data } = await sb.auth.getUser();
    if (data.user) redirect("/home");
  }
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-8 px-6">
      <div>
        <div className="mb-6 text-6xl">🔁</div>
        <h1 className="text-4xl font-extrabold">{APP_NAME}</h1>
        <p className="mt-3 text-lg text-ink-soft">{APP_TAGLINE}</p>
      </div>
      <ul className="space-y-3 text-base">
        <li>🎁 Send your partner small lessons in your language.</li>
        <li>🎯 Set them fun challenges: quizzes, gaps, recordings.</li>
        <li>🃏 What you learn becomes flashcards, in their voice.</li>
      </ul>
      <Link href="/login" className="rounded-xl bg-brand px-4 py-4 text-center text-lg font-semibold text-white">
        Get started
      </Link>
    </main>
  );
}
