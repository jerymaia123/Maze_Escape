// sprites.js - tiny pixel-art sprites drawn from text maps (8x8). No image files needed.
const make = (rows, pal) => {
  const c = document.createElement("canvas"); c.width = rows[0].length; c.height = rows.length;
  const g = c.getContext("2d");
  rows.forEach((row, y) => [...row].forEach((ch, x) => { if (pal[ch]) { g.fillStyle = pal[ch]; g.fillRect(x, y, 1, 1); } }));
  return c;
};
const HERO = ["..hhhh..", ".hhhhhh.", "..ssss..", "..sese..", ".tttttt.", "stttttts", ".tT..Tt.", ".bb..bb."];
const OGRE = [".gggggg.", "gggggggg", "gwegwegg", "gggggggg", ".gwwwwg.", ".gwgwgg.", "gg.gg.gg", "g......g"];
const KEY = ["..yyy...", ".y...y..", ".y...y..", "..yyy...", "...y....", "...yy...", "...y....", "...yy..."];
const BARS = ["g.g.g.g.", "gggggggg", "g.g.g.g.", "g.g.g.g.", "gggggggg", "g.g.g.g.", "g.g.g.g.", "g.g.g.g."];
const DEFS = {
  slime: [["........", "..mmmm..", ".mmmmmm.", "mmwmmwmm", "mmemmemm", "mmmmmmmm", "mMmmmmMm", ".MM..MM."], { m: "#7ee05a", M: "#3f9a3a", w: "#ffffff", e: "#d22222" }],
  bat: [["........", "b......b", "bb.bb.bb", "bbbbbbbb", ".bbwwbb.", "..bbbb..", "...bb...", "........"], { b: "#8a5fd0", w: "#ffffff" }],
  ogre: [OGRE, { g: "#d8645a", w: "#ffffff", e: "#222222" }],
  boss: [OGRE, { g: "#8e2f52", w: "#ffe9a0", e: "#ff2a2a" }],
  coin: [["..yyyy..", ".ywwyyY.", "ywyyyyyY", "yyyyyyyY", "yyyyyyyY", "yyyyyyyY", ".yyyyY..", "..YYYY.."], { y: "#ffd36e", Y: "#c8902c", w: "#fff3b0" }],
  gem: [["..cccc..", ".cwwcccC", "cwwcccCC", "cccccCCC", ".cccCCC.", "..cCCC..", "...CC...", "........"], { c: "#7cd9f2", C: "#3a9bc0", w: "#ffffff" }],
  key: [KEY, { y: "#ffd36e" }],
  rkey: [KEY, { y: "#ff6b6b" }],
  heart: [[".rr..rr.", "rwrrrrrr", "rrrrrrrr", "rrrrrrrr", ".rrrrrR.", "..rrrR..", "...rR...", "........"], { r: "#ff5a6e", R: "#c0304a", w: "#ffd1d8" }],
  chest: [["........", ".BBBBBB.", "bbbbbbbb", "bbbyybbb", "BBBBBBBB", "bbbbbbbb", "bbbbbbbb", "BBBBBBBB"], { b: "#a8643a", B: "#6b3a22", y: "#ffd36e" }],
  exit: [["..dddd..", ".dDDDDd.", "dDDDDDDd", "dDDDDDDd", "dDDDyDDd", "dDDDDDDd", "dDDDDDDd", "dddddddd"], { d: "#c9a46a", D: "#2b3a4a", y: "#ffd36e" }],
  gate: [BARS, { g: "#9aa3b5" }],
  rdoor: [BARS, { g: "#e0525a" }],
  trap: [["........", "...s....", "..sws.s.", ".s.s.sws", "sws.s.s.", "s.s.sws.", "ssssssss", "........"], { s: "#b9bfd0", w: "#ffffff" }],
  lever: [["......y.", ".....y..", "....y...", "...l....", "..lll...", ".lllll..", "llllllll", "........"], { l: "#8be3cb", y: "#ffd36e" }]
};
const cache = new Map();
export function getSprite(name) {
  if (!cache.has(name)) { const [rows, pal] = DEFS[name]; cache.set(name, make(rows, pal)); }
  return cache.get(name);
}
const HEROES = {   // palette per character: h=hat/hair, s=skin, t=tunic, T=tunic shade, e=eyes, b=boots
  "🧙": { h: "#6a5acd", s: "#f4d2a0", t: "#3b82c4", T: "#2a5f94", e: "#201020", b: "#3a2438" },
  "🧝": { h: "#e8d27a", s: "#f4d2a0", t: "#4caf60", T: "#2f7a40", e: "#201020", b: "#5a3a22" },
  "🐱": { h: "#f0a050", s: "#f7c88a", t: "#f4d9a0", T: "#c9a35e", e: "#201020", b: "#6b3a22" },
  "🤖": { h: "#aab4c4", s: "#d5dbe6", t: "#6f7f99", T: "#4c5a73", e: "#ff4040", b: "#39435a" },
  "🦊": { h: "#e8782a", s: "#f4d2a0", t: "#c85a1a", T: "#8f3d10", e: "#201020", b: "#3a2438" },
  "🥷": { h: "#2a2a35", s: "#f4d2a0", t: "#3a3a4a", T: "#22222c", e: "#ff5a5a", b: "#15151c" },
  "🧛": { h: "#1c1c26", s: "#e8e0e8", t: "#7a1030", T: "#4d0a1f", e: "#ff3030", b: "#1c1c26" },
  "🐉": { h: "#3fae5a", s: "#8fe0a0", t: "#2f8a48", T: "#1f6232", e: "#ffe45a", b: "#1f4a2a" }
};
export function getHero(emoji) {
  const key = `hero:${emoji}`;
  if (!cache.has(key)) cache.set(key, make(HERO, HEROES[emoji] || HEROES["🧙"]));
  return cache.get(key);
}
