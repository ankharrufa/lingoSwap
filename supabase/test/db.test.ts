// Runs the real migration in an in-memory Postgres (PGlite) and plays two partners.
import { PGlite } from "@electric-sql/pglite";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

const DAD = "00000000-0000-0000-0000-00000000000a";
const DAUGHTER = "00000000-0000-0000-0000-00000000000b";
const STRANGER = "00000000-0000-0000-0000-00000000000c";

let db: PGlite;

async function as<T = Record<string, unknown>>(user: string | null, sql: string, params: unknown[] = []) {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${user ?? ""}', false);`);
  if (user) await db.exec("set role authenticated;");
  try {
    return (await db.query<T>(sql, params)).rows;
  } finally {
    await db.exec("reset role;");
  }
}

beforeAll(async () => {
  db = new PGlite();
  const dir = join(__dirname, "..");
  await db.exec(readFileSync(join(dir, "test/stubs.sql"), "utf8"));
  for (const f of readdirSync(join(dir, "migrations")).sort()) {
    await db.exec(readFileSync(join(dir, "migrations", f), "utf8"));
  }
  // Supabase grants table access to "authenticated"; RLS then filters rows.
  await db.exec(`
    grant select, insert, update, delete on all tables in schema public to authenticated;
    grant usage on all sequences in schema public to authenticated;
  `);
  await db.exec(`insert into auth.users values
    ('${DAD}', 'dad@example.com'), ('${DAUGHTER}', 'daughter@example.com'), ('${STRANGER}', 'x@example.com');`);
}, 60_000);

