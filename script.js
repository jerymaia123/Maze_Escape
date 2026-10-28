import { supabase } from "./supabase-config.js";

const $ = (id) => document.getElementById(id);
const START = { row: 1, col: 1 };
const LEVEL_NAMES = ["The First Steps", "Crystal Caverns", "Shadow Crossing", "The Lost Temple", "The Final Escape"];
const ACHIEVEMENTS = [
  { id: "first-win", icon: "🏁", name: "First Escape", desc: "Finish your first maze." },
  { id: "no-hints", icon: "🧠", name: "No Hints", desc: "Win without asking for a hint." },
  { id: "speedrunner", icon: "⚡", name: "Speed Runner", desc: "Finish with 30+ seconds left." },
  { id: "three-stars", icon: "🌟", name: "Perfect Route", desc: "Earn three stars." },
  { id: "gem-hunter", icon: "💎", name: "Gem Hunter", desc: "Collect every gem in a maze." },
  { id: "daily", icon: "📅", name: "Daily Adventurer", desc: "Complete the daily maze." },
  { id: "switch-master", icon: "🔌", name: "Switch Master", desc: "Activate the gate switch." },
  { id: "treasure-hunter", icon: "🧰", name: "Treasure Hunter", desc: "Find a hidden treasure chest." }
];
const STORAGE_KEY = "mazeEscapeProgressV2";
const $maze = $("maze");
let timerInterval = null;
let game = null;
let mergeComparisons = 0;
let soundEnabled = false;
let audioContext = null;
let musicInterval = null;
let musicIndex = 0;

// Stack (LIFO): Undo restores a complete turn snapshot.
class Stack {
  constructor() { this.items = []; }
  push(value) { this.items.push(value); }
  pop() { return this.items.pop(); }
  clear() { this.items = []; }
  get size() { return this.items.length; }
}
// Queue (FIFO): BFS visits cells in increasing distance from the start.
class Queue {
  constructor() { this.items = []; this.head = 0; }
  enqueue(value) { this.items.push(value); }
  dequeue() { return this.items[this.head++]; }
  get isEmpty() { return this.head >= this.items.length; }
}

function loadProgress() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    return {
      unlockedLevel: Math.max(1, Math.min(5, Number(saved.unlockedLevel) || 1)),
      bestScore: Number(saved.bestScore) || 0,
      wins: Number(saved.wins) || 0,
      achievements: Array.isArray(saved.achievements) ? saved.achievements : [],
      dailyDate: saved.dailyDate || "",
      dailyBest: Number(saved.dailyBest) || 0,
      theme: ["moonlight", "emerald", "sunset", "cyber"].includes(saved.theme) ? saved.theme : "moonlight",
      avatar: ["🧙", "🐱", "🤖", "🦊", "🧝", "🧑‍🚀"].includes(saved.avatar) ? saved.avatar : "🧙"
    };
  } catch { return { unlockedLevel: 1, bestScore: 0, wins: 0, achievements: [], dailyDate: "", dailyBest: 0, theme: "moonlight", avatar: "🧙" }; }
}
let progress = loadProgress();
let leaderboardMode = "all";
function saveProgress() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(progress)); } catch { /* local storage may be unavailable */ }
  renderProfile();
  renderAchievements();
}
function keyOf(p) { return `${p.row},${p.col}`; }
function parseKey(key) { const [row, col] = key.split(",").map(Number); return { row, col }; }
function samePos(a, b) { return a.row === b.row && a.col === b.col; }
function clonePos(p) { return { row: p.row, col: p.col }; }
function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
function dateStamp() { return new Date().toISOString().slice(0, 10); }

