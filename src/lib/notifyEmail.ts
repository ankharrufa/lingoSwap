import { APP_NAME } from "./config";

// One waiting notification, as returned by the database function claim_notifications().
export type Pending = {
  notification_id: number;
  recipient_id: string;
  email: string;
  recipient_name: string;
  actor_name: string;
  kind: "lesson" | "challenge" | "answer" | "rating" | "request";
  ref_id: string;
  link_id: string;
  detail: string | null;
};

export type Email = { to: string; subject: string; text: string; html: string; ids: number[] };

const RATING: Record<string, string> = { perfect: "Perfect ⭐", close: "Close 👍", try_again: "Try again 🔁" };

function line(n: Pending, base: string): { label: string; detail: string; url: string } {
  const d = (n.detail ?? "").trim();
  switch (n.kind) {
    case "lesson":
      return { label: "📚 New lesson", detail: d, url: `${base}/lesson/${n.link_id}` };
    case "challenge":
      return { label: "🎯 New challenge", detail: d, url: `${base}/challenge/${n.link_id}` };
    case "answer":
      return { label: "✍️ Answered your challenge", detail: d, url: `${base}/challenge/${n.link_id}` };
    case "rating":
      return { label: "⭐ Rated your answer", detail: RATING[d] ?? d, url: `${base}/challenge/${n.link_id}` };
    case "request":
      return { label: "🙋 Asked you to teach", detail: d, url: `${base}/teach/new?request=${n.link_id}` };
  }
}

function subjectFor(list: Pending[]): string {
  const who = list[0].actor_name || "Your partner";
  if (list.length > 1) return `${who} sent you ${list.length} new things`;
  const n = list[0];
  const d = (n.detail ?? "").trim();
  const short = d.length > 40 ? `${d.slice(0, 39)}…` : d;
  switch (n.kind) {
    case "lesson": return `${who} sent you a lesson${short ? `: ${short}` : ""}`;
    case "challenge": return `${who} sent you a challenge${short ? `: ${short}` : ""}`;
    case "answer": return `${who} answered your challenge`;
    case "rating": return `${who} rated your answer: ${RATING[d] ?? d}`;
    case "request": return `${who} asked you to teach${short ? `: ${short}` : " something"}`;
  }
}

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// Group waiting notifications into one email per person.
export function buildEmails(rows: Pending[], baseUrl: string): Email[] {
  const base = baseUrl.replace(/\/+$/, "");
  const byPerson = new Map<string, Pending[]>();
  for (const r of rows) {
    if (!r.email) continue;
    byPerson.set(r.recipient_id, [...(byPerson.get(r.recipient_id) ?? []), r]);
  }

  return [...byPerson.values()].map((list) => {
    const lines = list.map((n) => line(n, base));
    const hi = list[0].recipient_name ? `Hi ${list[0].recipient_name},` : "Hi,";
    const footer = `You get this email because you play ${APP_NAME}. Turn emails off on the "You" page: ${base}/me`;

    const text = [
      hi,
      ...lines.map((l) => `${l.label}${l.detail ? `: ${l.detail}` : ""}\n${l.url}`),
      footer,
    ].join("\n\n");

    const html = `<div style="font-family:system-ui,sans-serif;font-size:16px;line-height:1.5;color:#1f2937;max-width:480px">
<p>${esc(hi)}</p>
${lines
  .map((l) => `<p style="margin:16px 0"><b>${esc(l.label)}</b>${l.detail ? `<br><span dir="auto">${esc(l.detail)}</span>` : ""}<br>
<a href="${esc(l.url)}" style="display:inline-block;margin-top:6px;padding:8px 16px;border-radius:999px;background:#111827;color:#fff;text-decoration:none">Open</a></p>`)
  .join("\n")}
<p style="margin-top:24px;font-size:13px;color:#6b7280">You get this email because you play ${esc(APP_NAME)}.
<a href="${esc(base)}/me" style="color:#6b7280">Turn emails off</a>.</p>
</div>`;

    return { to: list[0].email, subject: subjectFor(list), text, html, ids: list.map((n) => n.notification_id) };
  });
}
