// Run with: node tests.mjs   (prints a table of real results)
import { Stack, Queue, bfs, mergeSort, compareTimes, comboMultiplier, mulberry32, hashString, posKey } from "./algorithms.js";
import { C, buildLevel, inBounds } from "./levels.js";
const rows = [];
const test = (id, feature, input, expected, fn) => {
  let actual, pass;
  try { actual = fn(); pass = JSON.stringify(actual) === JSON.stringify(expected); }
  catch (e) { actual = "ERROR " + e.message; pass = false; }
  rows.push({ id, feature, input, expected: JSON.stringify(expected), actual: JSON.stringify(actual), result: pass ? "PASS" : "FAIL" });
};
const grid = ["#####", "#S..#", "#.#.#", "#..E#", "#####"].map(r => [...r]);
const pass = p => grid[p.row]?.[p.col] !== undefined && grid[p.row][p.col] !== "#";
const e = (score, moves, t) => ({ score, moves, completion_time_seconds: t });

test("T01", "Stack is LIFO (undo)", "push 1,2,3 then pop twice", [3, 2], () => { const s = new Stack(); [1, 2, 3].forEach(v => s.push(v)); return [s.pop(), s.pop()]; });
test("T02", "Queue is FIFO", "enqueue a,b,c then dequeue twice", ["a", "b"], () => { const q = new Queue(); ["a", "b", "c"].forEach(v => q.enqueue(v)); return [q.dequeue(), q.dequeue()]; });
test("T03", "BFS shortest path length", "5x5 grid, S(1,1) to E(3,3)", 4, () => bfs({ row: 1, col: 1 }, { row: 3, col: 3 }, pass).length);
test("T04", "BFS unreachable exit", "wall blocks (2,3) and (3,2)", { found: false, length: null }, () => { const g = grid.map(r => [...r]); g[2][3] = "#"; g[3][2] = "#"; const r = bfs({ row: 1, col: 1 }, { row: 3, col: 3 }, p => g[p.row]?.[p.col] !== undefined && g[p.row][p.col] !== "#"); return { found: r.found, length: r.length }; });
test("T05", "BFS counts explored cells", "same grid as T03 (explored >= path length)", true, () => { const r = bfs({ row: 1, col: 1 }, { row: 3, col: 3 }, pass); return r.explored.length >= r.length; });
test("T06", "Merge sort: score descending", "scores 5,9,1", [9, 5, 1], () => mergeSort([e(5, 1, 1), e(9, 1, 1), e(1, 1, 1)]).sorted.map(x => x.score));
test("T07", "Merge sort tie-break", "same score: moves 30/20, then time 50/40", [[20, 40], [20, 50], [30, 10]], () => mergeSort([e(100, 30, 10), e(100, 20, 50), e(100, 20, 40)]).sorted.map(x => [x.moves, x.completion_time_seconds]));
test("T08", "Merge sort: empty list", "[]", { n: 0, c: 0 }, () => { const r = mergeSort([]); return { n: r.sorted.length, c: r.comparisons }; });
test("T09", "Merge sort: one entry", "[one]", { n: 1, c: 0 }, () => { const r = mergeSort([e(1, 1, 1)]); return { n: r.sorted.length, c: r.comparisons }; });
test("T10", "Merge sort comparison count", "scores 4,3,2,1 (hand-counted: 4)", 4, () => mergeSort([4, 3, 2, 1].map(s => e(s, 1, 1))).comparisons);
test("T11", "Merge sort: duplicates stay stable", "equal entries keep input order", ["a", "b", "c"], () => mergeSort(["a", "b", "c"].map(n => ({ ...e(7, 7, 7), n }))).sorted.map(x => x.n));
test("T12", "Merge sort: larger list matches reference", "500 random entries", true, () => { const a = Array.from({ length: 500 }, () => e(Math.floor(Math.random() * 50), Math.floor(Math.random() * 9), Math.floor(Math.random() * 9))); const mine = mergeSort(a).sorted; const ref = [...a].sort((x, y) => y.score - x.score || x.moves - y.moves || x.completion_time_seconds - y.completion_time_seconds); return mine.every((x, i) => x.score === ref[i].score && x.moves === ref[i].moves && x.completion_time_seconds === ref[i].completion_time_seconds); });
test("T13", "Merge sort does not change its input", "input order unchanged", [1, 2], () => { const a = [e(1, 1, 1), e(2, 1, 1)]; mergeSort(a); return a.map(x => x.score); });
test("T14", "Fastest ranking (merge sort + compareTimes)", "times 90,45,45 with scores 10,5,50", [[45, 50], [45, 5], [90, 10]], () => mergeSort([e(10, 1, 90), e(5, 1, 45), e(50, 1, 45)], compareTimes).sorted.map(x => [x.completion_time_seconds, x.score]));

