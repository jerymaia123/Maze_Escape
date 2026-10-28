# Maze Escape: The Algorithm Challenge — Upgrade Edition

A browser-based maze adventure for a DSALGO project, built with HTML, CSS, vanilla JavaScript, and Supabase.

## New features

- **Five unlockable levels:** larger mazes and harder time limits as the player progresses.
- **Difficulty settings:** Easy Explorer, Maze Runner, and Nightmare change the timer and enemy pressure.
- **Daily maze:** the same seeded maze layout is generated for the current UTC date in each browser.
- **Puzzle route:** activate a switch to open the gate, collect the key, then reach the exit; a hidden wall passage becomes traversable after finding the key.
- **Collectibles and combos:** coins, gems, and treasure chests increase score; collecting loot builds a combo bonus.
- **Hazards:** traps reduce score/time; enemies use BFS to chase the player.
- **Portals:** teleport the player between two maze locations.
- **Power-ups:** reveal a shortest path, activate a one-hit shield, or add 15 seconds.
- **Stars and progression:** earn up to three stars, unlock the next level, and track personal bests.
- **Achievements:** first escape, no hints, speed runner, perfect route, gem hunter, daily adventurer, switch master, and treasure hunter.
- **Sound toggle:** optional synthesized movement/reward sound effects and a simple looping background melody (off by default).
- **Algorithm Lab:** BFS explored-cell count, shortest-path length, enemy route length, Stack history size, and Merge Sort comparisons.
- **Animated BFS:** watch the queue-based search explore cells before highlighting its route.
- **Undo:** Stack-based state snapshots restore position, score, items, timer, power-ups, and enemy positions.
- **Online leaderboard:** submits scores to the existing `public.game_scores` table in Supabase, with all-time and this-week views.
- **Unlockables and local progress:** best score, wins, unlocked levels, achievements, character skins, and maze color themes are stored in the current browser.
- **Responsive layout** for desktop and mobile widths.

## Project structure

```text
MazeEscape/
├── index.html
├── style.css
├── script.js
├── supabase-config.js
├── README.md
└── database/
    └── schema.sql
```

## Setup

1. Open your Supabase project dashboard.
2. Open **SQL Editor** and run `database/schema.sql`. If `game_scores` already exists from the starter version, the script is designed to keep that table and recreate the expected read/insert policies.
3. Open `supabase-config.js` and confirm the project URL and **publishable** key. Never put a secret or `service_role` key in browser code.
4. In VS Code, open the `MazeEscape` folder and start a local server, such as the Live Server extension. Open the local HTTP address; do not open the HTML file directly with `file://` because JavaScript module imports may fail.
5. Enter a display name before winning if you want to submit a score to the online leaderboard.

## Controls

- Move: arrow keys or **W/A/S/D**; mobile-sized layouts also show touch direction buttons
- Show shortest path: **Show shortest path**
- Watch BFS: **Animate BFS**
- Undo: **Undo** (Ctrl+Z also works)
- Use power-ups: collect their icons and click the corresponding inventory button
- Restart: **Restart**
- Daily challenge: **Daily Maze**

## How to play

1. Find and step on the ⚡ switch to open the 🚧 gate.
2. Collect the 🔑 key.
3. Find the 🚪 exit before time runs out.
4. Collect 🟡 coins and 💎 gems for bonus points.
5. Avoid 🕸️ traps and 👾 enemies. Pick up and activate a 🛡️ shield when needed.
6. Use 🌀 portals to travel between two spots in the maze.
7. Finish with fewer moves, more remaining time, and no hints to aim for three stars.

## DSALGO concepts

- **2D array:** the maze's walls and walkable cells.
- **Stack (LIFO):** previous turn snapshots for Undo.
- **Queue (FIFO):** Breadth-First Search for shortest paths and enemy movement.
- **BFS:** explores neighbors in layers; with equal movement costs, the first path found is shortest.
- **Merge Sort:** sorts leaderboard entries by score descending, then moves ascending, then completion time.
- **Seeded pseudo-random generation:** makes the daily maze reproducible for a given date.

## Supabase and security

The existing `game_scores` table is still used with these columns: `player_name`, `score`, `moves`, `completion_time_seconds`, and `created_at`. Local achievements and level progress are stored in browser local storage; no new tables are required for this edition.

The browser uses the Supabase publishable key and the table's Row Level Security policies. A public client game cannot prove that a submitted score was legitimately earned. For a public competition, validate game runs and write scores through a trusted backend or Supabase Edge Function. Do not use a service-role key in this project.

## Verification checklist

Run these checks in a browser before submitting the project:

- [ ] Start a new game and confirm the maze renders.
- [ ] Try to cross a wall and the closed gate.
- [ ] Activate the switch, collect the key, and escape.
- [ ] Collect coins, gems, treasure chests, and each power-up; verify loot combos.
- [ ] Test a trap, enemy collision, shield, and portal.
- [ ] Show a hint and run Animated BFS.
- [ ] Undo a move after collecting an item and verify state restoration.
- [ ] Win a level and confirm stars, achievements, and next-level unlocking.
- [ ] Complete a daily maze and switch the leaderboard between all-time and this-week views.
- [ ] Unlock a level, then try an unlocked character skin and theme.
- [ ] Refresh the page and verify local progress remains.
- [ ] Load and submit a Supabase leaderboard score.
- [ ] Test at a narrow mobile viewport.

## Known limitations

- This version has been checked for JavaScript syntax and maze-generation invariants, but it has not been run through a full real-browser/Supabase end-to-end test in this environment.
- Local progress is tied to the current browser/device and is not a cross-device account system.
- Daily maze dates use UTC.
- Public browser-submitted scores are not cheat-proof; use a trusted server-side validation function if integrity is required.