function seededRandom(seed) {
  let state = (seed >>> 0) || 1;
  return () => {
    state ^= state << 13; state ^= state >>> 17; state ^= state << 5;
    return (state >>> 0) / 4294967296;
  };
}
function generateMaze(size, seed) {
  const random = seed == null ? Math.random : seededRandom(seed);
  const grid = Array.from({ length: size }, () => Array(size).fill(1));
  const stack = [{ ...START }];
  grid[START.row][START.col] = 0;
  const directions = [[-2, 0], [2, 0], [0, -2], [0, 2]];
  while (stack.length) {
    const current = stack[stack.length - 1];
    const options = directions.map(([dr, dc]) => ({ row: current.row + dr, col: current.col + dc, dr, dc }))
      .filter(n => n.row > 0 && n.row < size - 1 && n.col > 0 && n.col < size - 1 && grid[n.row][n.col] === 1);
    if (!options.length) { stack.pop(); continue; }
    const next = options[Math.floor(random() * options.length)];
    grid[current.row + next.dr / 2][current.col + next.dc / 2] = 0;
    grid[next.row][next.col] = 0;
    stack.push({ row: next.row, col: next.col });
  }
  // Turn parts of the narrow maze into larger dungeon chambers. Because this only
  // changes walls into floor, the original maze routes stay connected and solvable.
  const roomCells = new Set();
  const roomCenters = [];
  for (let r = 2; r < size - 2; r += 5) {
    for (let c = 2; c < size - 2; c += 5) roomCenters.push({ row: r, col: c });
  }
  for (const center of roomCenters) {
    for (let r = center.row - 1; r <= center.row + 1; r++) {
      for (let c = center.col - 1; c <= center.col + 1; c++) {
        if (r > 0 && c > 0 && r < size - 1 && c < size - 1) {
          grid[r][c] = 0;
          roomCells.add(`${r},${c}`);
        }
      }
    }
  }
  return { grid, random, roomCells, roomCenters };
}
function findRawPath(grid, start, target) {
  const queue = new Queue(); queue.enqueue(clonePos(start));
  const parents = new Map(); const visited = new Set([keyOf(start)]);
  const dirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];
  while (!queue.isEmpty) {
    const current = queue.dequeue();
    if (samePos(current, target)) break;
    for (const [dr, dc] of dirs) {
      const next = { row: current.row + dr, col: current.col + dc };
      if (next.row < 0 || next.col < 0 || next.row >= grid.length || next.col >= grid.length || grid[next.row][next.col] === 1) continue;
      const key = keyOf(next); if (visited.has(key)) continue;
      visited.add(key); parents.set(key, current); queue.enqueue(next);
    }
  }
  const result = []; let cursor = clonePos(target);
  if (!visited.has(keyOf(target))) return [];
  while (!samePos(cursor, start)) { result.push(cursor); cursor = parents.get(keyOf(cursor)); if (!cursor) return []; }
  result.reverse(); return result;
}
function pickCells(candidates, count, random) {
  const pool = [...candidates]; const chosen = [];
  while (pool.length && chosen.length < count) chosen.push(pool.splice(Math.floor(random() * pool.length), 1)[0]);
  return chosen;
}
function createLevel(level, seed, difficulty, daily) {
  const size = 11 + level * 2;
  const { grid, random, roomCells, roomCenters } = generateMaze(size, seed);
  const start = { ...START }, exit = { row: size - 2, col: size - 2 };
  const mainPath = findRawPath(grid, start, exit);
  // The switch, key and gate sit on the main route, so the puzzle is always solvable.
  const switchPos = clonePos(mainPath[Math.max(1, Math.floor(mainPath.length * .28) - 1)]);
  const keyPos = clonePos(mainPath[Math.max(2, Math.floor(mainPath.length * .48) - 1)]);
  const gatePos = clonePos(mainPath[Math.min(mainPath.length - 2, Math.floor(mainPath.length * .73) - 1)]);
  const reserved = new Set([keyOf(start), keyOf(exit), keyOf(switchPos), keyOf(keyPos), keyOf(gatePos)]);
  const allOpen = [];
  for (let r = 1; r < size - 1; r++) for (let c = 1; c < size - 1; c++) {
    const p = { row: r, col: c };
    if (grid[r][c] === 0 && !reserved.has(keyOf(p))) allOpen.push(p);
  }
  const coins = new Set(pickCells(allOpen, Math.min(5 + level, Math.floor(allOpen.length / 5)), random).map(keyOf));
  let used = new Set([...reserved, ...coins]);
  const remaining = allOpen.filter(p => !used.has(keyOf(p)));
  const gems = new Set(pickCells(remaining, Math.min(2 + Math.floor(level / 2), 4), random).map(keyOf));
  used = new Set([...used, ...gems]);
  const traps = new Set(pickCells(allOpen.filter(p => !used.has(keyOf(p))), Math.min(2 + level, 6), random).map(keyOf));
  used = new Set([...used, ...traps]);
  const powerupCells = pickCells(allOpen.filter(p => !used.has(keyOf(p))), 3, random);
  const powerups = new Map();
  ["reveal", "shield", "boost"].forEach((type, i) => { if (powerupCells[i]) powerups.set(keyOf(powerupCells[i]), type); });
  used = new Set([...used, ...powerupCells.map(keyOf)]);
  const portals = pickCells(allOpen.filter(p => !used.has(keyOf(p))), 2, random);
  used = new Set([...used, ...portals.map(keyOf)]);
  const chestCells = pickCells(allOpen.filter(p => !used.has(keyOf(p))), Math.min(1 + Math.floor(level / 3), 2), random);
  const chests = new Set(chestCells.map(keyOf));
  used = new Set([...used, ...chests]);
  const baseEnemySpawns = pickCells(allOpen.filter(p => !used.has(keyOf(p))), difficulty === "easy" ? 1 : difficulty === "hard" ? Math.min(3, 1 + Math.floor(level / 2)) : Math.min(2, 1 + Math.floor((level - 1) / 3)), random);
  const secretCandidates = [];
  for (let r = 1; r < size - 1; r++) for (let c = 1; c < size - 1; c++) {
    if (grid[r][c] !== 1) continue;
    const neighbors = [[-1,0],[1,0],[0,-1],[0,1]].filter(([dr,dc]) => grid[r+dr][c+dc] === 0).length;
    if (neighbors >= 2) secretCandidates.push({ row: r, col: c });
  }
  const secretPassages = new Set(pickCells(secretCandidates, 1, random).map(keyOf));
  const baseSeconds = difficulty === "easy" ? 160 : difficulty === "hard" ? 95 : 125;
  const seconds = Math.max(baseSeconds - (level - 1) * 8, Math.ceil(mainPath.length * (difficulty === "easy" ? 2.1 : difficulty === "hard" ? 1.25 : 1.55)));
  return {
    level, size, grid, roomCells, roomCenters, start, exit, switchPos, keyPos, gatePos, coins, gems, traps, powerups, chests, secretPassages,
    portals, enemySpawns: baseEnemySpawns.map(clonePos), seconds, daily, optimalMoves: mainPath.length,
    randomSeed: seed ?? null
  };
}