// ---- new in the upgrade: combo, seeded daily maze, and maze-generation rules (300 random mazes) ----
test("T15", "Combo multiplier", "streak 0..8", [1, 1, 1.5, 1.5, 2, 2, 2.5, 2.5, 3], () => [0, 1, 2, 3, 4, 5, 6, 7, 8].map(comboMultiplier));
test("T16", "Seeded random is repeatable", "same seed twice", true, () => { const a = mulberry32(42), b = mulberry32(42); return [1, 2, 3, 4].every(() => a() === b()); });
test("T17", "Daily maze identical for the same date, different for another", "seed from date text", [true, false], () => { const g = (d) => JSON.stringify(buildLevel(3, "normal", mulberry32(hashString(`maze-${d}`) + 3)).grid); return [g("2026-11-04") === g("2026-11-04"), g("2026-11-04") === g("2026-11-05")]; });
test("T18", "Generated mazes: loot never behind exit, gate blocks, pockets sealed", "300 mazes, every level and difficulty", 0, () => {
  const same = (a, b) => a.row === b.row && a.col === b.col, LOOT = [C.COIN, C.GEM, C.KEY, C.SWITCH, C.HEART, C.REVEAL, C.SHIELD, C.BOOST, C.ROCK, C.BOMB, C.RKEY, C.CHEST, C.PORTAL, C.TRAP];
  let bad = 0;
  for (const diff of ["easy", "normal", "hard"]) for (let level = 1; level <= 5; level++) for (let i = 0; i < 20; i++) {
    const m = buildLevel(level, diff), g = m.grid, open = (p) => inBounds(g, p) && g[p.row][p.col] !== C.WALL, noExit = (p) => open(p) && !same(p, m.exit);
    const reach = new Set(bfs(m.start, null, noExit).explored.map(posKey)), early = new Set(bfs(m.start, null, (p) => open(p) && ![C.GATE, C.RDOOR, C.SECRET].includes(g[p.row][p.col])).explored.map(posKey));
    let ok = true; const at = (code) => { for (let r = 0; r < m.size; r++) for (let c = 0; c < m.size; c++) if (g[r][c] === code) return { row: r, col: c }; };
    for (let r = 0; r < m.size; r++) for (let c = 0; c < m.size; c++) if (LOOT.includes(g[r][c]) && !reach.has(`${r},${c}`)) ok = false;
    for (const code of [C.KEY, C.SWITCH, ...(m.vault ? [C.RKEY] : [])]) if (!early.has(posKey(at(code)))) ok = false;
    if (bfs(m.start, m.exit, (p) => early.has(posKey(p))).found) ok = false;
    for (const v of [m.vault, m.secret]) if (v && v.cells.some((p) => early.has(posKey(p)))) ok = false;
    if (m.spawns.some((s) => bfs(m.start, s, open).length < 8)) ok = false;
    if (!ok) bad++;
  }
  return bad;
});
console.table(rows);
const failed = rows.filter(r => r.result === "FAIL").length;
console.log(failed ? `${failed} test(s) FAILED` : `All ${rows.length} tests passed`);
process.exit(failed ? 1 : 0);
