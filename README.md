# Maze Escape: The Algorithm Challenge

A DSALGO final project: a playable maze adventure (HTML5 canvas, CSS3, vanilla JavaScript) with a Supabase/PostgreSQL online leaderboard. No frameworks.

## Files
| File | Purpose |
|---|---|
| `index.html`, `style.css` | Page layout, title screen, responsive pixel-dungeon design |
| `script.js` | Game rules, lives, monsters, HUD, achievements, Supabase calls |
| `levels.js` | Maze generation (2D array), gate, vault, secret room, portals, monster spawns |
| `render.js`, `sprites.js` | Canvas drawing: pixel sprites, smooth movement, torch light, particles, level themes |
| `audio.js` | Synthesized sound effects and chiptune music (no audio files) |
| `algorithms.js` | Stack, Queue, BFS, merge sort, seeded random, combo (pure code, unit-tested) |
| `supabase-config.js` | Project URL + publishable key placeholders |
| `database/schema.sql` | New install: table, constraints, indexes, Row Level Security |
| `database/upgrade_v3.sql` | Run once if `game_scores` already exists from an older version |
| `tests.mjs`, `tests/browser-tests.mjs` | Unit tests (Node) and end-to-end tests (real browser) |

## Run it
1. Start a local server in this folder (VS Code **Live Server**, or `python -m http.server 8000`). Do not open `index.html` with `file://`.
2. Open the local address and press **Play**. The game works without Supabase.

## Supabase setup
1. Create a project at supabase.com.
2. SQL Editor > New query > paste `database/schema.sql` > Run. (If you already have the table, run `database/upgrade_v3.sql` instead.)
3. Project Settings > API: copy the **Project URL** and **publishable (anon) key** into `supabase-config.js`. Never put a service-role or secret key in frontend code.

**Security:** Row Level Security is on. Anyone can read scores and insert valid ones; there is no update or delete policy. Constraints (name 1–30 characters, score 0–10000, time and moves limits, level 1–5, avatar length) back up the client checks. A public client cannot prove a score was earned fairly. For real competitions, validate runs in a Supabase Edge Function and insert from there.
The game still saves scores if the new columns are missing (it retries with the basic columns), but the level, avatar and Daily board need `upgrade_v3.sql`.

## Controls
Arrow keys / WASD move · **Space** throw (rocks first, then bombs) · **Z** with Ctrl undo · **Esc** or **P** pause · swipe or on-screen arrows on touch · gamepad: D-pad/stick move, A throw, B undo, Start pause.

## Rules and scoring
- Step on the ⚡ switch (+15) to open the 🚧 gate, grab the 🔑 key (+20), reach the 🚪 exit. The exit works only with the key.
- Coin +10, gem +25, chest +50, secret wall +10, time bonus 2 points per second left, +50 for collecting every coin and gem.
- **Combo:** collecting coins and gems within 6 turns builds a multiplier (×1.5, ×2, ×2.5, up to ×3).
- **Lives:** 3 ❤️ per level (max 5). A monster hit costs a life and 15 points, then you respawn at the start with a few safe moves and monsters go home. Lose all lives: **YOU DIED**. Timer at zero: **TIME'S UP**. Escape: **YOU WIN**.
- Trap −10 points and −5 s. Shortest-path hint −10 points. Items can be collected once; after the game ends nothing changes the score; each win saves at most one online score.
- Your real play time (not changed by time boosts) is recorded and saved with the score.