function createState(level, options = {}) {
  const difficulty = options.difficulty || $("difficulty").value || "normal";
  const map = createLevel(level, options.seed ?? null, difficulty, Boolean(options.daily));
  return {
    ...map, player: clonePos(map.start), score: 0, moves: 0, secondsLeft: map.seconds,
    coinsCollected: new Set(), gemsCollected: new Set(), chestsCollected: new Set(), powerupsCollected: new Set(), trapsTriggered: new Set(), lootStreak: 0,
    hasKey: false, switchActive: false, gateOpen: false, shieldActive: false, inventory: { reveal: 0, shield: 0, boost: 0 },
    enemies: map.enemySpawns.map(clonePos), history: new Stack(), hintPath: [], exploredCells: [],
    bfsExplored: null, pathLength: null, enemyPathLength: null, active: true, animating: false,
    hintsUsed: 0, scoreSubmitted: false, startedAt: Date.now(), movesSinceEnemy: 0, stars: 0
  };
}
function snapshotState() {
  return {
    player: clonePos(game.player), score: game.score, moves: game.moves, secondsLeft: game.secondsLeft,
    coinsCollected: [...game.coinsCollected], gemsCollected: [...game.gemsCollected], chestsCollected: [...game.chestsCollected], powerupsCollected: [...game.powerupsCollected], lootStreak: game.lootStreak,
    trapsTriggered: [...game.trapsTriggered], hasKey: game.hasKey, switchActive: game.switchActive, gateOpen: game.gateOpen, shieldActive: game.shieldActive,
    inventory: { ...game.inventory }, enemies: game.enemies.map(clonePos), hintsUsed: game.hintsUsed
  };
}
function restoreSnapshot(s) {
  game.player = clonePos(s.player); game.score = s.score; game.moves = s.moves; game.secondsLeft = s.secondsLeft;
  game.coinsCollected = new Set(s.coinsCollected); game.gemsCollected = new Set(s.gemsCollected); game.chestsCollected = new Set(s.chestsCollected || []); game.powerupsCollected = new Set(s.powerupsCollected); game.lootStreak = s.lootStreak || 0;
  game.trapsTriggered = new Set(s.trapsTriggered); game.hasKey = s.hasKey; game.switchActive = s.switchActive; game.gateOpen = s.gateOpen; game.shieldActive = Boolean(s.shieldActive);
  game.inventory = { ...s.inventory }; game.enemies = s.enemies.map(clonePos); game.hintsUsed = s.hintsUsed;
  game.hintPath = []; game.exploredCells = []; render(); showMessage("↶ Move undone. Your position, items, score and enemy positions were restored.");
}
function specialAt(p) {
  const k = keyOf(p);
  if (samePos(p, game.exit)) return "exit";
  if (samePos(p, game.switchPos)) return "switch";
  if (samePos(p, game.keyPos)) return "key";
  if (samePos(p, game.gatePos)) return "gate";
  if (game.portals.some(portal => keyOf(portal) === k)) return "portal";
  if (game.traps.has(k) && !game.trapsTriggered.has(k)) return "trap";
  if (game.coins.has(k) && !game.coinsCollected.has(k)) return "coin";
  if (game.gems.has(k) && !game.gemsCollected.has(k)) return "gem";
  if (game.powerups.has(k) && !game.powerupsCollected.has(k)) return "powerup";
  if (game.chests.has(k) && !game.chestsCollected.has(k)) return "chest";
  if (game.secretPassages.has(k) && game.hasKey) return "secret";
  return "path";
}
function render() {
  if (!game) return;
  $maze.innerHTML = ""; $maze.style.setProperty("--maze-size", game.size);
  const hintSet = new Set(game.hintPath.map(keyOf)); const explored = new Set(game.exploredCells.map(keyOf));
  for (let r = 0; r < game.size; r++) for (let c = 0; c < game.size; c++) {
    const p = { row: r, col: c }; const cell = document.createElement("div"); cell.className = "cell"; cell.setAttribute("role", "gridcell");
    const k = keyOf(p); const isEnemy = game.enemies.some(e => samePos(e, p));
    if (game.roomCells?.has(k) && game.grid[r][c] === 0) cell.classList.add("room-floor");
    if (game.grid[r][c] === 1 && !(game.secretPassages.has(k) && game.hasKey)) { cell.classList.add("wall"); cell.textContent = game.secretPassages.has(k) ? "❔" : ""; cell.setAttribute("aria-label", game.secretPassages.has(k) ? "Mysterious wall" : "Wall"); }
    else if (samePos(game.player, p)) { cell.classList.add("player"); cell.textContent = progress.avatar || "🧙"; cell.setAttribute("aria-label", "Player"); }
    else if (isEnemy) { cell.classList.add("enemy"); cell.textContent = "👾"; cell.setAttribute("aria-label", "Enemy"); }
    else if (hintSet.has(k)) { cell.classList.add("hint"); cell.textContent = "·"; cell.setAttribute("aria-label", "Shortest path"); }
    else if (explored.has(k)) { cell.classList.add("explored"); cell.textContent = "·"; cell.setAttribute("aria-label", "BFS explored cell"); }
    else {
      const type = specialAt(p);
      const visuals = {
        path: ["path", ""], coin: ["coin", "🟡"], gem: ["gem", "💎"], chest: ["gem", "🧰"], secret: ["portal", "🕳️"], key: [game.hasKey ? "path" : "key", game.hasKey ? "" : "🔑"],
        switch: ["switch", game.switchActive ? "✅" : "⚡"], gate: [game.gateOpen ? "path" : "gate", game.gateOpen ? "" : "🚧"],
        exit: ["exit", game.hasKey && game.gateOpen ? "🚪" : "🔒"], trap: ["trap", "🕸️"], portal: ["portal", "🌀"], powerup: ["powerup", ({ reveal: "👁️", shield: "🛡️", boost: "⏱️" })[game.powerups.get(k)]]
      };
      const [cls, icon] = visuals[type] || visuals.path; cell.classList.add(cls); cell.textContent = icon; cell.setAttribute("aria-label", type);
    }
    if (game.hintPath.length && hintSet.has(k)) cell.classList.add("path-final");
    $maze.appendChild(cell);
  }
  $("score").textContent = game.score; $("timer").textContent = `${game.secondsLeft}s`;
  $("loot").textContent = `${game.coinsCollected.size}/${game.coins.size} • ${game.gemsCollected.size}/${game.gems.size}`;
  $("moves").textContent = game.moves; $("key-status").textContent = game.hasKey ? (game.gateOpen ? "🔓 Exit unlocked" : "🔑 Key found") : "🔒 Key needed";
  $("key-status").classList.toggle("unlocked", game.hasKey && game.gateOpen);
  $("bfs-explored").textContent = game.bfsExplored ?? "—"; $("path-length").textContent = game.pathLength ?? "—";
  $("undo-count").textContent = game.history.size; $("enemy-path-length").textContent = game.enemyPathLength ?? "—";
  $("undo-btn").disabled = !game.active || game.history.size === 0 || game.animating;
  $("hint-btn").disabled = !game.active || game.animating; $("animate-bfs-btn").disabled = !game.active || game.animating;
  $("use-reveal-btn").disabled = !game.active || game.inventory.reveal < 1 || game.animating;
  $("use-shield-btn").disabled = !game.active || game.inventory.shield < 1 || game.animating;
  $("use-boost-btn").disabled = !game.active || game.inventory.boost < 1 || game.animating;
  const inv = game.inventory; $("inventory").textContent = `👁 ${inv.reveal}  🛡 ${inv.shield}${game.shieldActive ? " (active)" : ""}  ⏱ ${inv.boost}`;
  $("level-title").textContent = `${game.daily ? "Daily Challenge" : `Level ${game.level}`} · ${game.daily ? dateStamp() : LEVEL_NAMES[game.level - 1]}`;
  $("objective-text").textContent = !game.switchActive ? "First activate the switch ⚡ to open the gate." : !game.hasKey ? "The gate is open! Find the key 🔑, then reach the exit." : "You have the key. Find the exit 🚪!";
}
function showMessage(message) { $("game-message").textContent = message; }
function toast(message) {
  const existing = document.querySelector(".toast"); if (existing) existing.remove();
  const node = document.createElement("div"); node.className = "toast"; node.textContent = message; document.body.appendChild(node); setTimeout(() => node.remove(), 2300);
}
function playTone(freq = 520, duration = .07) {
  if (!soundEnabled) return;
  try {
    audioContext ||= new (window.AudioContext || window.webkitAudioContext)();
    const osc = audioContext.createOscillator(); const gain = audioContext.createGain();
    osc.frequency.value = freq; osc.type = "sine"; gain.gain.value = .04;
    osc.connect(gain); gain.connect(audioContext.destination); osc.start(); osc.stop(audioContext.currentTime + duration);
  } catch { /* sound is optional */ }
}
function startBackgroundMusic() {
  if (musicInterval !== null) clearInterval(musicInterval);
  const notes = [262, 330, 392, 330, 294, 349, 440, 349]; musicIndex = 0;
  musicInterval = setInterval(() => { if (!soundEnabled) return; playTone(notes[musicIndex % notes.length], .12); musicIndex++; }, 650);
}
function stopBackgroundMusic() { if (musicInterval !== null) clearInterval(musicInterval); musicInterval = null; }
function canEnter(p) {
  if (p.row < 0 || p.col < 0 || p.row >= game.size || p.col >= game.size) return false;
  if (game.grid[p.row][p.col] === 1 && !(game.secretPassages.has(keyOf(p)) && game.hasKey)) return false;
  if (samePos(p, game.gatePos) && !game.gateOpen) return false;
  return true;
}
function getPathResult(start, target) {
  const queue = new Queue(); queue.enqueue(clonePos(start)); const startKey = keyOf(start);
  const visited = new Set([startKey]); const parents = new Map(); const explored = [];
  const dirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];
  while (!queue.isEmpty) {
    const current = queue.dequeue(); explored.push(current);
    if (samePos(current, target)) break;
    for (const [dr, dc] of dirs) {
      const next = { row: current.row + dr, col: current.col + dc }; if (!canEnter(next)) continue;
      const k = keyOf(next); if (visited.has(k)) continue; visited.add(k); parents.set(k, current); queue.enqueue(next);
    }
  }
  if (!visited.has(keyOf(target))) return { path: [], explored, length: null };
  const path = []; let cursor = clonePos(target);
  while (!samePos(cursor, start)) { path.push(cursor); cursor = parents.get(keyOf(cursor)); if (!cursor) return { path: [], explored, length: null }; }
  path.reverse(); return { path, explored, length: path.length };
}
function currentTarget() { return !game.switchActive ? game.switchPos : !game.hasKey ? game.keyPos : game.exit; }
function showHint() {
  if (!game?.active || game.animating) return;
  const result = getPathResult(game.player, currentTarget()); game.bfsExplored = result.explored.length; game.pathLength = result.length;
  game.hintPath = result.path; game.hintsUsed++; render();
  showMessage(result.length == null ? "BFS could not find a route to the current objective." : `BFS found a shortest route of ${result.length} move(s). Follow the blue path!`);
  playTone(650);
}
async function animateBFS() {
  if (!game?.active || game.animating) return;
  game.animating = true; game.hintPath = []; game.exploredCells = []; game.bfsExplored = 0; render();
  const result = getPathResult(game.player, currentTarget());
  for (let i = 0; i < result.explored.length; i++) {
    if (!game?.active) return;
    game.exploredCells.push(result.explored[i]); game.bfsExplored = i + 1;
    if (i % 2 === 0 || i === result.explored.length - 1) { render(); await sleep(18); }
  }
  game.pathLength = result.length; game.hintPath = result.path; game.animating = false; render();
  showMessage(result.length == null ? "BFS could not find a route." : `BFS explored ${result.explored.length} cells and found a ${result.length}-move shortest path.`);
  playTone(780);
}
function pushHistory() { game.history.push(snapshotState()); if (game.history.size > 200) game.history.items.shift(); }
function undoMove() {
  if (!game?.active || game.history.size === 0 || game.animating) return;
  restoreSnapshot(game.history.pop()); playTone(360);
}
function activateSwitch() {
  if (game.switchActive) return;
  game.switchActive = true; game.gateOpen = true; game.score += 15;
  unlockAchievement("switch-master"); showMessage("Switch activated! 🚧 The gate is open. +15 points."); playTone(720);
}
function collectAtPlayer() {
  const p = game.player; const k = keyOf(p);
  if (samePos(p, game.switchPos)) activateSwitch();
  if (samePos(p, game.keyPos) && !game.hasKey) { game.hasKey = true; game.score += 30; showMessage("Key collected! +30 points. Some mysterious walls may now hide shortcuts."); playTone(880); }
  if (game.coins.has(k) && !game.coinsCollected.has(k)) { game.coinsCollected.add(k); game.lootStreak++; const bonus = Math.min(10, game.lootStreak * 2); game.score += 10 + bonus; showMessage(`Coin collected! +${10 + bonus} points (loot combo x${game.lootStreak}).`); playTone(590); }
  if (game.gems.has(k) && !game.gemsCollected.has(k)) { game.gemsCollected.add(k); game.lootStreak++; const bonus = Math.min(10, game.lootStreak * 2); game.score += 25 + bonus; showMessage(`Rare gem collected! +${25 + bonus} points (loot combo x${game.lootStreak}).`); playTone(990); }
  if (game.chests.has(k) && !game.chestsCollected.has(k)) { game.chestsCollected.add(k); game.score += 50; unlockAchievement("treasure-hunter"); showMessage("Treasure chest found! +50 points. Look for a ❔ wall—your key can open a secret shortcut."); toast("Treasure chest +50!"); playTone(1050); }
  if (game.traps.has(k) && !game.trapsTriggered.has(k)) {
    game.trapsTriggered.add(k); game.lootStreak = 0;
    if (game.shieldActive) { game.shieldActive = false; showMessage("Your active shield blocked a trap! 🛡️"); }
    else { game.score = Math.max(0, game.score - 10); game.secondsLeft = Math.max(1, game.secondsLeft - 5); showMessage("Trap! −10 points and −5 seconds. Watch your step!"); }
    playTone(180);
  }
  if (game.powerups.has(k) && !game.powerupsCollected.has(k)) {
    const type = game.powerups.get(k); game.powerupsCollected.add(k); game.inventory[type]++;
    const labels = { reveal: "Reveal", shield: "Shield", boost: "Time boost" };
    showMessage(`Power-up collected: ${labels[type]}! Use it when you need it.`); toast(`${labels[type]} power-up collected!`); playTone(760);
  }
  if (game.portals.some(portal => keyOf(portal) === k)) {
    const other = game.portals.find(portal => keyOf(portal) !== k);
    if (other) { game.player = clonePos(other); showMessage("Portal warp! 🌀 You were transported across the maze."); playTone(430); }
  }
}
function enemyStep() {
  if (!game.enemies.length) return;
  game.enemies = game.enemies.map((enemy, index) => {
    const result = getPathResult(enemy, game.player); game.enemyPathLength = result.length;
    if (result.path.length) return clonePos(result.path[0]);
    return enemy;
  });
  for (let i = 0; i < game.enemies.length; i++) {
    if (!samePos(game.enemies[i], game.player)) continue;
    if (game.shieldActive) {
      game.shieldActive = false; game.enemies[i] = clonePos(game.enemySpawns[i] || game.start);
      showMessage("Your shield protected you from an enemy! 🛡️");
    } else {
      game.score = Math.max(0, game.score - 15); game.secondsLeft = Math.max(1, game.secondsLeft - 8);
      game.player = clonePos(game.start); game.enemies[i] = clonePos(game.enemySpawns[i] || game.start);
      showMessage("Caught by an enemy! −15 points, −8 seconds. You returned to the start.");
    }
    playTone(150);
  }
}
function movePlayer(dr, dc) {
  if (!game?.active || game.animating) return;
  const next = { row: game.player.row + dr, col: game.player.col + dc };
  if (!canEnter(next)) { showMessage(samePos(next, game.gatePos) && !game.gateOpen ? "The gate is closed. Find and activate the switch ⚡." : "A wall blocks that route."); playTone(210); return; }
  pushHistory(); game.player = next; game.moves++; game.hintPath = []; game.exploredCells = [];
  collectAtPlayer();
  if (game.moves % 2 === 0) enemyStep();
  render();
  if (samePos(game.player, game.exit)) {
    if (!game.switchActive || !game.gateOpen) showMessage("The gate is still closed. Activate the switch first.");
    else if (!game.hasKey) showMessage("The exit is locked. Find the key 🔑 first.");
    else { winGame(); return; }
  }
  playTone(420);
}
function usePowerup(type) {
  if (!game?.active || game.inventory[type] < 1) return;
  if (type === "reveal") { game.inventory.reveal--; showHint(); showMessage("Reveal used! Follow the highlighted shortest path."); }
  if (type === "shield") { game.inventory.shield--; game.shieldActive = true; showMessage("Shield active! It will block one trap or enemy hit."); toast("Shield activated!"); playTone(720); }
  if (type === "boost") { game.inventory.boost--; game.secondsLeft += 15; showMessage("Time boost used! +15 seconds."); toast("+15 seconds!"); playTone(880); }
  render();
}

