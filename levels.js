// levels.js - maze generation. Pure code (no DOM) so it can be tested in Node.
import { bfs, posKey } from "./algorithms.js";

// 2D ARRAY cell codes: grid[row][col] holds one of these numbers.
export const C = { OPEN: 0, WALL: 1, COIN: 2, KEY: 3, EXIT: 4, GEM: 5, TRAP: 6, SWITCH: 7, GATE: 8, REVEAL: 9, SHIELD: 10, BOOST: 11,
  HEART: 12, ROCK: 13, BOMB: 14, PORTAL: 15, SECRET: 16, CHEST: 17, RKEY: 18, RDOOR: 19 };
export const BLOCKED = new Set([C.WALL, C.GATE, C.SECRET, C.RDOOR]);   // cells nobody can walk into (until opened)
const same = (a, b) => a.row === b.row && a.col === b.col;
const clone = (p) => ({ row: p.row, col: p.col });
export const inBounds = (g, p) => p.row >= 0 && p.col >= 0 && p.row < g.length && p.col < g.length;
function shuffle(arr, rand) { for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; } return arr; }

export function carveMaze(size, rand) {               // randomized depth-first search
  const g = Array.from({ length: size }, () => Array(size).fill(C.WALL));
  const stack = [{ row: 1, col: 1 }]; g[1][1] = C.OPEN;
  while (stack.length) {
    const cur = stack[stack.length - 1];
    const options = [[-2, 0], [2, 0], [0, -2], [0, 2]].map(([dr, dc]) => ({ row: cur.row + dr, col: cur.col + dc, dr, dc }))
      .filter((n) => n.row > 0 && n.col > 0 && n.row < size - 1 && n.col < size - 1 && g[n.row][n.col] === C.WALL);
    if (!options.length) { stack.pop(); continue; }
    const n = options[Math.floor(rand() * options.length)];
    g[cur.row + n.dr / 2][cur.col + n.dc / 2] = C.OPEN; g[n.row][n.col] = C.OPEN; stack.push({ row: n.row, col: n.col });
  }
  return g;
}
export function braid(g, size, chance, rand) {         // open walls next to dead ends: loops give you escape routes
  for (let r = 1; r < size - 1; r++) for (let c = 1; c < size - 1; c++) {
    if (g[r][c] !== C.OPEN) continue;
    const walls = [[-1, 0], [1, 0], [0, -1], [0, 1]].filter(([dr, dc]) => g[r + dr][c + dc] === C.WALL);
    if (walls.length !== 3 || rand() > chance) continue;
    const options = walls.filter(([dr, dc]) => { const rr = r + dr, cc = c + dc; return rr > 0 && cc > 0 && rr < size - 1 && cc < size - 1 && g[rr + dr]?.[cc + dc] === C.OPEN; });
    if (options.length) { const [dr, dc] = options[Math.floor(rand() * options.length)]; g[r + dr][c + dc] = C.OPEN; }
  }
}

export function buildLevel(level, difficulty, rand = Math.random) {
  for (let attempt = 0; attempt < 120; attempt++) { const made = tryBuild(level, difficulty, attempt < 70, rand); if (made) return made; }
  throw new Error("Could not build a level");
}

