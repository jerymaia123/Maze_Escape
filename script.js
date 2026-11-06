// script.js - game rules, UI and Supabase. Algorithms: algorithms.js · maze generation: levels.js · drawing: render.js
import { Stack, bfs, mergeSort, compareScores, compareTimes, comboMultiplier, mulberry32, hashString } from "./algorithms.js";
import { C, BLOCKED, buildLevel, inBounds } from "./levels.js";
import { createRenderer } from "./render.js";
import { createAudio } from "./audio.js";
import { supabase } from "./supabase-config.js";

const $ = (id) => document.getElementById(id);
const POINTS = { coin: 10, gem: 25, key: 20, rkey: 20, switch: 15, chest: 50, secret: 10, trap: -10, enemy: -15, hint: -10, perSecondLeft: 2, treasure: 50, kill: 30, boss: 200 };
const LEVEL_NAMES = ["Stone Dungeon", "Ice Caverns", "Lava Temple", "Mossy Ruins", "The Void"];
const AGGRO = { easy: 6, normal: 8, hard: 11 }, ENEMY_EVERY = { easy: 3, normal: 2, hard: 2 };   // how close before a chaser notices you / how slowly it moves
const DIRS4 = [[-1, 0], [1, 0], [0, -1], [0, 1]];
const PERKS = {   // each character has a small perk
  "🧙": { text: "Starts with a free Reveal power-up.", inv: { reveal: 1 } },
  "🧝": { text: "+12 seconds on every level.", secs: 12 },
  "🐱": { text: "Starts with a Shield.", inv: { shield: 1 } },
  "🤖": { text: "Shortest-path hints cost no points.", freeHint: true },
  "🦊": { text: "Stealthy: monsters notice you 2 steps later.", stealth: 2 },
  "🥷": { text: "Very stealthy (monsters notice you much later) and starts with 2 rocks.", stealth: 3, rocks: 2 },
  "🧛": { text: "Killing a monster heals 1 life.", lifesteal: true },
  "🐉": { text: "Starts with 4 lives.", lives: 4 }
};
const AVATARS = [   // [emoji, name, unlocked?, how to unlock]
  ["🧙", "Wizard", () => true, ""], ["🧝", "Elf", () => progress.unlocked >= 2, "clear level 1"], ["🐱", "Lucky cat", () => progress.unlocked >= 3, "clear level 2"],
  ["🤖", "Robot", () => progress.unlocked >= 4, "clear level 3"], ["🦊", "Fox", () => progress.unlocked >= 5, "clear level 4"],
  ["🥷", "Ninja", () => progress.wins >= 3, "win 3 times"], ["🧛", "Vampire", () => progress.flawless, "win without losing a life"], ["🐉", "Dragon", () => progress.wins >= 8, "win 8 times"]
];
const THEMES = [["moonlight", "Moonlight", 1], ["emerald", "Emerald", 2], ["sunset", "Sunset", 3], ["cyber", "Cyber", 5]];
const ACH = [   // [id, icon, name, how to earn it]
  ["first-win", "🏁", "First Escape", "Win a level."], ["untouchable", "🛡️", "Untouchable", "Win without losing a life."], ["treasure", "💰", "Treasure Master", "Collect every coin and gem."],
  ["speed", "⚡", "Speed Runner", "Win a level in under 60 seconds."], ["boss", "👑", "Boss Slayer", "Defeat the level 5 boss."], ["vault", "🔴", "Vault Raider", "Open the red door."],
  ["secret", "🕳️", "Secret Finder", "Open a cracked wall."], ["portal", "🌀", "Portal Hopper", "Use a portal."], ["combo", "🔥", "Combo King", "Reach a ×3 combo."],
  ["hunter", "🎯", "Monster Hunter", "Defeat 5 monsters in total."], ["daily", "📅", "Daily Adventurer", "Win the daily maze."], ["stars", "🌟", "Perfect Route", "Earn three stars."]
];
const SAVE_KEY = "mazeEscapeV4", NAME_RULE = /^[\p{L}\p{N} _.\-]{1,30}$/u;
const posKey = (p) => `${p.row},${p.col}`, same = (a, b) => a.row === b.row && a.col === b.col, clone = (p) => ({ row: p.row, col: p.col });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const todayUTC = () => new Date().toISOString().slice(0, 10);
const formatTime = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

const audio = createAudio(), view = createRenderer($("maze"));
let game = null, timer = null, submitting = false, boardMode = "score", lastMoveAt = 0;
let progress = loadProgress();

// ---------- saved progress ----------
function loadProgress() {
  const base = { unlocked: 1, best: 0, wins: 0, flawless: false, avatar: "🧙", theme: "moonlight", levels: {}, achievements: [], kills: 0, tutorialDone: false, seen: [], music: true, sfx: true, volume: 50, dailyDate: "", dailyBest: 0 };
  try { const s = { ...base, ...JSON.parse(localStorage.getItem(SAVE_KEY) || "{}") }; if (!Array.isArray(s.achievements)) s.achievements = []; if (!Array.isArray(s.seen)) s.seen = []; return s; } catch { return base; }
}
function saveProgress() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(progress)); } catch { /* storage may be blocked */ } renderProfile(); }
function unlock(id) {
  if (progress.achievements.includes(id)) return;
  progress.achievements.push(id); const a = ACH.find((x) => x[0] === id);
  toast(`🏅 Achievement: ${a[2]}`); audio.play("secret"); saveProgress();
}