function mergeSortScores(items) {
  let comparisons = 0;
  const compare = (a, b) => { comparisons++; if (Number(b.score) !== Number(a.score)) return Number(b.score) - Number(a.score); if (Number(a.moves) !== Number(b.moves)) return Number(a.moves) - Number(b.moves); return new Date(a.created_at).getTime() - new Date(b.created_at).getTime(); };
  function sort(list) {
    if (list.length <= 1) return list;
    const mid = Math.floor(list.length / 2), left = sort(list.slice(0, mid)), right = sort(list.slice(mid)), out = [];
    let i = 0, j = 0; while (i < left.length && j < right.length) out.push(compare(left[i], right[j]) <= 0 ? left[i++] : right[j++]);
    return out.concat(left.slice(i), right.slice(j));
  }
  const result = sort(items); mergeComparisons = comparisons; $("sort-comparisons").textContent = comparisons; return result;
}
async function loadLeaderboard() {
  $("leaderboard-status").textContent = "Loading leaderboard…"; $("leaderboard").innerHTML = "";
  try {
    let query = supabase.from("game_scores").select("id, player_name, score, moves, completion_time_seconds, created_at");
    if (leaderboardMode === "week") { const now = new Date(); const day = (now.getUTCDay() + 6) % 7; const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - day)); query = query.gte("created_at", start.toISOString()); }
    const { data, error } = await query.limit(100);
    if (error) throw error;
    const ranked = mergeSortScores(data || []).slice(0, 10);
    if (!ranked.length) { $("leaderboard-status").textContent = "No scores yet. Be the first to escape!"; return; }
    $("leaderboard-status").textContent = `Loaded ${ranked.length} ${leaderboardMode === "week" ? "this-week " : ""}score(s) from Supabase.`;
    ranked.forEach((entry, index) => {
      const li = document.createElement("li"), row = document.createElement("div"), name = document.createElement("span"), score = document.createElement("strong"), details = document.createElement("div");
      row.className = "score-row"; name.textContent = `${index + 1}. ${entry.player_name}`; score.textContent = `${entry.score} pts`; row.append(name, score); details.className = "small-note"; details.textContent = `${entry.moves} moves • ${entry.completion_time_seconds}s`; li.append(row, details); $("leaderboard").appendChild(li);
    });
  } catch (error) { console.error("Leaderboard load failed:", error); $("leaderboard-status").textContent = "Could not load online scores. Check the SQL table, RLS policies, and connection."; }
}
function applyTheme() {
  document.body.classList.remove("theme-emerald", "theme-sunset", "theme-cyber");
  if (progress.theme && progress.theme !== "moonlight") document.body.classList.add(`theme-${progress.theme}`);
}
function renderProfile() {
  $("best-score").textContent = progress.bestScore; $("wins").textContent = progress.wins; $("unlocked-level").textContent = progress.unlockedLevel;
  const select = $("level-select"); [...select.options].forEach(option => { const level = Number(option.value); option.disabled = level > progress.unlockedLevel; option.textContent = level > progress.unlockedLevel ? `Level ${level} 🔒` : `Level ${level}${level === progress.unlockedLevel ? " ✓" : ""}`; });
  const avatarSelect = $("avatar-select"); [...avatarSelect.options].forEach(option => { const required = Number(option.dataset.level || 1); option.disabled = required > progress.unlockedLevel; if (option.disabled && !option.textContent.includes("🔒")) option.textContent += " 🔒"; else if (!option.disabled) option.textContent = option.textContent.replace(" 🔒", ""); });
  const themeSelect = $("theme-select"); [...themeSelect.options].forEach(option => { const required = Number(option.dataset.level || 1); option.disabled = required > progress.unlockedLevel; if (option.disabled && !option.textContent.includes("🔒")) option.textContent += " 🔒"; else if (!option.disabled) option.textContent = option.textContent.replace(" 🔒", ""); });
  avatarSelect.value = progress.avatar || "🧙"; themeSelect.value = progress.theme || "moonlight"; applyTheme();
}
function renderAchievements() {
  $("achievements").innerHTML = "";
  ACHIEVEMENTS.forEach(a => { const unlocked = progress.achievements.includes(a.id); const card = document.createElement("div"); card.className = `achievement${unlocked ? " unlocked" : ""}`; const icon = document.createElement("div"), name = document.createElement("strong"), desc = document.createElement("small"); icon.className = "badge-icon"; icon.textContent = unlocked ? a.icon : "🔒"; name.textContent = a.name; desc.textContent = unlocked ? "Unlocked!" : a.desc; card.append(icon, name, desc); $("achievements").appendChild(card); });
  $("achievement-count").textContent = `${progress.achievements.length} / ${ACHIEVEMENTS.length}`;
}
function unlockAchievement(id) {
  if (!progress.achievements.includes(id)) { progress.achievements.push(id); const item = ACHIEVEMENTS.find(a => a.id === id); if (item) toast(`Achievement unlocked: ${item.name}!`); saveProgress(); }
}
function stopTimer() { if (timerInterval !== null) clearInterval(timerInterval); timerInterval = null; }
function finishGame(won) {
  if (!game.active) return;
  game.active = false; stopTimer(); $("end-panel").hidden = false; $("next-level-btn").hidden = true;
  $("end-title").textContent = won ? "🎉 Maze escaped!" : "⏰ Time is up!";
  if (won) {
    const timeBonus = game.secondsLeft * 2; game.score += timeBonus;
    const ratio = game.moves / Math.max(1, game.optimalMoves);
    game.stars = ratio <= 1.3 && game.hintsUsed === 0 ? 3 : ratio <= 1.8 ? 2 : 1;
    $("end-message").textContent = `Final score: ${game.score} points • ${game.moves} moves • +${timeBonus} time bonus.`;
    $("star-result").innerHTML = [1, 2, 3].map(n => `<span class="${n <= game.stars ? "" : "empty"}">★</span>`).join("");
    progress.wins++; progress.bestScore = Math.max(progress.bestScore, game.score); progress.unlockedLevel = Math.max(progress.unlockedLevel, Math.min(5, game.level + 1));
    if (game.daily) { progress.dailyDate = dateStamp(); progress.dailyBest = Math.max(progress.dailyBest, game.score); unlockAchievement("daily"); }
    unlockAchievement("first-win"); if (!game.hintsUsed) unlockAchievement("no-hints"); if (game.secondsLeft >= 30) unlockAchievement("speedrunner");
    if (game.stars === 3) unlockAchievement("three-stars"); if (game.gemsCollected.size === game.gems.size && game.gems.size > 0) unlockAchievement("gem-hunter");
    saveProgress(); renderProfile(); if (!game.daily && game.level < 5) $("next-level-btn").hidden = false;
    submitScoreOnce();
  } else {
    $("end-message").textContent = `You collected ${game.coinsCollected.size} coins and ${game.gemsCollected.size} gems. Try again with a new route or use a power-up.`;
    $("star-result").textContent = "Keep going — every attempt teaches you the maze.";
  }
  render();
}
function winGame() { finishGame(true); showMessage("Victory! You found the key, opened the gate, and escaped!"); playTone(1000, .18); }
async function submitScoreOnce() {
  if (game.scoreSubmitted) return; game.scoreSubmitted = true;
  const playerName = $("player-name").value.trim();
  if (!playerName || playerName.length > 30) { $("leaderboard-status").textContent = "Enter a display name before your next run to submit scores."; return; }
  const payload = { player_name: playerName, score: game.score, moves: game.moves, completion_time_seconds: Math.max(0, game.seconds - game.secondsLeft) };
  try { const { error } = await supabase.from("game_scores").insert(payload); if (error) throw error; $("leaderboard-status").textContent = "Victory! Your score was submitted."; await loadLeaderboard(); }
  catch (error) { console.error("Score submission failed:", error); $("leaderboard-status").textContent = "You won, but your score could not be saved. Check the Supabase SQL setup and RLS policy."; }
}
function startTimer() {
  stopTimer(); timerInterval = setInterval(() => {
    if (!game?.active) return;
    game.secondsLeft--;
    if (game.secondsLeft <= 0) { game.secondsLeft = 0; render(); finishGame(false); showMessage("Time ran out! Restart or try an easier difficulty."); }
    else render();
  }, 1000);
}
function startGame(options = {}) {
  stopTimer(); const level = Math.max(1, Math.min(5, Number(options.level || $("level-select").value || 1)));
  game = createState(level, { ...options, difficulty: options.daily ? "normal" : $("difficulty").value });
  $("end-panel").hidden = true; $("star-result").textContent = ""; showMessage(options.daily ? "Daily maze started! The layout is the same for everyone today." : "Activate the switch, collect the key, then reach the exit.");
  render(); startTimer();
}
function restartGame() { startGame({ level: game?.level || Number($("level-select").value) || 1 }); }
function startDaily() {
  const stamp = dateStamp(); let seed = 0; for (const ch of stamp) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0;
  $("level-select").value = "1"; startGame({ level: 1, seed, daily: true });
}