## Game features
- **Monsters:** 🟢 chaser (slow, chases only when you are close), 🦇 bat (fast, random), 👹 guardian (defends a gem), boss on level 5 (3 HP). Throw 🪨 rocks to stun and 💣 bombs to destroy or hurt the boss.
- **Wide maze, same size:** extra openings, loops and small plazas give you several routes, so you can run around a pillar to lose a monster or take a shortcut to finish faster. Measured on 600 generated mazes (normal difficulty): independent loops per maze rose from 4.5 to 29.7 and the average route to the exit dropped from 58 to 40 steps. The gate, vault and secret rooms stay sealed.
- **Win and death screens:** buttons for **Next stage**, Replay or Try again, and a **Choose stage** picker (locked stages are disabled). Press Enter for the main button.
- **Maze extras:** portals (levels 2+), cracked walls that open to secret rooms, a 🔴 red door vault opened by a red key, fog of war on levels 2–5, five themed levels (stone, ice, lava, ruins, void) with torch lighting.
- **Daily maze:** the same maze for everyone each UTC day (seeded random), with its own leaderboard tab.
- **Characters with perks:** Wizard (free Reveal), Elf (+12 s), Cat (Shield), Robot (free hints), Fox and Ninja (stealth; Ninja also starts with 2 rocks), Vampire (kills heal), Dragon (4 lives). Unlock by clearing levels, winning 3 or 8 times, or winning without losing a life.
- **Progress:** level map with stars and best times, 12 achievements, tutorial tips on level 1, pause, sound and music toggles with volume. Saved in this browser only.
- **Leaderboard:** top scores, fastest runs, and daily tabs; medals, avatars, level, your own name highlighted.

## Data structures
- **2D array** `grid[row][col]`: cell codes (0 open, 1 wall, 2 coin, 3 key, 4 exit, 5 gem, 6 trap, 7 switch, 8 gate, 9–11 power-ups, 12 heart, 13 rock, 14 bomb, 15 portal, 16 secret wall, 17 chest, 18 red key, 19 red door). Used for collision, collecting and drawing.
- **Stack (LIFO):** each move or throw pushes a snapshot; Undo pops the newest. Lives, time and hint count are not restored, so undo cannot be used to cheat.
- **Queue (FIFO):** BFS frontier, with a moving head index instead of `Array.shift()`.

## Algorithms
**BFS** (hints, animation, monster chasing, and maze checks): enqueue the start; while the queue is not empty, dequeue a cell, stop at the target, enqueue unvisited walkable neighbours and remember each one's parent; rebuild the path from the parents. Equal move costs make the first path found shortest. Time O(V + E), space O(V). The hint explains the key is still needed if the exit is locked.

**Merge sort** (leaderboard): split in half, sort both halves, merge by repeatedly taking the better front item (ties take the left one, so it is stable). Score ranking: higher score, fewer moves, faster time. The Fastest tab uses the same sort with a different comparison. Time O(n log n), space O(n). The comparison count in the Algorithm Lab comes from the real run and depends on the data.

## Test results (executed 2026-11-06 after the wider-maze change)
- `node tests.mjs`: **18 of 18 passed** (stack, queue, BFS, merge sort cases, fastest ranking, combo, seeded daily maze, and 300 generated mazes checked for: no loot behind the exit, gate truly blocks, key/switch/red key reachable first, secret and vault rooms sealed, monsters spawn at least 8 steps away).
- `node tests/browser-tests.mjs` (needs `npm i playwright` and a running local server): **47–48 checks passed in real Chromium with no page errors** (one check only runs when the red-door cell has an open neighbour), covering the win-screen stage picker, Next stage, Enter shortcut, Try again, plus: title and pause, a bot completing a level (win banner, recorded time, saved progress, achievement, character unlock, no score change after the game ends), death by monster, losing a life without restarting, time-up, undo, rocks, bombs and the boss, portal, secret wall, red door, deterministic daily maze, leaderboard ranking with a mocked Supabase (score, fastest and daily tabs, avatar, merge-sort count, insert payload and the missing-column retry), all five levels, and a phone-sized screen.
- **Not verified:** sound was checked only for errors (no audio device), gamepad input was not tested with real hardware, and a live Supabase project has not been tested (a mocked one was used). Please also play it yourself on a phone.

## Known limitations and ideas
Scores are not cheat-proof. Progress is stored per browser. Only one colored key (red) exists. Daily monsters use the same seed for wandering but your moves still change their behavior. Ideas: a Supabase Edge Function for score checks, more monster types, a level editor.

## Group contributions
| Member | Contribution |
|---|---|
| | |
