-- Email notifications (v1.1).
-- Run this once in the Supabase SQL editor, after 0001_core.sql.
-- How it works:
--   1. Triggers put one row in "notifications" (an outbox) when a partner sends something.
--   2. The server route /api/notify claims the waiting rows, sends one email per person,
--      and marks the rows as sent.
--   3. App users cannot read or write the outbox. Only the triggers and the server
--      (with the service role key) can. So nobody can make the app send fake emails.

-- Each person can turn emails off on the "You" page.
alter table public.profiles add column email_notify boolean not null default true;

create table public.notifications (
  id           bigint generated always as identity primary key,
  recipient_id uuid not null references public.profiles (id) on delete cascade,
  actor_id     uuid not null references public.profiles (id) on delete cascade,
  kind         text not null check (kind in ('lesson', 'challenge', 'answer', 'rating', 'request')),
  ref_id       uuid not null,             -- the lesson, challenge, attempt or request
  created_at   timestamptz not null default now(),
  claimed_at   timestamptz,               -- a sender is working on it
  sent_at      timestamptz,               -- finished (see "result")
  result       text,                      -- 'sent', 'opted_out', 'stale'
  unique (kind, ref_id)                   -- never two emails for the same thing
);
create index notifications_waiting_idx on public.notifications (id) where sent_at is null;

alter table public.notifications enable row level security;
-- No policies: app users see nothing. The service role ignores RLS.
revoke all on public.notifications from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Triggers that fill the outbox
-- ---------------------------------------------------------------------------
create function public.queue_notification() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_to    uuid;
  v_from  uuid;
  v_kind  text;
begin
  if tg_table_name = 'lessons' then
    v_to := new.recipient_id; v_from := new.author_id; v_kind := 'lesson';
  elsif tg_table_name = 'challenges' then
    v_to := new.recipient_id; v_from := new.author_id; v_kind := 'challenge';
  elsif tg_table_name = 'attempts' and tg_op = 'INSERT' then
    -- The learner answered: tell the teacher.
    select author_id into v_to from public.challenges where id = new.challenge_id;
    v_from := new.user_id; v_kind := 'answer';
  elsif tg_table_name = 'attempts' and tg_op = 'UPDATE' then
    -- The teacher rated the answer: tell the learner.
    if new.rated_at is null or old.rated_at is not null then return new; end if;
    select author_id into v_from from public.challenges where id = new.challenge_id;
    v_to := new.user_id; v_kind := 'rating';
  elsif tg_table_name = 'requests' then
    select case when user_a = new.from_id then user_b else user_a end into v_to
    from public.pairs where id = new.pair_id;
    v_from := new.from_id; v_kind := 'request';
  end if;

  if v_to is not null and v_from is not null and v_to <> v_from then
    insert into public.notifications (recipient_id, actor_id, kind, ref_id)
    values (v_to, v_from, v_kind, new.id)
    on conflict (kind, ref_id) do nothing;
  end if;
  return new;
end $$;

create trigger lessons_notify    after insert on public.lessons
  for each row execute function public.queue_notification();
create trigger challenges_notify after insert on public.challenges
  for each row execute function public.queue_notification();
create trigger attempts_notify   after insert or update of rated_at on public.attempts
  for each row execute function public.queue_notification();
create trigger requests_notify   after insert on public.requests
  for each row execute function public.queue_notification();

-- ---------------------------------------------------------------------------
-- Functions for the server (service role only)
-- ---------------------------------------------------------------------------

-- Claim the rows that wait for an email, with everything the email needs.
-- Rows are skipped (not emailed) when the person turned emails off, or when the
-- thing is already done (lesson finished, challenge answered, request fulfilled)
-- or deleted. A claim that was not finished within 10 minutes can be claimed again.
create function public.claim_notifications(p_limit int default 100)
returns table (
  notification_id bigint,
  recipient_id    uuid,
  email           text,
  recipient_name  text,
  actor_name      text,
  kind            text,
  ref_id          uuid,
  link_id         uuid,     -- the page to open: lesson, challenge or request id
  detail          text      -- title, prompt, request text or rating
)
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
begin
  -- 1. Close rows that must not be emailed.
  update public.notifications n
  set sent_at = now(), result = 'opted_out'
  from public.profiles p
  where n.sent_at is null and p.id = n.recipient_id and not p.email_notify;

  update public.notifications n
  set sent_at = now(), result = 'stale'
  where n.sent_at is null and (
       (n.kind = 'lesson' and not exists (
          select 1 from public.lessons l where l.id = n.ref_id and l.completed_at is null))
    or (n.kind = 'challenge' and not exists (
          select 1 from public.challenges c where c.id = n.ref_id and c.completed_at is null))
    or (n.kind = 'request' and not exists (
          select 1 from public.requests r where r.id = n.ref_id and r.done_at is null))
    or (n.kind in ('answer', 'rating') and not exists (
          select 1 from public.attempts a where a.id = n.ref_id))
  );

  -- 2. Claim what is left and return it.
  return query
  with picked as (
    update public.notifications n
    set claimed_at = now()
    where n.id in (
      select w.id from public.notifications w
      where w.sent_at is null
        and (w.claimed_at is null or w.claimed_at < now() - interval '10 minutes')
      order by w.id
      limit p_limit
      for update skip locked
    )
    returning n.*
  )
  select
    k.id,
    k.recipient_id,
    u.email::text,
    rp.display_name,
    ap.display_name,
    k.kind,
    k.ref_id,
    case when k.kind in ('answer', 'rating') then a.challenge_id else k.ref_id end,
    case k.kind
      when 'lesson'    then (select l.title  from public.lessons l    where l.id = k.ref_id)
      when 'challenge' then (select c.prompt from public.challenges c where c.id = k.ref_id)
      when 'request'   then (select r.text   from public.requests r   where r.id = k.ref_id)
      when 'answer'    then (select c.prompt from public.challenges c where c.id = a.challenge_id)
      when 'rating'    then a.rating
    end
  from picked k
  join auth.users u        on u.id = k.recipient_id
  join public.profiles rp  on rp.id = k.recipient_id
  join public.profiles ap  on ap.id = k.actor_id
  left join public.attempts a on k.kind in ('answer', 'rating') and a.id = k.ref_id
  order by k.id;
end $$;

-- Mark rows as finished after the email went out.
create function public.finish_notifications(p_ids bigint[], p_result text default 'sent')
returns void language sql security definer set search_path = public as $$
  update public.notifications
  set sent_at = now(), result = p_result
  where id = any (p_ids) and sent_at is null
$$;

-- Supabase grants new functions to everyone by default, so lock these down.
revoke execute on function public.claim_notifications(int) from public, anon, authenticated;
revoke execute on function public.finish_notifications(bigint[], text) from public, anon, authenticated;
revoke execute on function public.queue_notification() from public, anon, authenticated;
grant execute on function public.claim_notifications(int) to service_role;
grant execute on function public.finish_notifications(bigint[], text) to service_role;