// ---------- messages ----------
function say(text) { $("game-message").textContent = text; }
function toast(text) {
  document.querySelector(".toast")?.remove();
  const el = Object.assign(document.createElement("div"), { className: "toast", textContent: text });
  document.body.append(el); setTimeout(() => el.remove(), 2400);
}
function once(id, text) { if (progress.seen.includes(id)) return; progress.seen.push(id); toast(text); try { localStorage.setItem(SAVE_KEY, JSON.stringify(progress)); } catch { /* ignore */ } }

// ---------- game setup ----------
function newGame(level, opts = {}) {
  const daily = Boolean(opts.daily), difficulty = daily ? "normal" : $("difficulty").value || "normal";
  const rand = daily ? mulberry32(hashString(`maze-${todayUTC()}`) + level) : Math.random;   // daily maze: same seed for everyone
  const map = buildLevel(level, difficulty, rand), perk = PERKS[progress.avatar] || {};
  game = {
    ...map, daily, perk, player: clone(map.start), facing: [0, 1], score: 0, moves: 0, turn: 0, secondsLeft: map.seconds + (perk.secs || 0), elapsed: 0,
    lives: perk.lives || 3, grace: 0, hasKey: false, redKey: false, switchOn: false, gateOpen: false, shield: false,
    inv: { reveal: perk.inv?.reveal || 0, shield: perk.inv?.shield || 0, boost: 0, rock: perk.rocks || 0, bomb: 0 }, got: { coins: 0, gems: 0 },
    enemies: map.spawns.map((s, id) => ({ id, type: s.type, row: s.row, col: s.col, post: s.post ? clone(s.post) : null, hp: s.hp, maxHp: s.hp, stun: 0 })),
    history: new Stack(), hint: [], explored: [], bfsExplored: null, pathLen: null, enemyPathLen: null, hints: 0,
    active: true, won: false, animating: false, paused: false, submitted: false, seen: new Set(), cause: "", lostLife: false,
    streak: 0, lastPick: -99, bestStreak: 0, bossDown: false, portalLock: false, rand
  };
  for (const id of ["end-panel", "result-banner", "pause-overlay"]) $(id).hidden = true;
  $("star-result").textContent = ""; $("end-save").textContent = ""; $("pause-btn").textContent = "⏸ Pause";
  view.reset(); say(daily ? "Daily maze! Everyone gets this same maze today." : "Find the ⚡ switch, then the 🔑 key, then the exit."); markSeen(); hud(); startTimer();
}
function fogRadius() {
  let r = [99, 7, 6, 5, 5][game.level - 1];
  if (r < 99) r += game.difficulty === "easy" ? 1 : game.difficulty === "hard" ? -1 : 0;
  return r;
}
function markSeen() {
  const R = fogRadius(), p = game.player; if (R >= 99) return;
  for (let dr = -R; dr <= R; dr++) for (let dc = -R; dc <= R; dc++) game.seen.add(`${p.row + dr},${p.col + dc}`);
}

// ---------- undo (stack) ----------
// A snapshot holds everything a move can change. Lives, time and hints are NOT restored, so undo cannot be used to cheat.
const snapshot = () => ({
  grid: game.grid.map((r) => r.slice()), player: clone(game.player), facing: [...game.facing], score: game.score, moves: game.moves, turn: game.turn,
  hasKey: game.hasKey, redKey: game.redKey, switchOn: game.switchOn, gateOpen: game.gateOpen, shield: game.shield, inv: { ...game.inv }, got: { ...game.got },
  enemies: game.enemies.map((e) => ({ ...e, post: e.post ? clone(e.post) : null })), streak: game.streak, lastPick: game.lastPick, bossDown: game.bossDown, portalLock: game.portalLock
});
function undo() {
  if (!ready() || game.history.size === 0) return;
  Object.assign(game, game.history.pop()); game.hint = []; game.explored = [];
  say("Move undone. Position, items, score and monsters were restored."); audio.play("bump"); hud();
}
const ready = () => Boolean(game?.active && !game.animating && !game.paused);