describe("database rules", () => {
  let pairId = "";
  let lessonId = "";
  let itemIds: string[] = [];

  it("creates profiles on sign-up", async () => {
    const rows = await db.query("select count(*)::int as n from public.profiles");
    expect(rows.rows[0]).toEqual({ n: 3 });
  });

  it("pairs two people with an invite code", async () => {
    const [pair] = await as<{ id: string; invite_code: string }>(DAD, "select * from public.create_pair()");
    pairId = pair.id;
    await expect(as(DAD, "select public.join_pair($1)", [pair.invite_code])).rejects.toThrow();
    await as(DAUGHTER, "select public.join_pair($1)", [pair.invite_code]);
    await expect(as(STRANGER, "select public.join_pair($1)", [pair.invite_code])).rejects.toThrow(/already used/);
    const seen = await as(DAUGHTER, "select display_name from public.profiles order by display_name");
    expect(seen.map((r) => r.display_name)).toEqual(["dad", "daughter"]);
  });

  it("lets a stranger see nothing", async () => {
    expect(await as(STRANGER, "select * from public.pairs")).toHaveLength(0);
    expect(await as(STRANGER, "select * from public.profiles")).toHaveLength(1);
  });

  it("sends a lesson only to the partner", async () => {
    await expect(
      as(DAUGHTER, `insert into public.lessons (pair_id, author_id, recipient_id, template)
                    values ($1, $2, $3, 'word_set')`, [pairId, DAUGHTER, STRANGER]),
    ).rejects.toThrow();
    const [lesson] = await as<{ id: string }>(
      DAUGHTER,
      `insert into public.lessons (pair_id, author_id, recipient_id, template, title)
       values ($1, $2, $3, 'word_set', 'Bones of the hand') returning id`,
      [pairId, DAUGHTER, DAD],
    );
    lessonId = lesson.id;
    const items = await as<{ id: string }>(
      DAUGHTER,
      `insert into public.items (lesson_id, pair_id, author_id, position, term, translation, audio_path)
       values ($1,$2,$3,0,'Scaphoid','عظم زورقي',$4), ($1,$2,$3,1,'Lunate','عظم هلالي',null),
              ($1,$2,$3,2,'Metacarpal','مشط اليد',null), ($1,$2,$3,3,'Phalanx','سلامية',null)
       returning id`,
      [lessonId, pairId, DAUGHTER, `${pairId}/clip.webm`],
    );
    itemIds = items.map((i) => i.id);
    expect(itemIds).toHaveLength(4);
    expect(await as(STRANGER, "select * from public.items")).toHaveLength(0);
  });

  it("completes a lesson, creates flashcards and awards points", async () => {
    await expect(as(DAUGHTER, "select public.complete_lesson($1)", [lessonId])).rejects.toThrow();
    const [res] = await as<{ complete_lesson: number }>(DAD, "select public.complete_lesson($1)", [lessonId]);
    expect(res.complete_lesson).toBe(4);
    const [again] = await as<{ complete_lesson: number }>(DAD, "select public.complete_lesson($1)", [lessonId]);
    expect(again.complete_lesson).toBe(0);
    const pts = await as<{ user_id: string; total: number }>(
      DAD, "select user_id, sum(amount)::int as total from public.points group by user_id order by user_id");
    // daughter: send 5 + voice 2 + taught 10 = 17; dad: lesson done 10
    expect(pts).toEqual([{ user_id: DAD, total: 10 }, { user_id: DAUGHTER, total: 17 }]);
  });

  it("rewards the teacher when a card is mastered", async () => {
    const [card] = await as<{ id: string }>(DAD, "select id from public.flashcards limit 1");
    await as(DAD, "update public.flashcards set box = 4 where id = $1", [card.id]);
    const [m] = await as<{ mastered_at: string | null }>(DAD, "select mastered_at from public.flashcards where id = $1", [card.id]);
    expect(m.mastered_at).not.toBeNull();
    const [p] = await as<{ n: number }>(DAD, "select count(*)::int as n from public.points where reason = 'card_mastered'");
    expect(p.n).toBe(1);
    // the daughter can see her partner's progress but cannot change it
    expect(await as(DAUGHTER, "select * from public.flashcards")).toHaveLength(4);
    const upd = await as(DAUGHTER, "update public.flashcards set box = 1 returning id");
    expect(upd).toHaveLength(0);
  });

  it("blocks writing points directly", async () => {
    await expect(
      as(DAD, "insert into public.points (pair_id, user_id, amount, reason) values ($1,$2,1000,'cheat')", [pairId, DAD]),
    ).rejects.toThrow();
    await expect(as(DAD, "select public.award($1,$2,1000,'cheat',null)", [pairId, DAD])).rejects.toThrow();
  });

  it("runs a recording challenge with a teacher rating", async () => {
    const [ch] = await as<{ id: string }>(
      DAD,
      `insert into public.challenges (pair_id, author_id, recipient_id, kind, prompt)
       values ($1,$2,$3,'record','Say: صباح الخير') returning id`,
      [pairId, DAD, DAUGHTER],
    );
    await expect(as(DAUGHTER, "select public.submit_attempt($1,'{}',null,null)", [ch.id])).rejects.toThrow(/recording/);
    const [att] = await as<{ submit_attempt: string }>(
      DAUGHTER, "select public.submit_attempt($1,'{}',null,$2)", [ch.id, `${pairId}/a.webm`]);
    await expect(as(DAUGHTER, "select public.rate_attempt($1,'perfect')", [att.submit_attempt])).rejects.toThrow();
    await as(DAD, "select public.rate_attempt($1,'close')", [att.submit_attempt]);
    const [p] = await as<{ total: number }>(
      DAD, "select coalesce(sum(amount),0)::int as total from public.points where user_id = $1 and reason = 'challenge_pass'", [DAUGHTER]);
    expect(p.total).toBe(15);
  });

  it("caps send points at 3 per day", async () => {
    for (let i = 0; i < 4; i++) {
      await as(DAD, `insert into public.challenges (pair_id, author_id, recipient_id, kind, prompt, data)
                     values ($1,$2,$3,'type','gap','{"answer":"x"}')`, [pairId, DAD, DAUGHTER]);
    }
    const [p] = await as<{ n: number }>(DAD, "select count(*)::int as n from public.points where user_id = $1 and reason = 'send'", [DAD]);
    expect(p.n).toBe(3);
  });

  it("guards audio files by pair folder", async () => {
    await as(DAD, "insert into storage.objects (bucket_id, name) values ('audio', $1)", [`${pairId}/x.webm`]);
    await expect(
      as(STRANGER, "insert into storage.objects (bucket_id, name) values ('audio', $1)", [`${pairId}/y.webm`]),
    ).rejects.toThrow();
    expect(await as(STRANGER, "select * from storage.objects")).toHaveLength(0);
    expect(await as(DAUGHTER, "select * from storage.objects")).toHaveLength(1);
  });

  it("gives the daily review bonus once", async () => {
    await as(DAD, "update public.flashcards set last_reviewed_at = now() where owner_id = $1", [DAD]);
    const [a] = await as<{ claim_daily_review: boolean }>(DAD, "select public.claim_daily_review()");
    const [b] = await as<{ claim_daily_review: boolean }>(DAD, "select public.claim_daily_review()");
    expect([a.claim_daily_review, b.claim_daily_review]).toEqual([true, false]);
  });
});