function tryBuild(level, difficulty, strict, rand) {
  const size = 11 + level * 2, grid = carveMaze(size, rand);
  braid(grid, size, { easy: 0.8, normal: 0.6, hard: 0.4 }[difficulty], rand);
  const start = { row: 1, col: 1 };
  const notWall = (p) => inBounds(grid, p) && grid[p.row][p.col] !== C.WALL;
  const order = bfs(start, null, notWall).explored, total = order.length;       // every open cell, nearest first
  const without = (c) => bfs(start, null, (p) => notWall(p) && !same(p, c)).explored;
  const safe = (c) => without(c).length === total - 1;                          // removing c disconnects nothing
  // The exit sits at the end of a branch (never in the middle), so no loot can be stranded behind it.
  const exit = shuffle(order.slice(Math.floor(total * 0.7)), rand).find(safe) || order[total - 1];
  const route = bfs(start, exit, notWall).path;
  let gate = null;                                                              // a true chokepoint on the way to the exit
  if (strict) { for (let i = Math.floor(route.length * 0.45); i < route.length - 2 && !gate; i++) if (!bfs(start, exit, (p) => notWall(p) && !same(p, route[i])).found) gate = route[i]; }
  else gate = route[Math.floor(route.length * 0.6)];
  if (!gate) return null;

  const taken = new Set([posKey(start), posKey(exit), posKey(gate)]), onRoute = new Set(route.map(posKey));
  // A "pocket" is a side area whose only entrance is one cell. Used for the red-door vault and the secret room.
  const pocket = (min, max) => {
    for (const c of shuffle(order.slice(10), rand).slice(0, 140)) {
      if (taken.has(posKey(c)) || onRoute.has(posKey(c))) continue;
      const reach = new Set(without(c).map(posKey)), cells = order.filter((p) => !reach.has(posKey(p)) && !same(p, c));
      if (cells.length < min || cells.length > max || cells.some((p) => taken.has(posKey(p)))) continue;
      taken.add(posKey(c)); cells.forEach((p) => taken.add(posKey(p)));
      return { door: clone(c), cells: cells.map(clone) };
    }
    return null;
  };
  const vault = level >= 2 ? pocket(3, 12) : null, secret = level >= 2 ? pocket(1, 8) : null;
  const locked = new Set();
  for (const v of [vault, secret]) if (v) { locked.add(posKey(v.door)); v.cells.forEach((p) => locked.add(posKey(p))); }
  const before = bfs(start, null, (p) => notWall(p) && !same(p, gate) && !locked.has(posKey(p))).explored;   // reachable before the gate
  const all = order.filter((p) => !locked.has(posKey(p)));
  if (before.length < 20) return null;

  grid[exit.row][exit.col] = C.EXIT; grid[gate.row][gate.col] = C.GATE;
  if (vault) grid[vault.door.row][vault.door.col] = C.RDOOR;
  if (secret) grid[secret.door.row][secret.door.col] = C.SECRET;
  const used = new Set(taken);
  const take = (pool, count, code) => {
    const free = pool.filter((p) => !used.has(posKey(p))), out = [];
    while (out.length < count && free.length) { const p = free.splice(Math.floor(rand() * free.length), 1)[0]; used.add(posKey(p)); grid[p.row][p.col] = code; out.push(p); }
    return out;
  };
  const n = before.length;
  if (take(before.slice(Math.floor(n * 0.55)), 1, C.KEY).length !== 1) return null;
  take(before.slice(Math.floor(n * 0.2), Math.floor(n * 0.7)), 1, C.SWITCH);
  if (vault) {
    if (take(before.slice(Math.floor(n * 0.3)), 1, C.RKEY).length !== 1) return null;
    const vc = shuffle(vault.cells.slice(), rand); vc.slice(0, 3).forEach((p) => { grid[p.row][p.col] = C.GEM; }); if (vc[3]) grid[vc[3].row][vc[3].col] = C.HEART;
  }
  if (secret) { const sc = shuffle(secret.cells.slice(), rand); grid[sc[0].row][sc[0].col] = C.CHEST; if (sc[1]) grid[sc[1].row][sc[1].col] = C.COIN; }
  take(all, 5 + level, C.COIN); take(all, 2 + (level >> 1), C.GEM);
  take(all.slice(8), Math.min(2 + level, 6), C.TRAP);
  take(all.slice(8), 1, C.REVEAL); take(all, 1, C.SHIELD); take(all, 1, C.BOOST);
  take(all.slice(8), difficulty === "hard" ? 1 : 2, C.HEART);
  take(all, 3, C.ROCK); take(all.slice(8), level === 5 ? 4 : level >= 3 ? 1 : 0, C.BOMB);
  const portals = [];
  if (level >= 2) {                                                              // portals: a shortcut pair, never on a chokepoint
    const half = Math.floor(before.length / 2);
    const pick = (pool) => shuffle(pool.filter((p) => !used.has(posKey(p))), rand).slice(0, 25).find(safe);
    const a = pick(before.slice(6, half)), b = pick(before.slice(half));
    if (a && b) [a, b].forEach((p) => { used.add(posKey(p)); grid[p.row][p.col] = C.PORTAL; portals.push(clone(p)); });
  }
  // Monsters: chaser (slow, chases when close), bat (fast, random), guardian (stays near a gem), boss (level 5, 3 HP).
  const lv = level, spawns = [], farPool = all.slice(Math.floor(all.length * 0.5));
  const chasers = difficulty === "easy" ? 1 : difficulty === "hard" ? Math.min(3, 1 + (lv >> 1)) : Math.min(2, 1 + ((lv - 1) / 3 | 0));
  const bats = lv < 2 ? 0 : difficulty === "easy" ? (lv >= 3 ? 1 : 0) : difficulty === "hard" ? (lv >= 4 ? 2 : 1) : 1;
  const guards = lv < 3 ? 0 : difficulty === "hard" && lv === 5 ? 2 : 1;
  const add = (type, count, hp = 1, pool = farPool) => { for (const p of take(pool, count, C.OPEN)) spawns.push({ type, row: p.row, col: p.col, hp }); };
  add("chaser", chasers); add("bat", bats);
  const gems = all.slice(Math.floor(all.length * 0.35)).filter((p) => grid[p.row][p.col] === C.GEM);   // guardians only stand on gems far from the start
  for (let i = 0; i < guards && gems.length; i++) { const g = gems.splice(Math.floor(rand() * gems.length), 1)[0]; spawns.push({ type: "guardian", row: g.row, col: g.col, hp: 1, post: clone(g) }); }
  if (lv === 5) add("boss", 1, 3, all.slice(Math.floor(all.length * 0.7)));

  let coins = 0, gemCount = 0;
  for (const row of grid) for (const v of row) { if (v === C.COIN) coins++; if (v === C.GEM) gemCount++; }
  const base = { easy: 160, normal: 125, hard: 95 }[difficulty], factor = { easy: 2.6, normal: 2.1, hard: 1.7 }[difficulty];
  const seconds = Math.max(base - (lv - 1) * 5, Math.ceil(route.length * factor) + 15) + (vault ? 15 : 0) + (lv === 5 ? 25 : 0);
  return { level, size, grid, start, exit, gate, portals, vault, secret, spawns, seconds, coins, gems: gemCount, optimal: route.length, difficulty };
}