// ---------- movement and rules ----------
const canEnter = (p) => inBounds(game.grid, p) && !BLOCKED.has(game.grid[p.row][p.col]);                       // monsters
const canPlayerEnter = (p) => inBounds(game.grid, p) && (!BLOCKED.has(game.grid[p.row][p.col]) || (game.grid[p.row][p.col] === C.RDOOR && game.redKey));
function move(dr, dc) {
  if (!ready()) return;
  game.facing = [dr, dc];
  const next = { row: game.player.row + dr, col: game.player.col + dc };
  if (inBounds(game.grid, next) && game.grid[next.row][next.col] === C.SECRET) {      // cracked wall: walk into it to open it
    game.grid[next.row][next.col] = C.OPEN; game.score += POINTS.secret; view.burst(next, "#ffd36e", 14); view.float(next, `+${POINTS.secret}`, "#ffd36e");
    audio.play("secret"); say("A secret passage opens! 🕳️ Something is hidden inside."); unlock("secret"); hud(); return;
  }
  if (inBounds(game.grid, next) && game.grid[next.row][next.col] === C.RDOOR && !game.redKey) { say("Locked! Find the 🔴 red key first."); audio.play("bump"); view.shake(3); return; }
  if (!canPlayerEnter(next)) {
    say(inBounds(game.grid, next) && game.grid[next.row][next.col] === C.GATE ? "The gate is closed. Find the ⚡ switch." : "A wall blocks that way.");
    audio.play("bump"); view.shake(3); return;
  }
  game.history.push(snapshot()); if (game.history.size > 200) game.history.dropOldest();
  if (game.grid[next.row][next.col] !== C.PORTAL) game.portalLock = false;
  game.player = next; game.moves++; game.turn++; game.hint = []; game.explored = []; if (game.grace > 0) game.grace--;
  audio.play("step"); collect(); monstersAct(); checkEnemyHit();
  if (!game.active) return;
  markSeen();
  if (game.grid[game.player.row][game.player.col] === C.EXIT) {
    if (game.hasKey) { finish(true); return; }
    say("The exit is locked. You still need the 🔑 key.");
  }
  hud();
}
function pickup(base, color) {          // coins and gems build a combo when collected quickly
  game.streak = game.turn - game.lastPick <= 6 && game.streak > 0 ? game.streak + 1 : 1; game.lastPick = game.turn;
  const mult = comboMultiplier(game.streak - 1), pts = Math.round(base * mult);
  game.score += pts; game.bestStreak = Math.max(game.bestStreak, game.streak); if (mult >= 3) unlock("combo");
  view.float(game.player, `+${pts}${mult > 1 ? ` ×${mult}` : ""}`, color); return pts;
}
function collect() {
  const p = game.player, code = game.grid[p.row][p.col], clear = () => { game.grid[p.row][p.col] = C.OPEN; };
  switch (code) {
    case C.COIN: clear(); game.got.coins++; pickup(POINTS.coin, "#ffd36e"); view.burst(p, "#ffd36e", 8); audio.play("coin"); say("Coin!"); break;
    case C.GEM: clear(); game.got.gems++; pickup(POINTS.gem, "#7cd9f2"); view.burst(p, "#7cd9f2", 12); audio.play("gem"); say("Gem!"); break;
    case C.KEY: clear(); game.hasKey = true; game.score += POINTS.key; view.burst(p, "#ffd36e", 16); view.float(p, `+${POINTS.key}`, "#ffd36e"); audio.play("key"); say("Key found! The exit is now usable."); break;
    case C.RKEY: clear(); game.redKey = true; game.score += POINTS.rkey; view.burst(p, "#ff6b6b", 16); audio.play("key"); say("Red key! It opens the vault door 🔴."); once("rkey", "Red key: walk into the red door."); break;
    case C.SWITCH: clear(); game.switchOn = true; game.gateOpen = true; game.score += POINTS.switch; game.grid[game.gate.row][game.gate.col] = C.OPEN;
      view.burst(game.gate, "#83e0d0", 16); view.float(p, `+${POINTS.switch}`, "#83e0d0"); view.shake(4); audio.play("switch"); say("Switch on! The gate is open."); break;
    case C.TRAP: clear(); game.streak = 0;
      if (game.shield) { game.shield = false; say("Your shield blocked a trap!"); } else { game.score = Math.max(0, game.score + POINTS.trap); game.secondsLeft = Math.max(1, game.secondsLeft - 5); say("Trap! −10 points and −5 seconds."); view.flash("#ff8a3a"); view.shake(5); }
      view.float(p, "TRAP", "#ff9a6a"); audio.play("trap"); break;
    case C.HEART: clear(); if (game.lives < 5) { game.lives++; say("Extra life! ❤️"); } else { game.score += 15; say("Lives are full: +15 points."); } view.burst(p, "#ff5a6e", 14); audio.play("heart"); break;
    case C.REVEAL: case C.SHIELD: case C.BOOST: { clear(); const t = { [C.REVEAL]: "reveal", [C.SHIELD]: "shield", [C.BOOST]: "boost" }[code]; game.inv[t]++; view.burst(p, "#83e0d0", 10); audio.play("power"); say("Power-up collected. Use it from the buttons below the maze."); break; }
    case C.ROCK: clear(); game.inv.rock++; audio.play("power"); view.burst(p, "#b9bfd0", 8); say("Rock! Face a monster and press Space to throw it."); once("rock", "Press Space to throw rocks and bombs."); break;
    case C.BOMB: clear(); game.inv.bomb++; audio.play("power"); view.burst(p, "#ff9a4d", 10); say("Bomb! It destroys monsters and hurts the boss."); break;
    case C.CHEST: clear(); game.score += POINTS.chest; view.burst(p, "#ffd36e", 24); view.float(p, `+${POINTS.chest}`, "#ffd36e"); audio.play("gem"); say("Treasure chest! +50 points."); break;
    case C.RDOOR: clear(); game.redKey = false; audio.play("door"); view.burst(p, "#ff6b6b", 14); say("The vault door opens! 🔴"); unlock("vault"); break;
    case C.PORTAL:
      if (!game.portalLock) {
        const other = game.portals.find((q) => !same(q, p));
        if (other) { view.burst(p, "#c7a6ff", 14); game.player = clone(other); game.portalLock = true; view.burst(other, "#c7a6ff", 14); audio.play("portal"); say("Portal warp! 🌀"); unlock("portal"); }
      }
      break;
    default:
  }
}

