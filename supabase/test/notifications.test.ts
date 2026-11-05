// Email outbox rules, run against the real migrations in an in-memory Postgres.
import { PGlite } from "@electric-sql/pglite";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

const DAD = "00000000-0000-0000-0000-00000000000a";
const DAUGHTER = "00000000-0000-0000-0000-00000000000b";

let db: PGlite;
let pairId = "";

// Run SQL as a signed-in user, as the server ("service"), or as the database owner (null).
async function as<T = Record<string, unknown>>(who: string | null, sql: string, params: unknown[] = []) {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${who && who !== "service" ? who : ""}', false);`);
  if (who === "service") await db.exec("set role service_role;");
  else if (who) await db.exec("set role authenticated;");
  try {
    return (await db.query<T>(sql, params)).rows;
  } finally {
    await db.exec("reset role;");
  }
}

type Claimed = { notification_id: number; email: string; actor_name: string; kind: string; link_id: string; detail: string };
const claim = () => as<Claimed>("service", "select * from public.claim_notifications()");
const finish = (ids: number[]) => as("service", "select public.finish_notifications($1)", [ids]);

beforeAll(async () => {
  db = new PGlite();
  const dir = join(__dirname, "..");
  await db.exec(readFileSync(join(dir, "test/stubs.sql"), "utf8"));
  for (const f of readdirSync(join(dir, "migrations")).sort()) {
    await db.exec(readFileSync(join(dir, "migrations", f), "utf8"));
  }
  await db.exec(`
    grant select, insert, update, delete on all tables in schema public to authenticated;
    grant usage on all sequences in schema public to authenticated;
  `);
  await db.exec(`insert into auth.users values ('${DAD}', 'dad@example.com'), ('${DAUGHTER}', 'daughter@example.com');`);
  const [pair] = await as<{ id: string; invite_code: string }>(DAD, "select * from public.create_pair()");
  pairId = pair.id;
  await as(DAUGHTER, "select public.join_pair($1)", [pair.invite_code]);
}, 60_000);

describe("email outbox", () => {
  it("queues one email for a new lesson and sends it once", async () => {
    await as(DAUGHTER, `insert into public.lessons (pair_id, author_id, recipient_id, template, title)
                        values ($1,$2,$3,'word_set','Bones of the hand')`, [pairId, DAUGHTER, DAD]);
    const rows = await claim();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ email: "dad@example.com", actor_name: "daughter", kind: "lesson", detail: "Bones of the hand" });
    // A second sender running at the same time gets nothing.
    expect(await claim()).toHaveLength(0);
    await finish(rows.map((r) => r.notification_id));
    expect(await claim()).toHaveLength(0);
  });

  it("hides the outbox from app users", async () => {
    expect(await as(DAD, "select * from public.notifications")).toHaveLength(0);
    await expect(
      as(DAD, `insert into public.notifications (recipient_id, actor_id, kind, ref_id)
               values ($1,$2,'lesson',gen_random_uuid())`, [DAUGHTER, DAD]),
    ).rejects.toThrow();
    await expect(as(DAD, "select * from public.claim_notifications()")).rejects.toThrow();
    await expect(as(DAD, "select public.finish_notifications(array[1]::bigint[])")).rejects.toThrow();
  });

  it("tells the teacher about an answer and the learner about a rating", async () => {
    const [ch] = await as<{ id: string }>(DAD, `insert into public.challenges (pair_id, author_id, recipient_id, kind, prompt)
      values ($1,$2,$3,'record','Say: صباح الخير') returning id`, [pairId, DAD, DAUGHTER]);
    let rows = await claim();
    expect(rows.map((r) => [r.kind, r.email])).toEqual([["challenge", "daughter@example.com"]]);
    await finish(rows.map((r) => r.notification_id));

    const [att] = await as<{ submit_attempt: string }>(
      DAUGHTER, "select public.submit_attempt($1,'{}',null,$2)", [ch.id, `${pairId}/a.webm`]);
    rows = await claim();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ kind: "answer", email: "dad@example.com", link_id: ch.id, detail: "Say: صباح الخير" });
    await finish(rows.map((r) => r.notification_id));

    await as(DAD, "select public.rate_attempt($1,'perfect')", [att.submit_attempt]);
    rows = await claim();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ kind: "rating", email: "daughter@example.com", link_id: ch.id, detail: "perfect" });
    await finish(rows.map((r) => r.notification_id));
  });

  it("sends a partner request to the other partner", async () => {
    await as(DAD, "insert into public.requests (pair_id, from_id, text) values ($1,$2,'Teach me the bones of the foot')", [pairId, DAD]);
    const rows = await claim();
    expect(rows).toMatchObject([{ kind: "request", email: "daughter@example.com", detail: "Teach me the bones of the foot" }]);
    await finish(rows.map((r) => r.notification_id));
  });

  it("skips things that are already done or deleted", async () => {
    const [l] = await as<{ id: string }>(DAUGHTER, `insert into public.lessons (pair_id, author_id, recipient_id, template, title)
      values ($1,$2,$3,'phrase','Gone') returning id`, [pairId, DAUGHTER, DAD]);
    await as(DAUGHTER, "delete from public.lessons where id = $1", [l.id]);
    expect(await claim()).toHaveLength(0);
    const [r] = await as<{ result: string }>(null, "select result from public.notifications where ref_id = $1", [l.id]);
    expect(r.result).toBe("stale");
  });

  it("respects the email switch", async () => {
    await as(DAD, "update public.profiles set email_notify = false where id = $1", [DAD]);
    await as(DAUGHTER, `insert into public.lessons (pair_id, author_id, recipient_id, template, title)
                        values ($1,$2,$3,'phrase','Quiet')`, [pairId, DAUGHTER, DAD]);
    expect(await claim()).toHaveLength(0);
    await as(DAD, "update public.profiles set email_notify = true where id = $1", [DAD]);
  });

  it("lets an unfinished claim be retried after 10 minutes", async () => {
    await as(DAUGHTER, `insert into public.lessons (pair_id, author_id, recipient_id, template, title)
                        values ($1,$2,$3,'phrase','Retry me')`, [pairId, DAUGHTER, DAD]);
    expect(await claim()).toHaveLength(1);           // sending failed, nothing marked
    expect(await claim()).toHaveLength(0);           // still claimed
    await as(null, "update public.notifications set claimed_at = now() - interval '11 minutes' where sent_at is null");
    expect(await claim()).toHaveLength(1);
  });
});
