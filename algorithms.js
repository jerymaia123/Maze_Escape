// algorithms.js - pure data structures and algorithms (no DOM), so they can be unit-tested with `node tests.mjs`.

// STACK (LIFO - Last In, First Out): the newest item is removed first. Used for Undo.
export class Stack {
  constructor() { this.items = []; }
  push(v) { this.items.push(v); }
  pop() { return this.items.pop(); }
  peek() { return this.items[this.items.length - 1]; }
  dropOldest() { this.items.shift(); }          // keeps memory bounded
  clear() { this.items = []; }
  get size() { return this.items.length; }
}

// QUEUE (FIFO - First In, First Out): the oldest item is removed first. Used by BFS.
// A moving "head" index avoids the slow Array.shift() on every dequeue.
export class Queue {
  constructor() { this.items = []; this.head = 0; }
  enqueue(v) { this.items.push(v); }
  dequeue() { return this.items[this.head++]; }
  get isEmpty() { return this.head >= this.items.length; }
  get size() { return this.items.length - this.head; }
}

export const posKey = (p) => `${p.row},${p.col}`;
const samePos = (a, b) => a.row === b.row && a.col === b.col;
const DIRS = [[-1, 0], [1, 0], [0, -1], [0, 1]];

// BREADTH-FIRST SEARCH on a grid. Every move costs 1, so the first time BFS reaches a
// cell is along a shortest path. canPass(pos) decides if a cell is walkable (walls, closed gates...).
// target = null explores everything reachable. `explored` is in order of distance from start.
// Time O(V + E), auxiliary space O(V).
export function bfs(start, target, canPass) {
  const queue = new Queue();
  queue.enqueue({ row: start.row, col: start.col });
  const parent = new Map([[posKey(start), null]]);    // doubles as the visited set
  const explored = [];
  let found = false;
  while (!queue.isEmpty) {
    const cur = queue.dequeue();
    explored.push(cur);
    if (target && samePos(cur, target)) { found = true; break; }
    for (const [dr, dc] of DIRS) {
      const next = { row: cur.row + dr, col: cur.col + dc };
      const k = posKey(next);
      if (parent.has(k) || !canPass(next)) continue;
      parent.set(k, cur);
      queue.enqueue(next);
    }
  }
  const path = [];                                     // walk parents back from the target
  if (found) {
    let c = target;
    while (c && !samePos(c, start)) { path.push({ row: c.row, col: c.col }); c = parent.get(posKey(c)); }
    path.reverse();
  }
  return { found, path, length: found ? path.length : null, explored };
}

// Ranking rule used everywhere: higher score, then fewer moves, then faster completion time.
export function compareScores(a, b) {
  return (Number(b.score) - Number(a.score)) ||
         (Number(a.moves) - Number(b.moves)) ||
         (Number(a.completion_time_seconds) - Number(b.completion_time_seconds));
}

// Fastest-run ranking for the "Fastest" leaderboard tab: shorter time, then higher score, then fewer moves.
export function compareTimes(a, b) {
  return (Number(a.completion_time_seconds) - Number(b.completion_time_seconds)) ||
         (Number(b.score) - Number(a.score)) || (Number(a.moves) - Number(b.moves));
}

// MERGE SORT (divide and conquer): split in half, sort each half, merge. Stable because on a tie the
// LEFT item is taken first. Returns a new array and counts comparisons made while merging.
// Time O(n log n), auxiliary space O(n).
export function mergeSort(items, compare = compareScores) {
  let comparisons = 0;
  const sort = (list) => {
    if (list.length <= 1) return list.slice();
    const mid = list.length >> 1;
    const left = sort(list.slice(0, mid)), right = sort(list.slice(mid));
    const out = []; let i = 0, j = 0;
    while (i < left.length && j < right.length) {
      comparisons++;
      out.push(compare(left[i], right[j]) <= 0 ? left[i++] : right[j++]);
    }
    while (i < left.length) out.push(left[i++]);
    while (j < right.length) out.push(right[j++]);
    return out;
  };
  const sorted = sort(items);
  return { sorted, comparisons };
}

// ---- helpers added for the upgrade ----
// Seeded random numbers (mulberry32): the same seed always gives the same sequence, which makes the Daily Maze identical for everyone.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
export function hashString(str) {          // turns text such as a date into a seed number (FNV-1a)
  let h = 2166136261 >>> 0;
  for (const ch of str) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; }
  return h >>> 0;
}
// Combo bonus: collecting items quickly builds a streak. 1st-2nd item x1, then x1.5, x2, x2.5 and at most x3.
export function comboMultiplier(streakBefore) { return Math.min(3, 1 + Math.floor(streakBefore / 2) * 0.5); }