// ---------- monsters ----------
function stepToward(e, target) { const r = bfs(e, target, canEnter); if (r.path.length) { e.row = r.path[0].row; e.col = r.path[0].col; } return r; }
function wander(e) {
  const options = DIRS4.map(([dr, dc]) => ({ row: e.row + dr, col: e.col + dc })).filter(canEnter);
  if (options.length) { const o = options[Math.floor(game.rand() * options.length)]; e.row = o.row; e.col = o.col; }
}
function monstersAct() {   // chaser: slow, chases when close · bat: fast, random · guardian: defends its gem · boss: strong chaser
  const stealth = game.perk.stealth || 0;
  for (const e of game.enemies) {
    if (e.stun > 0) { e.stun--; continue; }
    const every = e.type === "bat" ? 1 : e.type === "chaser" ? ENEMY_EVERY[game.difficulty] : 2;
    if (game.turn % every !== 0) continue;
    if (e.type === "bat") { wander(e); continue; }
    const seen = bfs(e, game.player, canEnter); game.enemyPathLen = seen.length;
    const range = (e.type === "boss" ? 12 : e.type === "guardian" ? 4 : AGGRO[game.difficulty]) - stealth;
    if (seen.found && seen.length > 0 && seen.length <= range && game.grace === 0) { e.row = seen.path[0].row; e.col = seen.path[0].col; }
    else if (e.type === "guardian" && e.post && !same(e, e.post)) stepToward(e, e.post);
    else if (e.type !== "guardian") wander(e);
  }
}
function sendHome(e) { const s = game.spawns[e.id]; e.row = s.row; e.col = s.col; e.stun = 0; }
function checkEnemyHit() {   // runs after EVERY action, so you can't walk through a monster
  if (game.grace > 0) return;
  const e = game.enemies.find((m) => m.stun === 0 && same(m, game.player)); if (!e) return;
  sendHome(e);
  if (game.shield) { game.shield = false; say("Your shield stopped the monster!"); view.burst(game.player, "#7cd9f2", 14); audio.play("power"); return; }
  game.lives--; game.lostLife = true; game.score = Math.max(0, game.score + POINTS.enemy); game.history.clear();
  view.shake(10); view.flash("#ff3b4a"); view.slowmo(500); audio.play("hurt"); view.float(game.player, "-1 ❤️", "#ff7a88");
  if (game.lives <= 0) { game.cause = "monster"; finish(false); return; }
  game.player = clone(game.start); game.enemies.forEach(sendHome); game.grace = 4; game.streak = 0;
  say(`The monster got you! ${game.lives} ${game.lives === 1 ? "life" : "lives"} left. You respawned safely.`);
}
function damage(e, amount) {
  e.hp -= amount; view.float(e, e.hp > 0 ? `-${amount}` : "💥", "#ffb36a"); view.burst(e, "#ff9a4d", 18);
  if (e.hp > 0) { say(`Hit! The ${e.type} has ${e.hp} HP left.`); return; }
  game.enemies = game.enemies.filter((m) => m !== e); progress.kills++;
  const boss = e.type === "boss"; game.score += boss ? POINTS.boss : POINTS.kill; if (boss) { game.bossDown = true; unlock("boss"); view.flash("#ffd36e"); }
  if (game.perk.lifesteal && game.lives < 5) { game.lives++; view.float(game.player, "+1 ❤️", "#ff7a88"); }
  say(boss ? "The boss is defeated! +200 points!" : `Monster destroyed! +${POINTS.kill} points.`); if (progress.kills >= 5) unlock("hunter"); saveProgress();
}
function throwItem(kind) {   // face a direction and press Space: rocks stun, bombs destroy
  if (!ready()) return;
  kind ||= game.inv.rock > 0 ? "rock" : game.inv.bomb > 0 ? "bomb" : null;
  if (!kind || game.inv[kind] < 1) { say("Nothing to throw. Find 🪨 rocks and 💣 bombs."); return; }
  game.history.push(snapshot()); game.inv[kind]--; game.turn++;
  const [dr, dc] = game.facing; let p = clone(game.player), last = clone(p), hit = null;
  for (let i = 0; i < 5; i++) { const n = { row: p.row + dr, col: p.col + dc }; if (!canEnter(n)) break; p = n; last = clone(p); hit = game.enemies.find((m) => same(m, p)); if (hit) break; }
  view.projectile(game.player, last, kind === "rock" ? "🪨" : "💣"); audio.play("throw");
  if (hit) { if (kind === "rock") { hit.stun = 6; say("Rock hit! The monster is stunned."); view.float(hit, "stunned", "#c7bcff"); audio.play("bump"); } else { audio.play("boom"); view.shake(6); damage(hit, 1); } }
  else { say(`The ${kind} landed with no target.`); if (kind === "bomb") { view.burst(last, "#ff9a4d", 14); audio.play("boom"); } }
  monstersAct(); checkEnemyHit(); hud();
}
function usePowerup(type) {
  if (!ready() || game.inv[type] < 1) return;
  game.inv[type]--;
  if (type === "reveal") showHint(true);
  if (type === "shield") { game.shield = true; say("Shield on: it blocks one trap or monster hit."); audio.play("power"); }
  if (type === "boost") { game.secondsLeft += 15; say("+15 seconds!"); audio.play("power"); }
  hud();
}

