-- Maze Escape: The Algorithm Challenge
-- Run this script in Supabase Dashboard > SQL Editor.
-- Public leaderboard policies below allow anyone to read and insert scores.
-- They do not allow public updates/deletes. Client-submitted scores are NOT
-- cryptographically verified; use a trusted Edge Function for stronger integrity.

create table if not exists public.game_scores (
  id uuid primary key default gen_random_uuid(),
  player_name text not null
    check (char_length(btrim(player_name)) between 1 and 30),
  score integer not null check (score >= 0),
  moves integer not null check (moves >= 0),
  completion_time_seconds integer not null check (completion_time_seconds >= 0),
  created_at timestamptz not null default now()
);

create index if not exists game_scores_leaderboard_idx
  on public.game_scores (score desc, moves asc, created_at asc);

alter table public.game_scores enable row level security;

drop policy if exists "Public can read leaderboard" on public.game_scores;
create policy "Public can read leaderboard"
  on public.game_scores
  for select
  to anon, authenticated
  using (true);

drop policy if exists "Public can submit score" on public.game_scores;
create policy "Public can submit score"
  on public.game_scores
  for insert
  to anon, authenticated
  with check (
    char_length(btrim(player_name)) between 1 and 30
    and score >= 0
    and moves >= 0
    and completion_time_seconds >= 0
  );

-- Intentionally do not create public UPDATE or DELETE policies.
-- For a production leaderboard, consider an Edge Function that validates runs
-- and inserts scores with server-side controls.
