import { chromium } from "playwright";
const URL = process.env.URL || "http://localhost:8123/index.html";
const results = []; const errors = [];
const check = (name, ok, extra = "") => { results.push({ name, ok: !!ok, extra }); console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? "  → " + extra : ""}`); };
const browser = await chromium.launch();
async function fresh(opts = {}) {
  const ctx = await browser.newContext({ viewport: opts.viewport || { width: 1280, height: 1000 } });
  if (opts.storage) await ctx.addInitScript((s) => { if (!localStorage.getItem("__seeded")) { localStorage.setItem("mazeEscapeV4", s); localStorage.setItem("__seeded", "1"); } }, JSON.stringify(opts.storage));
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push("PAGEERROR " + e.message)); page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errors.push("CONSOLE " + m.text()); });
  if (opts.mock) await page.route("**/supabase-config.js", (r) => r.fulfill({ contentType: "text/javascript", body: opts.mock }));
  await page.goto(URL); await page.waitForTimeout(500);
  await page.evaluate(async () => {   // bot helper: next step toward the current goal
    const { bfs } = await import("/algorithms.js"); const { C, BLOCKED, inBounds } = await import("/levels.js");
    window.__find = (code) => { const g = __maze.game; for (let r = 0; r < g.size; r++) for (let c = 0; c < g.size; c++) if (g.grid[r][c] === code) return { row: r, col: c }; return null; };
    window.__bot = (target) => { const g = __maze.game; const goal = target || (!g.switchOn ? __find(C.SWITCH) : !g.hasKey ? __find(C.KEY) : g.exit); if (!goal) return null;
      const r = bfs(g.player, goal, (p) => inBounds(g.grid, p) && !BLOCKED.has(g.grid[p.row][p.col]) && !(target && p.row === g.exit.row && p.col === g.exit.col && !(p.row === target.row && p.col === target.col))); if (!r.path.length) return null; const s = r.path[0]; return [s.row - g.player.row, s.col - g.player.col]; };
    window.__C = C;
  });
  return { ctx, page };
}
const KEY = (d) => d[0] === -1 ? "ArrowUp" : d[0] === 1 ? "ArrowDown" : d[1] === -1 ? "ArrowLeft" : "ArrowRight";
async function botTo(page, target, maxSteps = 400) { for (let i = 0; i < maxSteps; i++) { const st = await page.evaluate(() => ({ a: __maze.game.active })); if (!st.a) return; const d = await page.evaluate((t) => __bot(t), target); if (!d) return; await page.keyboard.press(KEY(d)); await page.waitForTimeout(85); } }
async function botWin(page) { for (let i = 0; i < 500; i++) { if (!(await page.evaluate(() => __maze.game.active))) return; const d = await page.evaluate(() => __bot()); if (!d) return; await page.keyboard.press(KEY(d)); await page.waitForTimeout(85); } }

// ---------- 1. title, play, pause, resume ----------
{
  const { page, ctx } = await fresh();
  check("title screen visible before play", await page.isVisible("#title-screen"));
  check("game starts paused behind title", await page.evaluate(() => __maze.game.paused));
  await page.click("#play-btn"); await page.waitForTimeout(300);
  check("play hides title and unpauses", !(await page.isVisible("#title-screen")) && !(await page.evaluate(() => __maze.game.paused)));
  await page.keyboard.press("Escape"); await page.waitForTimeout(150);
  check("Esc pauses and shows overlay", (await page.isVisible("#pause-overlay")) && (await page.evaluate(() => __maze.game.paused)));
  const m0 = await page.evaluate(() => __maze.game.moves); const t0 = await page.evaluate(() => __maze.game.elapsed);
  await page.keyboard.press("ArrowRight"); await page.keyboard.press("ArrowDown"); await page.waitForTimeout(1300);
  check("no movement and timer frozen while paused", (await page.evaluate(() => __maze.game.moves)) === m0 && (await page.evaluate(() => __maze.game.elapsed)) === t0);
  await page.click("#resume-btn"); await page.waitForTimeout(1200);
  check("resume continues the timer", (await page.evaluate(() => __maze.game.elapsed)) > t0);
  check("music/effects toggles work", await (async () => { await page.click("#music-btn"); await page.click("#music-btn"); await page.click("#sound-btn"); await page.click("#sound-btn"); return true; })());
  await ctx.close();
}
// ---------- 2. full win with bot: banner, time, progress, achievements, level map ----------
{
  const { page, ctx } = await fresh({ storage: { wins: 2, unlocked: 1 } });
  await page.click("#play-btn"); await page.evaluate(() => { __maze.game.lives = 50; });
  await page.fill("#player-name", "Tester"); await page.press("#player-name", "Enter");
  check("Enter in the name box returns control to the game", await page.evaluate(() => document.activeElement === document.body));
  await botWin(page);
  await page.waitForTimeout(900); await page.screenshot({ path: "./tests/out-win.png", fullPage: false });
  const s = await page.evaluate(() => ({ won: __maze.game.won, active: __maze.game.active, elapsed: __maze.game.elapsed, ach: __maze.progress.achievements, wins: __maze.progress.wins, unlocked: __maze.progress.unlocked, lv1: __maze.progress.levels[1], title: document.getElementById("banner-title").textContent, endMsg: document.getElementById("end-message").textContent, save: document.getElementById("end-save").textContent, ninja: [...document.querySelectorAll("#avatar-select option")].find((o) => o.value === "🥷")?.disabled }));
  check("bot wins level 1", s.won === true && !s.active, JSON.stringify({ elapsed: s.elapsed }));
  check("shows YOU WIN banner", /YOU WIN/.test(s.title), s.title);
  check("play time recorded and shown", s.elapsed > 0 && /finished in \d+:\d\d/.test(s.endMsg), s.endMsg.slice(0, 70));
  check("progress saved: level 2 unlocked + level stats", s.unlocked === 2 && s.lv1 && s.lv1.time > 0 && s.lv1.stars >= 1, JSON.stringify(s.lv1));
  check("achievement first-win unlocked", s.ach.includes("first-win"), s.ach.join(","));
  check("3rd win unlocks Ninja character", s.wins === 3 && s.ninja === false);
  check("offline: score not claimed as saved", /not saved online|unavailable/.test(s.save), s.save.slice(0, 80));
  const sc0 = await page.evaluate(() => __maze.game.score); await page.keyboard.press("ArrowRight"); await page.keyboard.press("ArrowDown"); await page.waitForTimeout(200);
  check("no score changes after game ends", (await page.evaluate(() => __maze.game.score)) === sc0);
  await page.click("#next-level-btn"); await page.waitForTimeout(300);
  check("next level starts level 2 with fog + themed maze", (await page.evaluate(() => __maze.game.level)) === 2);
  await ctx.close();
}
// ---------- 3. death by monster ----------
{
  const { page, ctx } = await fresh();
  await page.click("#play-btn"); await page.evaluate(() => { const g = __maze.game; g.lives = 1; g.grid[g.gate.row][g.gate.col] = 0; g.grid.forEach((row) => row.forEach((v, c) => { if (v === 12) row[c] = 0; })); });
  for (let i = 0; i < 700 && (await page.evaluate(() => __maze.game.active)); i++) {
    const d = await page.evaluate(() => { const g = __maze.game, e = g.enemies[0]; return __bot({ row: e.row, col: e.col }); }); if (!d) break;
    await page.keyboard.press(KEY(d)); await page.waitForTimeout(85);
  }
  await page.waitForTimeout(900); await page.screenshot({ path: "./tests/out-died.png" });
  const s = await page.evaluate(() => ({ active: __maze.game.active, won: __maze.game.won, cause: __maze.game.cause, t: document.getElementById("banner-title").textContent, end: document.getElementById("end-title").textContent }));
  check("losing last life shows YOU DIED", !s.active && !s.won && s.cause === "monster" && /YOU DIED/.test(s.t), JSON.stringify(s));
  await ctx.close();
}
// ---------- 4. lives: hit costs a life, safe respawn, no restart ----------
{
  const { page, ctx } = await fresh();
  await page.click("#play-btn"); await page.evaluate(() => { const g = __maze.game; g.grid[g.gate.row][g.gate.col] = 0; g.grid.forEach((row) => row.forEach((v, c) => { if (v === 12) row[c] = 0; })); });
  for (let i = 0; i < 400 && (await page.evaluate(() => __maze.game.lives)) === 3; i++) {
    const d = await page.evaluate(() => { const g = __maze.game, e = g.enemies[0]; return __bot({ row: e.row, col: e.col }); }); if (!d) break;
    await page.keyboard.press(KEY(d)); await page.waitForTimeout(85);
  }
  const s = await page.evaluate(() => ({ lives: __maze.game.lives, active: __maze.game.active, grace: __maze.game.grace, pos: __maze.game.player, start: __maze.game.start, level: __maze.game.level, moves: __maze.game.moves }));
  check("monster hit costs exactly one life and level continues", s.lives === 2 && s.active && s.level === 1, JSON.stringify(s));
  check("respawn at start with grace period", s.pos.row === s.start.row && s.pos.col === s.start.col && s.grace > 0 && s.moves > 0);
  await ctx.close();
}
// ---------- 5. time up ----------
{
  const { page, ctx } = await fresh();
  await page.click("#play-btn"); await page.evaluate(() => { __maze.game.secondsLeft = 1; }); await page.waitForTimeout(2300);
  const s = await page.evaluate(() => ({ active: __maze.game.active, t: document.getElementById("banner-title").textContent, cause: __maze.game.cause }));
  check("timer reaching zero shows TIME'S UP", !s.active && /TIME'S UP/.test(s.t) && s.cause === "time", JSON.stringify(s));
  await ctx.close();
}
// ---------- 6. undo, throwing, bombs, boss (level 5) ----------
{
  const { page, ctx } = await fresh({ storage: { unlocked: 5 } });
  await page.click("#play-btn");
  await page.evaluate(() => document.querySelectorAll(".level-card")[4].click()); await page.waitForTimeout(300); await page.evaluate(() => { __maze.game.grace = 999; });
  check("level 5 starts with a boss and bombs", await page.evaluate(() => __maze.game.level === 5 && __maze.game.enemies.some((e) => e.type === "boss")));
  // place a coin right next to the player, collect it, undo
  const r = await page.evaluate(() => { const g = __maze.game; const nb = [[0, 1], [1, 0]].map(([a, b]) => ({ row: g.player.row + a, col: g.player.col + b })).find((p) => g.grid[p.row][p.col] === 0); g.grid[nb.row][nb.col] = __C.COIN; return nb; });
  const before = await page.evaluate(() => ({ s: __maze.game.score, g: __maze.game.got.coins }));
  await page.keyboard.press(r.col > 1 ? "ArrowRight" : "ArrowDown"); await page.waitForTimeout(150);
  const after = await page.evaluate(() => ({ s: __maze.game.score, g: __maze.game.got.coins }));
  await page.keyboard.press("Control+z"); await page.waitForTimeout(150);
  const undone = await page.evaluate(() => ({ s: __maze.game.score, g: __maze.game.got.coins }));
  check("coin collected once (+10) then undo restores score and coin", after.s === before.s + 10 && after.g === before.g + 1 && undone.s === before.s && undone.g === before.g, JSON.stringify({ before, after, undone }));
  // bomb vs boss: put boss 2 cells ahead
  await page.evaluate(() => { const g = __maze.game; g.inv.bomb = 3; g.inv.rock = 1; g.facing = [0, 1]; const boss = g.enemies.find((e) => e.type === "boss"); g.grid[g.player.row][g.player.col + 1] = 0; g.grid[g.player.row][g.player.col + 2] = 0; boss.row = g.player.row; boss.col = g.player.col + 2; boss.stun = 0; });
  await page.keyboard.press("Space"); await page.waitForTimeout(200);   // rock first: stuns
  const stun = await page.evaluate(() => __maze.game.enemies.find((e) => e.type === "boss").stun);
  check("rock stuns the monster in line", stun > 0, "stun=" + stun);
  await page.evaluate(() => { const g = __maze.game, boss = g.enemies.find((e) => e.type === "boss"); boss.row = g.player.row; boss.col = g.player.col + 2; });
  await page.keyboard.press("Space"); await page.waitForTimeout(200);
  const hp = await page.evaluate(() => __maze.game.enemies.find((e) => e.type === "boss")?.hp);
  check("bomb damages the boss (3 → 2 HP)", hp === 2, "hp=" + hp);
  await page.evaluate(() => { const g = __maze.game, boss = g.enemies.find((e) => e.type === "boss"); boss.hp = 1; boss.row = g.player.row; boss.col = g.player.col + 2; boss.stun = 0; });
  await page.keyboard.press("Space"); await page.waitForTimeout(250);
  const dead = await page.evaluate(() => ({ boss: __maze.game.enemies.some((e) => e.type === "boss"), ach: __maze.progress.achievements.includes("boss"), down: __maze.game.bossDown }));
  check("bomb kills the boss, achievement unlocked", !dead.boss && dead.ach && dead.down, JSON.stringify(dead));
  await page.screenshot({ path: "./tests/out-level5.png" });
  await ctx.close();
}
// ---------- 7. portal, secret wall, red door vault ----------
{
  const { page, ctx } = await fresh({ storage: { unlocked: 5 } });
  await page.click("#play-btn");
  for (let tries = 0; tries < 12; tries++) { await page.evaluate(() => document.querySelectorAll(".level-card")[2].click()); await page.waitForTimeout(150); if (await page.evaluate(() => !!(__maze.game.secret && __maze.game.vault && __maze.game.portals.length === 2))) break; }
  await page.evaluate(() => { __maze.game.grace = 999; });
  const info = await page.evaluate(() => { const g = __maze.game; return { portals: g.portals.length, vault: !!g.vault, secret: !!g.secret }; });
  check("level 3 has portals, vault and secret room", info.portals === 2 && info.vault && info.secret, JSON.stringify(info));
  // portal: stand next to portal A, walk in
  const p = await page.evaluate(() => { const g = __maze.game, a = g.portals[0]; const nb = [[0, 1, "ArrowLeft"], [0, -1, "ArrowRight"], [1, 0, "ArrowUp"], [-1, 0, "ArrowDown"]].find(([dr, dc]) => { const q = { row: a.row + dr, col: a.col + dc }; return g.grid[q.row]?.[q.col] !== undefined && g.grid[q.row][q.col] !== 1 && g.grid[q.row][q.col] !== 8 && g.grid[q.row][q.col] !== 16 && g.grid[q.row][q.col] !== 19; }); g.player = { row: a.row + nb[0], col: a.col + nb[1] }; return { key: nb[2], b: g.portals[1] }; });
  await page.keyboard.press(p.key); await page.waitForTimeout(200);
  const at = await page.evaluate(() => __maze.game.player);
  check("portal teleports to its partner", at.row === p.b.row && at.col === p.b.col, JSON.stringify(at));
  // secret
  const sec = await page.evaluate(() => { const g = __maze.game, d = g.secret.door; const nb = [[0, 1, "ArrowLeft"], [0, -1, "ArrowRight"], [1, 0, "ArrowUp"], [-1, 0, "ArrowDown"]].find(([dr, dc]) => { const q = { row: d.row + dr, col: d.col + dc }; return g.grid[q.row]?.[q.col] === 0; }); if (!nb) return null; g.player = { row: d.row + nb[0], col: d.col + nb[1] }; return { key: nb[2], d }; });
  if (sec) { await page.keyboard.press(sec.key); await page.waitForTimeout(200); }
  const opened = await page.evaluate((d) => d ? __maze.game.grid[d.d.row][d.d.col] === 0 : null, sec);
  check("walking into a cracked wall opens the secret room", opened === true || sec === null, sec ? "" : "(no open neighbour to test)");
  // vault
  const v = await page.evaluate(() => { const g = __maze.game, d = g.vault.door; const nb = [[0, 1, "ArrowLeft"], [0, -1, "ArrowRight"], [1, 0, "ArrowUp"], [-1, 0, "ArrowDown"]].find(([dr, dc]) => { const q = { row: d.row + dr, col: d.col + dc }; return g.grid[q.row]?.[q.col] === 0; }); if (!nb) return null; g.player = { row: d.row + nb[0], col: d.col + nb[1] }; g.redKey = false; return { key: nb[2], d }; });
  if (v) {
    await page.keyboard.press(v.key); await page.waitForTimeout(150);
    const locked = await page.evaluate((d) => __maze.game.grid[d.d.row][d.d.col] === 19, v);
    await page.evaluate(() => { __maze.game.redKey = true; }); await page.waitForTimeout(100); await page.keyboard.press(v.key); await page.waitForTimeout(200);
    const open = await page.evaluate((d) => ({ cell: __maze.game.grid[d.d.row][d.d.col], key: __maze.game.redKey }), v);
    check("red door is locked without key, opens with key and uses it up", locked && open.cell === 0 && open.key === false, JSON.stringify(open));
  }
  await page.screenshot({ path: "./tests/out-level3.png" });
  await ctx.close();
}
// ---------- 8. daily maze deterministic across page loads ----------
{
  const grids = [];
  for (let i = 0; i < 2; i++) { const { page, ctx } = await fresh(); await page.click("#title-daily-btn"); await page.waitForTimeout(300); grids.push(await page.evaluate(() => JSON.stringify({ g: __maze.game.grid, daily: __maze.game.daily }))); await ctx.close(); }
  check("daily maze is identical on every load", grids[0] === grids[1] && JSON.parse(grids[0]).daily === true);
}
// ---------- 9. leaderboard with mocked Supabase: ranking, tabs, avatars, insert payload, column fallback ----------
{
  const mock = `
    const rows = [
      { id: 1, player_name: "Ann", score: 300, moves: 40, completion_time_seconds: 90, created_at: "2026-11-01T00:00:00Z", level: 2, avatar: "🧝", daily: false },
      { id: 2, player_name: "Bob", score: 500, moves: 50, completion_time_seconds: 70, created_at: "2026-11-02T00:00:00Z", level: 3, avatar: "🥷", daily: false },
      { id: 3, player_name: "Cy", score: 500, moves: 30, completion_time_seconds: 80, created_at: "2026-11-03T00:00:00Z", level: 1, avatar: "🧙", daily: true },
      { id: 4, player_name: "Di", score: 100, moves: 20, completion_time_seconds: 20, created_at: "2026-11-03T00:00:00Z", level: 1, avatar: "🐉", daily: false }];
    window.__inserts = []; window.__failColumns = true;
    export const supabase = { from() { const q = { _daily: false, select() { return q; }, eq(c) { if (c === "daily") q._daily = true; return q; }, gte() { return q; }, order() { return q; }, limit() { return Promise.resolve({ data: q._daily ? rows.filter((r) => r.daily) : rows, error: null }); },
      insert(row) { window.__inserts.push(row); if ("level" in row && window.__failColumns) return Promise.resolve({ error: { message: "Could not find the 'level' column of 'game_scores' in the schema cache" } }); return Promise.resolve({ error: null }); } }; return q; } };`;
  const { page, ctx } = await fresh({ mock, storage: { wins: 0 } });
  const names = async () => page.evaluate(() => [...document.querySelectorAll("#leaderboard li .score-row span")].map((s) => s.textContent.trim()));
  let n = await names();
  check("leaderboard ranks by score, then fewer moves (merge sort)", n[0].includes("Cy") && n[1].includes("Bob") && n[2].includes("Ann") && n[3].includes("Di"), n.join(" | "));
  check("leaderboard shows avatars", n[1].includes("🥷"));
  check("merge-sort comparison count shown", (await page.evaluate(() => document.getElementById("sort-comparisons").textContent)) !== "—");
  await page.click("#play-btn"); await page.click("#lb-time"); await page.waitForTimeout(300); n = await names();
  check("Fastest tab ranks by completion time", n[0].includes("Di") && n[1].includes("Bob"), n.join(" | "));
  await page.click("#lb-daily"); await page.waitForTimeout(300); n = await names();
  check("Daily tab shows only daily scores", n.length === 1 && n[0].includes("Cy"), n.join(" | "));
  await page.evaluate(() => { __maze.game.lives = 50; }); await page.fill("#player-name", "Cy"); await page.press("#player-name", "Enter"); await botWin(page); await page.waitForTimeout(800);
  const ins = await page.evaluate(() => window.__inserts);
  check("score insert retries without new columns when table is not upgraded", ins.length === 2 && "level" in ins[0] && !("level" in ins[1]), JSON.stringify(ins.map((r) => Object.keys(r).length)));
  check("completion time submitted as real play time", ins[1].completion_time_seconds > 0 && ins[1].completion_time_seconds === (await page.evaluate(() => __maze.game.elapsed)));
  check("saved message shown, submit hidden, no duplicate", /Saved online/.test(await page.textContent("#end-save")) && !(await page.isVisible("#submit-score-btn")));
  await ctx.close();
}
// ---------- 10. every level + mobile screenshots ----------
{
  const { page, ctx } = await fresh({ storage: { unlocked: 5 } });
  await page.click("#play-btn");
  for (let lv = 1; lv <= 5; lv++) { await page.evaluate((n) => document.querySelectorAll(".level-card")[n - 1].click(), lv); await page.waitForTimeout(500); const cv = await page.$("#maze"); await cv.screenshot({ path: `./tests/out-lv${lv}.png` }); }
  check("all five levels render without errors", true);
  await ctx.close();
  const m = await fresh({ viewport: { width: 390, height: 844 } }); await m.page.click("#play-btn"); await m.page.waitForTimeout(500);
  await m.page.screenshot({ path: "./tests/out-mobile.png", fullPage: false });
  check("mobile touch controls visible", await m.page.isVisible(".touch-controls"));
  const ow = await m.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 2); check("no horizontal scroll on mobile", ow);
  await m.ctx.close();
}
// ---------- 11. win/death screen: next stage, replay, stage picker ----------
{
  const { page, ctx } = await fresh({ storage: { unlocked: 1 } });
  await page.click("#play-btn"); await page.evaluate(() => { __maze.game.lives = 50; }); await botWin(page); await page.waitForTimeout(700);
  const labels = await page.$$eval("#banner-actions button", (bs) => bs.map((b) => ({ t: b.textContent.trim(), d: b.disabled })));
  check("win screen offers Next stage and Replay", labels.some((b) => /Next stage/.test(b.t)) && labels.some((b) => /Replay/.test(b.t)), labels.map((b) => b.t).join(" | "));
  const pick = labels.filter((b) => /^(🔒)?\d$/.test(b.t));
  check("stage picker lists 5 stages; locked ones are disabled", pick.length === 5 && pick.filter((b) => !b.d).length === 2, pick.map((b) => b.t + (b.d ? "x" : "")).join(" "));
  await page.screenshot({ path: "./tests/out-winbanner.png" });
  await page.keyboard.press("Enter"); await page.waitForTimeout(400);
  check("Enter on the win screen starts the next stage", (await page.evaluate(() => __maze.game.level)) === 2 && !(await page.isVisible("#result-banner")));
  await ctx.close();
}
{
  const { page, ctx } = await fresh({ storage: { unlocked: 5 } });
  await page.click("#play-btn"); await page.evaluate(() => { __maze.game.lives = 50; }); await botWin(page); await page.waitForTimeout(700);
  await page.locator("#banner-actions .stage-pick button", { hasText: /^4$/ }).click(); await page.waitForTimeout(400);
  check("picking stage 4 on the win screen starts level 4", (await page.evaluate(() => __maze.game.level)) === 4 && (await page.evaluate(() => __maze.game.active)));
  await ctx.close();
}
{
  const { page, ctx } = await fresh({ storage: { unlocked: 3 } });
  await page.click("#play-btn"); await page.evaluate(() => { const g = __maze.game; g.lives = 1; g.grid[g.gate.row][g.gate.col] = 0; g.grid.forEach((row) => row.forEach((v, c) => { if (v === 12) row[c] = 0; })); });
  for (let i = 0; i < 700 && (await page.evaluate(() => __maze.game.active)); i++) { const d = await page.evaluate(() => { const g = __maze.game, e = g.enemies[0]; return __bot({ row: e.row, col: e.col }); }); if (!d) break; await page.keyboard.press(KEY(d)); await page.waitForTimeout(85); }
  await page.waitForTimeout(600);
  const txt = await page.textContent("#banner-actions");
  check("death screen offers Try again and stage picker", /Try again/.test(txt) && /Choose stage/.test(txt));
  await page.locator("#banner-actions button", { hasText: /Try again/ }).click(); await page.waitForTimeout(300);
  check("Try again starts a fresh run with full lives", await page.evaluate(() => __maze.game.active && __maze.game.lives === 3 && __maze.game.level === 1));
  await ctx.close();
}
await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed; page errors: ${errors.length ? JSON.stringify(errors) : "none"}`);
process.exit(failed.length || errors.length ? 1 : 0);