// ---------- BFS hint ----------
function goal() {
  const find = (code) => { for (let r = 0; r < game.size; r++) for (let c = 0; c < game.size; c++) if (game.grid[r][c] === code) return { row: r, col: c }; return null; };
  if (!game.switchOn) return { pos: find(C.SWITCH), label: "the ⚡ switch (it opens the gate)" };
  if (!game.hasKey) return { pos: find(C.KEY), label: "the 🔑 key (the exit stays locked without it)" };
  return { pos: game.exit, label: "the 🚪 exit" };
}
function showHint(free = false) {
  if (!ready()) return;
  const g = goal(), r = g.pos ? bfs(game.player, g.pos, canPlayerEnter) : { found: false, explored: [], path: [], length: null };
  game.bfsExplored = r.explored.length; game.pathLen = r.length; game.hint = r.path; game.hints++;
  if (!free && !game.perk.freeHint) game.score = Math.max(0, game.score + POINTS.hint);
  say(r.found ? `Shortest route to ${g.label}: ${r.length} moves.` : `BFS found no route to ${g.label}.`); audio.play("power"); hud();
}
async function animateBFS() {
  if (!ready()) return;
  const g = game, info = goal(); g.animating = true; g.hint = []; g.explored = []; hud();
  const r = info.pos ? bfs(g.player, info.pos, canPlayerEnter) : { found: false, explored: [], path: [], length: null };
  for (let i = 0; i < r.explored.length; i++) {
    if (game !== g || !g.active) return;                 // restarted or finished during the animation
    g.explored.push(r.explored[i]); g.bfsExplored = i + 1; if (i % 2 === 0) { $("bfs-explored").textContent = g.bfsExplored; await sleep(18); }
  }
  if (game !== g) return;
  g.animating = false; g.bfsExplored = r.explored.length; g.pathLen = r.length; g.hint = r.path; g.hints++;
  say(r.found ? `BFS explored ${r.explored.length} cells and found a ${r.length}-move path to ${info.label}.` : "BFS found no route."); hud();
}

// ---------- HUD ----------
function tipText() {
  if (progress.tutorialDone || game.level !== 1 || game.daily) return "";
  if (game.moves === 0) return "Tip: walk with the arrow keys or W A S D.";
  if (!game.switchOn) return "Tip: find the ⚡ switch. It opens the 🚧 gate. Stuck? Press Shortest path (−10 points).";
  if (!game.hasKey) return "Tip: now find the 🔑 key. The exit stays locked without it.";
  return "Tip: reach the 🚪 exit. Grab every 🟡 and 💎 first for a bonus. If a monster gets close, run and lose it!";
}
function hud() {
  if (!game) return;
  const left = game.coins - game.got.coins + game.gems - game.got.gems, mult = comboMultiplier(Math.max(0, game.streak - 1));
  $("level-title").textContent = `${game.daily ? "Daily maze" : `Level ${game.level}`} · ${LEVEL_NAMES[game.level - 1]}`;
  $("score").textContent = game.score; $("timer").textContent = `${game.secondsLeft}s`; $("elapsed").textContent = formatTime(game.elapsed); $("moves").textContent = game.moves; $("lab-moves").textContent = game.moves;
  $("lives").textContent = (game.lives <= 0 ? "💀" : game.lives > 6 ? `❤️ ×${game.lives}` : "❤️".repeat(game.lives)) + (game.grace > 0 ? " ✨" : ""); $("combo").textContent = `×${mult}`;
  $("loot").textContent = `${game.got.coins}/${game.coins} · ${game.got.gems}/${game.gems}`;
  $("items").textContent = `🔑${game.hasKey ? 1 : 0} 🔴${game.redKey ? 1 : 0} 🪨${game.inv.rock} 💣${game.inv.bomb}`;
  $("key-status").textContent = game.hasKey ? "Key found" : "Key needed"; $("key-status").classList.toggle("unlocked", game.hasKey);
  $("objective-text").textContent = !game.switchOn ? "Goal: activate the ⚡ switch to open the gate." : !game.hasKey ? "Goal: find the 🔑 key, then reach the exit." : `Goal: reach the 🚪 exit! Loot left: ${left} (collect all for +${POINTS.treasure}).`;
  const tip = tipText(); $("tip").hidden = !tip; $("tip").textContent = tip;
  $("bfs-explored").textContent = game.bfsExplored ?? "—"; $("path-length").textContent = game.pathLen ?? "—"; $("enemy-path-length").textContent = game.enemyPathLen ?? "—"; $("undo-count").textContent = game.history.size;
  const off = !game.active || game.animating || game.paused;
  $("undo-btn").disabled = off || game.history.size === 0; $("hint-btn").disabled = off; $("animate-bfs-btn").disabled = off;
  for (const [id, key] of [["use-reveal-btn", "reveal"], ["use-shield-btn", "shield"], ["use-boost-btn", "boost"], ["throw-rock-btn", "rock"], ["throw-bomb-btn", "bomb"]]) $(id).disabled = off || game.inv[key] < 1;
  $("inventory").textContent = `👁 ${game.inv.reveal}  🛡 ${game.inv.shield}${game.shield ? " (on)" : ""}  ⏱ ${game.inv.boost}`;
}