document.addEventListener("keydown", event => {
  if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLSelectElement) return;
  const key = event.key.toLowerCase(); const moves = { arrowup: [-1, 0], w: [-1, 0], arrowdown: [1, 0], s: [1, 0], arrowleft: [0, -1], a: [0, -1], arrowright: [0, 1], d: [0, 1] };
  if (moves[key]) { event.preventDefault(); movePlayer(...moves[key]); }
  if (key === "z" && (event.ctrlKey || event.metaKey)) { event.preventDefault(); undoMove(); }
});
document.querySelectorAll("[data-move]").forEach(button => button.addEventListener("click", () => { const directions = { up: [-1, 0], down: [1, 0], left: [0, -1], right: [0, 1] }; movePlayer(...directions[button.dataset.move]); }));
$("hint-btn").addEventListener("click", showHint);
$("animate-bfs-btn").addEventListener("click", animateBFS);
$("undo-btn").addEventListener("click", undoMove);
$("restart-btn").addEventListener("click", restartGame);
$("play-again-btn").addEventListener("click", restartGame);
$("next-level-btn").addEventListener("click", () => { const next = Math.min(5, game.level + 1); $("level-select").value = String(next); startGame({ level: next }); });
$("daily-btn").addEventListener("click", startDaily);
$("level-select").addEventListener("change", () => startGame({ level: Number($("level-select").value) }));
$("difficulty").addEventListener("change", () => startGame({ level: Number($("level-select").value) }));
$("use-reveal-btn").addEventListener("click", () => { if (game.inventory.reveal > 0) { game.inventory.reveal--; showHint(); } });
$("use-shield-btn").addEventListener("click", () => usePowerup("shield"));
$("use-boost-btn").addEventListener("click", () => usePowerup("boost"));
$("refresh-leaderboard").addEventListener("click", loadLeaderboard);
$("leaderboard-mode-btn").addEventListener("click", () => { leaderboardMode = leaderboardMode === "all" ? "week" : "all"; $("leaderboard-mode-btn").textContent = leaderboardMode === "all" ? "This week" : "All time"; loadLeaderboard(); });
$("avatar-select").addEventListener("change", () => { progress.avatar = $("avatar-select").value; saveProgress(); if (game) render(); });
$("theme-select").addEventListener("change", () => { progress.theme = $("theme-select").value; saveProgress(); toast("Maze theme updated!"); });
$("sound-btn").addEventListener("click", () => { soundEnabled = !soundEnabled; $("sound-btn").textContent = soundEnabled ? "🔊 Sound & music on" : "🔇 Sound off"; $("sound-btn").setAttribute("aria-pressed", String(soundEnabled)); if (soundEnabled) { startBackgroundMusic(); playTone(600); } else stopBackgroundMusic(); });

renderProfile(); renderAchievements(); startGame({ level: 1 }); loadLeaderboard();
