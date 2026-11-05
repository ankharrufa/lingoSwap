import { createClient } from "@supabase/supabase-js";
import nodemailer from "nodemailer";
import { NextResponse, type NextRequest } from "next/server";
import { serverSupabase } from "@/lib/supabase/server";
import { buildEmails, type Pending } from "@/lib/notifyEmail";

// Sends the waiting emails from the database outbox.
//   POST: the app calls this after a user sends something. The caller must be signed in.
//   GET:  Vercel Cron calls this once a day, to catch anything a POST missed.
// The request carries no data. It only says "check the outbox now". So a caller cannot
// choose who gets an email or what it says.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const sb = await serverSupabase();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "not signed in" }, { status: 401 });
  return run(req);
}

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  return run(req);
}

async function run(req: NextRequest) {
  const env = process.env;
  const missing = ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "SMTP_HOST", "SMTP_USER", "SMTP_PASS"]
    .filter((k) => !env[k]);
  if (missing.length) {
    // Not set up yet. Leave the outbox as it is, so nothing is lost.
    console.warn(`[notify] email is off. Missing: ${missing.join(", ")}`);
    return NextResponse.json({ sent: 0, off: missing });
  }

  const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await admin.rpc("claim_notifications", { p_limit: 100 });
  if (error) {
    console.error("[notify] claim failed:", error.message);
    return NextResponse.json({ error: "claim failed" }, { status: 500 });
  }
  const rows = (data ?? []) as Pending[];
  if (rows.length === 0) return NextResponse.json({ sent: 0 });

  const port = Number(env.SMTP_PORT || 465);
  const mailer = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port,
    secure: port === 465,
    auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
  });
  const from = env.EMAIL_FROM || env.SMTP_USER!;
  const base = env.APP_URL || req.nextUrl.origin;

  let sent = 0;
  for (const mail of buildEmails(rows, base)) {
    try {
      await mailer.sendMail({ from, to: mail.to, subject: mail.subject, text: mail.text, html: mail.html });
      await admin.rpc("finish_notifications", { p_ids: mail.ids, p_result: "sent" });
      sent++;
    } catch (e) {
      // Not marked as sent: the next run tries again after 10 minutes.
      console.error("[notify] send failed:", e instanceof Error ? e.message : e);
    }
  }
  return NextResponse.json({ sent });
}