// ---------- timer, pause, end of game ----------
function stopTimer() { clearInterval(timer); timer = null; }
function startTimer() {
  stopTimer();
  timer = setInterval(() => {
    if (!game?.active || game.paused) return;
    game.elapsed++;
    if (--game.secondsLeft <= 0) { game.secondsLeft = 0; game.cause = "time"; finish(false); } else hud();
  }, 1000);
}
function setPaused(v) {
  if (!game?.active) return; game.paused = v; $("pause-overlay").hidden = !v; $("pause-btn").textContent = v ? "▶ Resume" : "⏸ Pause"; hud();
}
function showBanner(title, sub, cls) { $("result-banner").className = `result-banner ${cls}`; $("banner-title").textContent = title; $("banner-sub").textContent = sub; $("result-banner").hidden = false; }
const unlockedList = () => AVATARS.filter((a) => a[2]()).map((a) => a[0]);
function finish(won) {
  if (!game.active) return;                       // points can never change after the game ends
  game.active = false; game.won = won; stopTimer();
  $("end-panel").hidden = false; $("next-level-btn").hidden = true; $("submit-score-btn").hidden = true; $("pause-overlay").hidden = true;
  if (won) {
    const had = unlockedList(), bonus = game.secondsLeft * POINTS.perSecondLeft; game.score += bonus;
    const allLoot = game.got.coins === game.coins && game.got.gems === game.gems; if (allLoot) game.score += POINTS.treasure;
    const ratio = game.moves / game.optimal; game.stars = ratio <= 2.2 && game.hints === 0 ? 3 : ratio <= 3.5 ? 2 : 1;
    progress.wins++; progress.best = Math.max(progress.best, game.score); if (!game.lostLife) progress.flawless = true; progress.tutorialDone = true;
    if (!game.daily) {
      progress.unlocked = Math.max(progress.unlocked, Math.min(5, game.level + 1));
      const old = progress.levels[game.level] || {}; progress.levels[game.level] = { stars: Math.max(old.stars || 0, game.stars), time: Math.min(old.time || 1e9, game.elapsed), score: Math.max(old.score || 0, game.score) };
    } else { progress.dailyDate = todayUTC(); progress.dailyBest = Math.max(progress.dailyDate === todayUTC() ? progress.dailyBest : 0, game.score); unlock("daily"); }
    saveProgress(); const fresh = unlockedList().filter((a) => !had.includes(a));
    unlock("first-win"); if (!game.lostLife) unlock("untouchable"); if (allLoot) unlock("treasure"); if (game.elapsed < 60) unlock("speed"); if (game.stars === 3) unlock("stars");
    $("end-title").textContent = "You win!";
    $("end-message").textContent = `Score ${game.score} · ${game.moves} moves · finished in ${formatTime(game.elapsed)} · ${game.lives} ❤️ left.` + (allLoot ? ` Treasure bonus +${POINTS.treasure}!` : "") + (fresh.length ? ` New character unlocked: ${fresh.join(" ")}` : "");
    $("star-result").innerHTML = [1, 2, 3].map((n) => `<span class="${n <= game.stars ? "" : "empty"}">★</span>`).join("");
    if (fresh.length) toast(`New character unlocked: ${fresh.join(" ")}`);
    if (!game.daily && game.level < 5) $("next-level-btn").hidden = false;
    showBanner("🏆 YOU WIN!", `Finished in ${formatTime(game.elapsed)} · ${game.score} points`, "win");
    say("You win! You escaped the maze."); audio.play("win"); view.confetti(); view.slowmo(700); submitScore();
  } else {
    const died = game.cause === "monster";
    $("end-title").textContent = died ? "You died" : "Time is up";
    $("end-message").textContent = `You survived ${formatTime(game.elapsed)}, with ${game.got.coins} coins and ${game.got.gems} gems. Try again: the maze is new every time.`;
    $("star-result").textContent = "";
    showBanner(died ? "💀 YOU DIED" : "⏰ TIME'S UP", died ? "A monster took your last life." : "The maze swallowed you.", died ? "died" : "timeup");
    say(died ? "You died." : "Time ran out."); audio.play("die"); view.slowmo(900);
  }
  hud();
}

// ---------- Supabase ----------
async function submitScore() {
  if (!game?.won || game.submitted || submitting) return;      // at most one saved score per completed game
  const name = $("player-name").value.trim(), status = $("end-save"), btn = $("submit-score-btn");
  status.textContent = `Local result only: ${game.score} points (not saved online yet).`; btn.hidden = false;
  if (!NAME_RULE.test(name)) { status.textContent += " Enter a display name (1–30 letters, numbers, space _ . -), then press Submit."; $("player-name").focus(); return; }
  if (!supabase) { status.textContent += " Online scores are unavailable (Supabase is not configured or could not load)."; return; }
  submitting = true; btn.disabled = true;
  try {
    const base = { player_name: name, score: game.score, moves: game.moves, completion_time_seconds: game.elapsed };
    let { error } = await supabase.from("game_scores").insert({ ...base, level: game.level, avatar: progress.avatar, daily: game.daily });
    if (error && /column|schema cache|level|avatar|daily/i.test(error.message || "")) ({ error } = await supabase.from("game_scores").insert(base));   // table not upgraded yet
    if (error) throw error;
    game.submitted = true; btn.hidden = true; status.textContent = "Saved online ✓"; await loadLeaderboard();
  } catch (error) { console.error("Score submission failed:", error); status.textContent = "Could not save your score online. Check your connection and press Submit to retry."; }
  finally { submitting = false; btn.disabled = false; }
}
async function loadLeaderboard() {
  const status = $("leaderboard-status"), list = $("leaderboard"); list.replaceChildren();
  for (const [id, mode] of [["lb-score", "score"], ["lb-time", "time"], ["lb-daily", "daily"]]) $(id).className = `button tiny ${boardMode === mode ? "primary" : "secondary"}`;
  if (!supabase) { status.textContent = "Leaderboard offline: Supabase is not configured. The game still works."; return; }
  status.textContent = "Loading…";
  try {
    const fast = boardMode === "time", cols = "id, player_name, score, moves, completion_time_seconds, created_at, level, avatar, daily";
    const order = (q) => q.order(fast ? "completion_time_seconds" : "score", { ascending: fast }).limit(100);
    let q = supabase.from("game_scores").select(cols);
    if (boardMode === "daily") q = q.eq("daily", true).gte("created_at", `${todayUTC()}T00:00:00Z`);
    let { data, error } = await order(q);
    if (error && /column|schema cache|level|avatar|daily/i.test(error.message || "")) {
      if (boardMode === "daily") { status.textContent = "The daily board needs the database upgrade (run database/upgrade_v3.sql)."; return; }
      ({ data, error } = await order(supabase.from("game_scores").select("id, player_name, score, moves, completion_time_seconds, created_at")));
    }
    if (error) throw error;
    const { sorted, comparisons } = mergeSort(data || [], fast ? compareTimes : compareScores);       // our own merge sort ranks the rows
    $("sort-comparisons").textContent = comparisons; const rows = sorted.slice(0, 10);
    status.textContent = rows.length ? `Top ${rows.length} ${fast ? "fastest runs" : boardMode === "daily" ? "daily scores" : "scores"} from Supabase.` : boardMode === "daily" ? "No daily scores yet today." : "No scores yet. Be the first to escape!";
    const me = $("player-name").value.trim();
    rows.forEach((e, i) => {
      const li = document.createElement("li"), row = document.createElement("div"), name = document.createElement("span"), pts = document.createElement("strong"), info = document.createElement("div");
      row.className = "score-row"; name.textContent = `${["🥇", "🥈", "🥉"][i] || `${i + 1}.`} ${e.avatar || ""} ${e.player_name}`; pts.textContent = fast ? formatTime(e.completion_time_seconds) : `${e.score} pts`;
      info.className = "note"; info.textContent = `${fast ? `${e.score} pts` : `⏱ ${formatTime(e.completion_time_seconds)}`} · ${e.moves} moves${e.level ? ` · level ${e.level}` : ""}`;
      if (me && e.player_name === me) li.classList.add("me");
      row.append(name, pts); li.append(row, info); list.append(li);
    });
  } catch (error) { console.error("Leaderboard load failed:", error); status.textContent = "Could not load online scores. Check the table, RLS policies and your connection."; }
}

