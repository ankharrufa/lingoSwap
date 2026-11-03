-- Core schema for the pair language game (v1).
-- Run this once in the Supabase SQL editor (or with `supabase db push`).
-- Design notes:
--   * Every row belongs to a "pair" of exactly two people.
--   * Row Level Security (RLS) makes sure a user only sees data from their own pair.
--   * Points are only written by database functions, never directly by the app.

-- ---------------------------------------------------------------------------
-- Profiles
-- ---------------------------------------------------------------------------
create table public.profiles (
  id            uuid primary key references auth.users (id) on delete cascade,
  display_name  text not null default '',
  native_lang   text not null default 'en',   -- the language this person teaches
  learning_lang text not null default 'ar',   -- the language this person learns
  created_at    timestamptz not null default now()
);

-- Create a profile automatically when someone signs up.
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(split_part(new.email, '@', 1), ''))
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Pairs
-- ---------------------------------------------------------------------------
create table public.pairs (
  id          uuid primary key default gen_random_uuid(),
  user_a      uuid not null references public.profiles (id) on delete cascade,
  user_b      uuid references public.profiles (id) on delete cascade,
  invite_code text not null unique,
  created_at  timestamptz not null default now(),
  check (user_a <> user_b)
);
create unique index pairs_user_a_key on public.pairs (user_a);
create unique index pairs_user_b_key on public.pairs (user_b) where user_b is not null;

-- Helpers. "security definer" lets RLS policies call them without recursion.
create function public.my_pair_id() returns uuid
language sql stable security definer set search_path = public as $$
  select id from public.pairs where user_a = auth.uid() or user_b = auth.uid() limit 1
$$;

create function public.is_pair_member(p_pair uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.pairs
    where id = p_pair and (user_a = auth.uid() or user_b = auth.uid())
  )
$$;

