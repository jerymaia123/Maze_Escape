-- Run once if your game_scores table already exists (from any earlier version). Safe to run again.
alter table public.game_scores add column if not exists level integer not null default 1 check (level between 1 and 5);
alter table public.game_scores add column if not exists avatar text not null default '🧙' check (char_length(avatar) <= 8);
alter table public.game_scores add column if not exists daily boolean not null default false;
create index if not exists game_scores_time_idx on public.game_scores (completion_time_seconds asc, score desc);
create index if not exists game_scores_daily_idx on public.game_scores (daily, created_at desc);
drop policy if exists "Public can submit valid scores" on public.game_scores;
create policy "Public can submit valid scores" on public.game_scores
  for insert to anon, authenticated
  with check (char_length(btrim(player_name)) between 1 and 30
              and score between 0 and 10000 and moves >= 0 and completion_time_seconds >= 0
              and level between 1 and 5 and char_length(avatar) <= 8);