// ---------- profile, level map, achievements ----------
function fillSelect(sel, items, current) {      // items: [value, label, unlocked, how to unlock]
  sel.replaceChildren(...items.map(([value, label, ok, how]) => { const o = document.createElement("option"); o.value = value; o.disabled = !ok; o.textContent = ok ? label : `${label} 🔒 ${how}`; return o; }));
  sel.value = current;
}
function renderProfile() {
  $("best-score").textContent = progress.best; $("wins").textContent = progress.wins; $("unlocked-level").textContent = progress.unlocked;
  fillSelect($("avatar-select"), AVATARS.map(([v, l, ok, how]) => [v, `${v} ${l}`, ok(), how]), progress.avatar);
  fillSelect($("theme-select"), THEMES.map(([v, l, n]) => [v, l, n <= progress.unlocked, `clear level ${n - 1}`]), progress.theme);
  $("perk-text").textContent = `Perk: ${(PERKS[progress.avatar] || {}).text || "none"}`; $("walker").textContent = progress.avatar;
  document.body.className = progress.theme === "moonlight" ? "" : `theme-${progress.theme}`;
  const map = $("level-map"); map.replaceChildren();
  for (let n = 1; n <= 5; n++) {
    const b = document.createElement("button"), info = progress.levels[n], ok = n <= progress.unlocked;
    b.className = `level-card${game && !game.daily && game.level === n ? " current" : ""}`; b.disabled = !ok;
    const t = document.createElement("strong"), s = document.createElement("span"), d = document.createElement("small");
    t.textContent = ok ? `Level ${n}` : `🔒 Level ${n}`; s.className = "stars"; s.textContent = "★".repeat(info?.stars || 0) + "☆".repeat(3 - (info?.stars || 0)); d.textContent = info ? `Best ${formatTime(info.time)}` : LEVEL_NAMES[n - 1];
    b.append(t, s, d); b.addEventListener("click", () => newGame(n)); map.append(b);
  }
  const d = document.createElement("button"); d.className = "level-card"; const dt = document.createElement("strong"), ds = document.createElement("small");
  dt.textContent = "📅 Daily maze"; ds.textContent = progress.dailyDate === todayUTC() ? `Today's best ${progress.dailyBest}` : "New every day"; d.append(dt, ds); d.addEventListener("click", startDaily); map.append(d);
  const grid = $("achievements"); grid.replaceChildren();
  for (const [id, icon, name, how] of ACH) {
    const got = progress.achievements.includes(id), card = document.createElement("div"), i = document.createElement("div"), n = document.createElement("strong"), s = document.createElement("small");
    card.className = `achievement${got ? " unlocked" : ""}`; i.className = "badge-icon"; i.textContent = got ? icon : "🔒"; n.textContent = name; s.textContent = got ? "Unlocked!" : how; card.append(i, n, s); grid.append(card);
  }
  $("achievement-count").textContent = `${progress.achievements.length} / ${ACH.length}`;
}
function startDaily() { $("title-screen").hidden = true; audio.unlock(); newGame(2, { daily: true }); }
function play() { $("title-screen").hidden = true; audio.unlock(); if (game) { game.paused = false; hud(); } }