create function public.partner_id(p_pair uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select case when user_a = auth.uid() then user_b else user_a end
  from public.pairs
  where id = p_pair and (user_a = auth.uid() or user_b = auth.uid())
$$;

-- Create my pair (or return the one I already have) and get an invite code.
create function public.create_pair() returns public.pairs
language plpgsql security definer set search_path = public as $$
declare
  v_pair public.pairs;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  select * into v_pair from public.pairs where user_a = auth.uid() or user_b = auth.uid();
  if found then return v_pair; end if;
  insert into public.pairs (user_a, invite_code)
  values (auth.uid(), substr(replace(gen_random_uuid()::text, '-', ''), 1, 8))
  returning * into v_pair;
  return v_pair;
end $$;

-- Join a partner's pair with their invite code.
create function public.join_pair(p_code text) returns public.pairs
language plpgsql security definer set search_path = public as $$
declare
  v_pair public.pairs;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if exists (select 1 from public.pairs where user_a = auth.uid() or user_b = auth.uid()) then
    raise exception 'you already have a partner';
  end if;
  select * into v_pair from public.pairs where invite_code = lower(trim(p_code)) for update;
  if not found then raise exception 'invite code not found'; end if;
  if v_pair.user_b is not null then raise exception 'this invite is already used'; end if;
  if v_pair.user_a = auth.uid() then raise exception 'you cannot join your own invite'; end if;
  update public.pairs set user_b = auth.uid() where id = v_pair.id returning * into v_pair;
  return v_pair;
end $$;

-- ---------------------------------------------------------------------------
-- Teach: lessons and their items (words or phrases)
-- ---------------------------------------------------------------------------
create table public.lessons (
  id           uuid primary key default gen_random_uuid(),
  pair_id      uuid not null references public.pairs (id) on delete cascade,
  author_id    uuid not null references public.profiles (id) on delete cascade,
  recipient_id uuid not null references public.profiles (id) on delete cascade,
  template     text not null check (template in ('word_set', 'phrase')),
  title        text not null default '',
  prompt       text,                       -- the idea prompt it started from, if any
  created_at   timestamptz not null default now(),
  opened_at    timestamptz,
  completed_at timestamptz
);
create index lessons_recipient_idx on public.lessons (recipient_id, completed_at);

create table public.items (
  id          uuid primary key default gen_random_uuid(),
  lesson_id   uuid not null references public.lessons (id) on delete cascade,
  pair_id     uuid not null references public.pairs (id) on delete cascade,
  author_id   uuid not null references public.profiles (id) on delete cascade,
  position    int  not null default 0,
  term        text not null check (length(trim(term)) > 0),   -- in the teacher's language
  translation text not null default '',                        -- in the learner's language
  note        text,                                            -- e.g. "how I really say it"
  audio_path  text,                                            -- path in the 'audio' bucket
  created_at  timestamptz not null default now()
);
create index items_lesson_idx on public.items (lesson_id, position);

-- ---------------------------------------------------------------------------
-- Challenges and attempts
-- ---------------------------------------------------------------------------
create table public.challenges (
  id           uuid primary key default gen_random_uuid(),
  pair_id      uuid not null references public.pairs (id) on delete cascade,
  author_id    uuid not null references public.profiles (id) on delete cascade,
  recipient_id uuid not null references public.profiles (id) on delete cascade,
  kind         text not null check (kind in ('quiz', 'type', 'record')),
  prompt       text not null default '',
  -- quiz:   {"questions":[{"q":..,"options":[..],"answer":0,"item_id":..}]}
  -- type:   {"answer": "expected text"}           (fill the gap / translate)
  -- record: {"audio_path": "model clip, optional"}
  data         jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now(),
  completed_at timestamptz
);
create index challenges_recipient_idx on public.challenges (recipient_id, completed_at);

create table public.attempts (
  id           uuid primary key default gen_random_uuid(),
  challenge_id uuid not null references public.challenges (id) on delete cascade,
  user_id      uuid not null references public.profiles (id) on delete cascade,
  answer       jsonb not null default '{}'::jsonb,
  score        numeric check (score between 0 and 1),   -- null until rated (record)
  audio_path   text,
  rating       text check (rating in ('perfect', 'close', 'try_again')),
  rated_at     timestamptz,
  created_at   timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Flashcards (one per learner per item)
-- ---------------------------------------------------------------------------
create table public.flashcards (
  id               uuid primary key default gen_random_uuid(),
  owner_id         uuid not null references public.profiles (id) on delete cascade,
  item_id          uuid not null references public.items (id) on delete cascade,
  box              int  not null default 1 check (box between 1 and 6),
  due_at           timestamptz not null default now(),
  reps             int  not null default 0,
  lapses           int  not null default 0,
  last_reviewed_at timestamptz,
  mastered_at      timestamptz,
  created_at       timestamptz not null default now(),
  unique (owner_id, item_id)
);
create index flashcards_due_idx on public.flashcards (owner_id, due_at);

-- ---------------------------------------------------------------------------
-- Requests ("Teach me how to order coffee")
-- ---------------------------------------------------------------------------
create table public.requests (
  id         uuid primary key default gen_random_uuid(),
  pair_id    uuid not null references public.pairs (id) on delete cascade,
  from_id    uuid not null references public.profiles (id) on delete cascade,
  text       text not null check (length(trim(text)) > 0),
  done_at    timestamptz,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Points ledger (written only by the functions below)
-- ---------------------------------------------------------------------------
create table public.points (
  id         bigint generated always as identity primary key,
  pair_id    uuid not null references public.pairs (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  amount     int  not null,
  reason     text not null,
  ref_id     uuid,
  created_at timestamptz not null default now()
);
create index points_pair_idx on public.points (pair_id, created_at);

create function public.award(p_pair uuid, p_user uuid, p_amount int, p_reason text, p_ref uuid)
returns void language sql security definer set search_path = public as $$
  insert into public.points (pair_id, user_id, amount, reason, ref_id)
  values (p_pair, p_user, p_amount, p_reason, p_ref)
$$;
-- Supabase grants new functions to anon/authenticated by default, so revoke explicitly.
revoke execute on function public.award(uuid, uuid, int, text, uuid) from public, anon, authenticated;

-- Teacher points for sending: 5 each, at most 3 sends per day.
create function public.on_content_sent() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_today int;
begin
  select count(*) into v_today from public.points
  where user_id = new.author_id and reason = 'send'
    and created_at >= date_trunc('day', now());
  if v_today < 3 then
    perform public.award(new.pair_id, new.author_id, 5, 'send', new.id);
  end if;
  return new;
end $$;

create trigger lessons_sent after insert on public.lessons
  for each row execute function public.on_content_sent();
create trigger challenges_sent after insert on public.challenges
  for each row execute function public.on_content_sent();

-- +2 teacher points for each item recorded in the teacher's own voice.
create function public.on_item_voice() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.audio_path is not null then
    perform public.award(new.pair_id, new.author_id, 2, 'voice', new.id);
  end if;
  return new;
end $$;
create trigger items_voice after insert on public.items
  for each row execute function public.on_item_voice();

-- Learner opens a lesson.
create function public.open_lesson(p_lesson uuid) returns void
language sql security definer set search_path = public as $$
  update public.lessons set opened_at = coalesce(opened_at, now())
  where id = p_lesson and recipient_id = auth.uid()
$$;

-- Learner finishes a lesson: flashcards are created and both people score.
create function public.complete_lesson(p_lesson uuid) returns int
language plpgsql security definer set search_path = public as $$
declare
  v_lesson public.lessons;
  v_cards  int;
begin
  select * into v_lesson from public.lessons
  where id = p_lesson and recipient_id = auth.uid() for update;
  if not found then raise exception 'lesson not found'; end if;
  if v_lesson.completed_at is not null then return 0; end if;

  update public.lessons
  set completed_at = now(), opened_at = coalesce(opened_at, now())
  where id = p_lesson;

  insert into public.flashcards (owner_id, item_id)
  select auth.uid(), i.id from public.items i where i.lesson_id = p_lesson
  on conflict (owner_id, item_id) do nothing;
  get diagnostics v_cards = row_count;

  perform public.award(v_lesson.pair_id, auth.uid(), 10, 'lesson_done', p_lesson);
  perform public.award(v_lesson.pair_id, v_lesson.author_id, 10, 'lesson_taught', p_lesson);
  return v_cards;
end $$;

-- Learner saves one item as a flashcard by hand (e.g. from an older lesson).
create function public.save_card(p_item uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (
    select 1 from public.items i join public.lessons l on l.id = i.lesson_id
    where i.id = p_item and l.recipient_id = auth.uid()
  ) then raise exception 'item not found'; end if;
  insert into public.flashcards (owner_id, item_id) values (auth.uid(), p_item)
  on conflict do nothing;
end $$;

-- Learner submits an answer to a challenge.
-- p_score: 0..1 for auto-checked kinds, null for recordings (the teacher rates them).
create function public.submit_attempt(
  p_challenge uuid, p_answer jsonb, p_score numeric, p_audio text
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_ch  public.challenges;
  v_id  uuid;
begin
  select * into v_ch from public.challenges
  where id = p_challenge and recipient_id = auth.uid() for update;
  if not found then raise exception 'challenge not found'; end if;
  if v_ch.completed_at is not null then raise exception 'already answered'; end if;
  if v_ch.kind = 'record' and p_audio is null then raise exception 'recording missing'; end if;

  insert into public.attempts (challenge_id, user_id, answer, score, audio_path)
  values (p_challenge, auth.uid(), coalesce(p_answer, '{}'::jsonb),
          case when v_ch.kind = 'record' then null else p_score end, p_audio)
  returning id into v_id;

  update public.challenges set completed_at = now() where id = p_challenge;

  if v_ch.kind <> 'record' and p_score is not null and p_score >= 0.6 then
    perform public.award(v_ch.pair_id, auth.uid(), 10 + round(10 * p_score)::int, 'challenge_pass', p_challenge);
  end if;
  return v_id;
end $$;

-- Teacher rates an answer (needed for recordings, optional otherwise).
create function public.rate_attempt(p_attempt uuid, p_rating text) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_at public.attempts;
  v_ch public.challenges;
begin
  if p_rating not in ('perfect', 'close', 'try_again') then raise exception 'bad rating'; end if;
  select * into v_at from public.attempts where id = p_attempt for update;
  if not found then raise exception 'attempt not found'; end if;
  select * into v_ch from public.challenges where id = v_at.challenge_id;
  if v_ch.author_id <> auth.uid() then raise exception 'only the teacher can rate'; end if;
  if v_at.rated_at is not null then raise exception 'already rated'; end if;

  update public.attempts
  set rating = p_rating, rated_at = now(),
      score = coalesce(score, case p_rating when 'perfect' then 1 when 'close' then 0.7 else 0.3 end)
  where id = p_attempt;

  perform public.award(v_ch.pair_id, auth.uid(), 3, 'rated', p_attempt);
  if v_ch.kind = 'record' then
    perform public.award(v_ch.pair_id, v_at.user_id,
      case p_rating when 'perfect' then 20 when 'close' then 15 else 5 end,
      'challenge_pass', v_ch.id);
  end if;
end $$;

-- Daily review bonus: 5 points, once per day, for the learner.
create function public.claim_daily_review() returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_pair uuid := public.my_pair_id();
begin
  if v_pair is null then return false; end if;
  if exists (select 1 from public.points where user_id = auth.uid()
             and reason = 'daily_review' and created_at >= date_trunc('day', now())) then
    return false;
  end if;
  if not exists (select 1 from public.flashcards where owner_id = auth.uid()
                 and last_reviewed_at >= date_trunc('day', now())) then
    return false;
  end if;
  perform public.award(v_pair, auth.uid(), 5, 'daily_review', null);
  return true;
end $$;

-- When a card is mastered (reaches box 4 for the first time), the teacher scores.
create function public.on_card_mastered() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_item public.items;
begin
  if new.box >= 4 and old.box < 4 and old.mastered_at is null then
    new.mastered_at := now();
    select * into v_item from public.items where id = new.item_id;
    perform public.award(v_item.pair_id, v_item.author_id, 5, 'card_mastered', new.id);
  end if;
  return new;
end $$;
create trigger flashcards_mastered before update on public.flashcards
  for each row execute function public.on_card_mastered();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.profiles   enable row level security;
alter table public.pairs      enable row level security;
alter table public.lessons    enable row level security;
alter table public.items      enable row level security;
alter table public.challenges enable row level security;
alter table public.attempts   enable row level security;
alter table public.flashcards enable row level security;
alter table public.requests   enable row level security;
alter table public.points     enable row level security;

-- Profiles: see yourself and your partner; edit only yourself.
create policy profiles_select on public.profiles for select
  using (id = auth.uid() or id = public.partner_id(public.my_pair_id()));
create policy profiles_update on public.profiles for update
  using (id = auth.uid()) with check (id = auth.uid());

-- Pairs: read your own. Create and join only through the functions above.
create policy pairs_select on public.pairs for select
  using (user_a = auth.uid() or user_b = auth.uid());

-- Lessons: author or recipient can read; author sends to their partner.
create policy lessons_select on public.lessons for select
  using (author_id = auth.uid() or recipient_id = auth.uid());
create policy lessons_insert on public.lessons for insert
  with check (author_id = auth.uid()
              and public.is_pair_member(pair_id)
              and recipient_id = public.partner_id(pair_id));
create policy lessons_delete on public.lessons for delete
  using (author_id = auth.uid() and completed_at is null);

create policy items_select on public.items for select
  using (public.is_pair_member(pair_id));
create policy items_insert on public.items for insert
  with check (author_id = auth.uid() and exists (
    select 1 from public.lessons l
    where l.id = lesson_id and l.author_id = auth.uid() and l.pair_id = items.pair_id));

-- Challenges.
create policy challenges_select on public.challenges for select
  using (author_id = auth.uid() or recipient_id = auth.uid());
create policy challenges_insert on public.challenges for insert
  with check (author_id = auth.uid()
              and public.is_pair_member(pair_id)
              and recipient_id = public.partner_id(pair_id));
create policy challenges_delete on public.challenges for delete
  using (author_id = auth.uid() and completed_at is null);

-- Attempts: both people in the challenge can read. Writes go through functions.
create policy attempts_select on public.attempts for select
  using (exists (select 1 from public.challenges c where c.id = challenge_id
                 and (c.author_id = auth.uid() or c.recipient_id = auth.uid())));

-- Flashcards: the owner reads and updates their own cards.
-- The teacher can also read them, to see the partner's progress.
create policy flashcards_select on public.flashcards for select
  using (owner_id = auth.uid() or exists (
    select 1 from public.items i where i.id = item_id and i.author_id = auth.uid()));
create policy flashcards_update on public.flashcards for update
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy flashcards_delete on public.flashcards for delete
  using (owner_id = auth.uid());

-- Requests.
create policy requests_select on public.requests for select
  using (public.is_pair_member(pair_id));
create policy requests_insert on public.requests for insert
  with check (from_id = auth.uid() and public.is_pair_member(pair_id));
create policy requests_update on public.requests for update
  using (public.is_pair_member(pair_id) and from_id <> auth.uid())
  with check (public.is_pair_member(pair_id));

-- Points: read your pair's ledger only.
create policy points_select on public.points for select
  using (public.is_pair_member(pair_id));

-- Functions the app may call.
grant execute on function public.create_pair()                          to authenticated;
grant execute on function public.join_pair(text)                        to authenticated;
grant execute on function public.open_lesson(uuid)                      to authenticated;
grant execute on function public.complete_lesson(uuid)                  to authenticated;
grant execute on function public.save_card(uuid)                        to authenticated;
grant execute on function public.submit_attempt(uuid, jsonb, numeric, text) to authenticated;
grant execute on function public.rate_attempt(uuid, text)               to authenticated;
grant execute on function public.claim_daily_review()                   to authenticated;

-- ---------------------------------------------------------------------------
-- Audio storage: a private bucket. Files live under "<pair_id>/<file>".
-- Only the two people in that pair can upload or play them.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('audio', 'audio', false)
on conflict (id) do nothing;

create function public.can_use_audio_path(p_name text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.pairs
    where id::text = (storage.foldername(p_name))[1]
      and (user_a = auth.uid() or user_b = auth.uid())
  )
$$;

create policy audio_read on storage.objects for select to authenticated
  using (bucket_id = 'audio' and public.can_use_audio_path(name));
create policy audio_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'audio' and public.can_use_audio_path(name));
