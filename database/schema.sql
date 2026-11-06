-- Run this whole script in Supabase: SQL Editor > New query > Run.
create table if not exists public.game_scores (
  id uuid primary key default gen_random_uuid(),
  player_name text not null check (char_length(btrim(player_name)) between 1 and 30),
  score integer not null check (score between 0 and 10000),
  moves integer not null check (moves between 0 and 5000),
  completion_time_seconds integer not null check (completion_time_seconds between 0 and 600),
  level integer not null default 1 check (level between 1 and 5),
  avatar text not null default '🧙' check (char_length(avatar) <= 8),
  daily boolean not null default false,
  created_at timestamptz not null default now()
);

-- Leaderboard order: highest score, fewer moves, faster time.
create index if not exists game_scores_rank_idx
  on public.game_scores (score desc, moves asc, completion_time_seconds asc);

create index if not exists game_scores_time_idx
  on public.game_scores (completion_time_seconds asc, score desc);

-- Row Level Security: the public can read scores and add valid ones. Nobody can edit or delete.
alter table public.game_scores enable row level security;
drop policy if exists "Public can read scores" on public.game_scores;
drop policy if exists "Public can submit valid scores" on public.game_scores;
create policy "Public can read scores" on public.game_scores
  for select to anon, authenticated using (true);
create policy "Public can submit valid scores" on public.game_scores
  for insert to anon, authenticated
  with check (char_length(btrim(player_name)) between 1 and 30
              and score between 0 and 10000 and moves >= 0 and completion_time_seconds >= 0 and level between 1 and 5);
-- No UPDATE or DELETE policy exists, so those requests are denied by RLS.
revoke update, delete on public.game_scores from anon, authenticated;