// ---------- input: keyboard, touch, swipe, gamepad ----------
const KEYS = { arrowup: [-1, 0], w: [-1, 0], arrowdown: [1, 0], s: [1, 0], arrowleft: [0, -1], a: [0, -1], arrowright: [0, 1], d: [0, 1] };
function tryMove(dr, dc) { const now = performance.now(); if (now - lastMoveAt < 70) return; lastMoveAt = now; move(dr, dc); }
document.addEventListener("keydown", (e) => {
  if (["INPUT", "TEXTAREA", "SELECT"].includes(e.target?.tagName)) return;
  const k = e.key.toLowerCase();
  if (!$("title-screen").hidden) { if (k === "enter" || k === " ") { e.preventDefault(); play(); } return; }
  if (KEYS[k]) { e.preventDefault(); tryMove(...KEYS[k]); }
  else if (k === " " || k === "f") { e.preventDefault(); throwItem(); }
  else if (k === "escape" || k === "p") { e.preventDefault(); setPaused(!game?.paused); }
  else if (k === "z" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); undo(); }
});
const TOUCH = { up: [-1, 0], down: [1, 0], left: [0, -1], right: [0, 1] };
document.querySelectorAll("[data-move]").forEach((b) => b.addEventListener("click", () => tryMove(...TOUCH[b.dataset.move])));
$("touch-throw").addEventListener("click", () => throwItem());
let touchStart = null;                              // swipe on the maze to move
$("maze").addEventListener("touchstart", (e) => { touchStart = e.touches[0]; }, { passive: true });
$("maze").addEventListener("touchend", (e) => {
  if (!touchStart) return; const t = e.changedTouches[0], dx = t.clientX - touchStart.clientX, dy = t.clientY - touchStart.clientY; touchStart = null;
  if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) return;
  Math.abs(dx) > Math.abs(dy) ? tryMove(0, dx > 0 ? 1 : -1) : tryMove(dy > 0 ? 1 : -1, 0);
}, { passive: true });
let padAt = 0, padBtn = [];
function pollGamepad(now) {
  const pad = navigator.getGamepads?.()[0] || [...(navigator.getGamepads?.() || [])].find(Boolean); if (!pad) return;
  const b = pad.buttons.map((x) => x.pressed), edge = (i) => b[i] && !padBtn[i]; padBtn = b;
  if (edge(0)) throwItem(); if (edge(1)) undo(); if (edge(9)) setPaused(!game?.paused);
  const x = pad.axes[0] || 0, y = pad.axes[1] || 0; if (now - padAt < 140) return;
  let d = null; if (b[12] || y < -0.5) d = [-1, 0]; else if (b[13] || y > 0.5) d = [1, 0]; else if (b[14] || x < -0.5) d = [0, -1]; else if (b[15] || x > 0.5) d = [0, 1];
  if (d) { padAt = now; move(...d); }
}
let lastFrame = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - lastFrame) / 1000); lastFrame = now; pollGamepad(now);
  if (game) view.draw(game, { fogR: fogRadius(), dt, avatar: progress.avatar });
  requestAnimationFrame(frame);
}

// ---------- buttons ----------
const click = (id, fn) => $(id).addEventListener("click", fn);
click("play-btn", play); click("title-daily-btn", startDaily); click("resume-btn", () => setPaused(false)); click("pause-btn", () => setPaused(!game?.paused));
click("hint-btn", () => showHint(false)); click("animate-bfs-btn", animateBFS); click("undo-btn", undo);
click("restart-btn", () => newGame(game?.daily ? 2 : game?.level || 1, { daily: game?.daily }));
click("play-again-btn", () => game?.daily ? newGame(1) : newGame(game?.level || 1));
click("next-level-btn", () => newGame(Math.min(5, game.level + 1)));
click("use-reveal-btn", () => usePowerup("reveal")); click("use-shield-btn", () => usePowerup("shield")); click("use-boost-btn", () => usePowerup("boost"));
click("throw-rock-btn", () => throwItem("rock")); click("throw-bomb-btn", () => throwItem("bomb"));
click("submit-score-btn", submitScore); click("refresh-leaderboard", loadLeaderboard); click("result-banner", () => { $("result-banner").hidden = true; });
for (const [id, mode] of [["lb-score", "score"], ["lb-time", "time"], ["lb-daily", "daily"]]) click(id, () => { boardMode = mode; loadLeaderboard(); });
$("difficulty").addEventListener("change", () => newGame(game?.daily ? 1 : game?.level || 1));
$("avatar-select").addEventListener("change", () => { progress.avatar = $("avatar-select").value; saveProgress(); });
$("theme-select").addEventListener("change", () => { progress.theme = $("theme-select").value; saveProgress(); });
$("sound-btn").addEventListener("click", () => { progress.sfx = !progress.sfx; audio.setSfx(progress.sfx); $("sound-btn").textContent = progress.sfx ? "🔊 Effects" : "🔇 Effects"; $("sound-btn").setAttribute("aria-pressed", String(progress.sfx)); saveProgress(); });
$("music-btn").addEventListener("click", () => { progress.music = !progress.music; audio.setMusic(progress.music); $("music-btn").textContent = progress.music ? "🎵 Music" : "🔇 Music"; $("music-btn").setAttribute("aria-pressed", String(progress.music)); saveProgress(); });
$("volume").addEventListener("input", () => { progress.volume = Number($("volume").value); audio.setVolume(progress.volume / 100); });

// Keep keyboard control working: leave text boxes, buttons and menus after use so arrow keys and Space go to the game.
document.addEventListener("click", (e) => e.target.closest?.("button")?.blur());
$("player-name").addEventListener("keydown", (e) => { if (e.key === "Enter") e.target.blur(); });
for (const id of ["difficulty", "avatar-select", "theme-select"]) $(id).addEventListener("change", (e) => e.target.blur());

audio.setSfx(progress.sfx); audio.setVolume(progress.volume / 100); $("volume").value = progress.volume;
$("sound-btn").textContent = progress.sfx ? "🔊 Effects" : "🔇 Effects"; $("music-btn").textContent = progress.music ? "🎵 Music" : "🔇 Music";
renderProfile(); newGame(1); game.paused = true; hud(); renderProfile(); loadLeaderboard(); requestAnimationFrame(frame);
window.__maze = { get game() { return game; }, get progress() { return progress; }, view };   // handy for debugging in the browser console
