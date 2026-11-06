// render.js - canvas drawing: smooth movement, torch light, particles, screen shake, level themes.
import { C } from "./levels.js";
import { getSprite, getHero } from "./sprites.js";

const T = 32;   // tile size in canvas pixels
const THEMES = [   // one look per level
  { floor: "#39233a", floor2: "#33203a", wall: "#79516d", dark: "#5c3b56", top: "#a77c8e", fog: "#120a12" },   // stone dungeon
  { floor: "#1f3550", floor2: "#1b2f48", wall: "#5b86a8", dark: "#3f6485", top: "#9fd0ee", fog: "#0a1220" },   // ice caverns
  { floor: "#3a1c1c", floor2: "#321818", wall: "#7a3a2a", dark: "#55261c", top: "#c56a3d", fog: "#150808" },   // lava temple
  { floor: "#1f3326", floor2: "#1b2e22", wall: "#4a6b3d", dark: "#34502b", top: "#86b060", fog: "#08120b" },   // mossy ruins
  { floor: "#241a3c", floor2: "#201736", wall: "#5a4a99", dark: "#3f3170", top: "#8f7de0", fog: "#0b0716" }    // the void
];
const DARKNESS = [0.3, 0.45, 0.55, 0.6, 0.68];
const EMOJI = { [C.REVEAL]: "👁️", [C.SHIELD]: "🛡️", [C.BOOST]: "⏱️", [C.ROCK]: "🪨", [C.BOMB]: "💣" };
const key = (r, c) => `${r},${c}`;

export function createRenderer(canvas) {
  const ctx = canvas.getContext("2d");
  const S = { game: null, pv: null, vis: new Map(), parts: [], floats: [], proj: [], shakeAmt: 0, flashFx: null, slow: 0, t: 0 };
  const api = {
    reset() { Object.assign(S, { game: null, pv: null, shakeAmt: 0, flashFx: null, slow: 0 }); S.vis.clear(); S.parts.length = 0; S.floats.length = 0; S.proj.length = 0; },
    shake(m) { S.shakeAmt = Math.max(S.shakeAmt, m); },
    flash(color) { S.flashFx = { color, a: 0.45 }; },
    slowmo(ms) { S.slow = ms / 1000; },
    burst(p, color = "#ffd36e", n = 10) {
      const x = (p.col + 0.5) * T, y = (p.row + 0.5) * T;
      for (let i = 0; i < n; i++) { const a = Math.random() * 6.283, s = 40 + Math.random() * 90; S.parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 30, life: 0.5 + Math.random() * 0.3, color, g: 200, size: 3 }); }
    },
    float(p, text, color = "#ffffff") { S.floats.push({ x: (p.col + 0.5) * T, y: p.row * T + 6, text, color, t: 0 }); },
    confetti() {
      const cols = ["#ffd36e", "#83e0d0", "#ef8e9e", "#7cd9f2", "#f5ce79", "#c7bcff"];
      for (let i = 0; i < 140; i++) S.parts.push({ x: Math.random() * canvas.width, y: -10 - Math.random() * 80, vx: (Math.random() - 0.5) * 80, vy: 40 + Math.random() * 80, life: 2.5 + Math.random() * 1.5, color: cols[i % 6], g: 60, size: 4 });
    },
    projectile(a, b, emoji) { S.proj.push({ x0: (a.col + 0.5) * T, y0: (a.row + 0.5) * T, x1: (b.col + 0.5) * T, y1: (b.row + 0.5) * T, t: 0, emoji }); },

    draw(game, o) {
      const size = game.size, W = size * T;
      if (canvas.width !== W) { canvas.width = W; canvas.height = W; }
      if (S.game !== game) { api.reset(); S.game = game; S.pv = { x: game.player.col, y: game.player.row }; }
      const raw = o.dt || 0.016; let dt = raw;
      if (S.slow > 0) { S.slow -= raw; dt = raw * 0.3; }
      S.t += dt; const t = S.t, th = THEMES[game.level - 1] || THEMES[0], R = o.fogR;
      ctx.imageSmoothingEnabled = false;
      ctx.save(); ctx.fillStyle = th.fog; ctx.fillRect(0, 0, W, W);
      if (S.shakeAmt > 0) { ctx.translate((Math.random() - 0.5) * S.shakeAmt, (Math.random() - 0.5) * S.shakeAmt); S.shakeAmt = Math.max(0, S.shakeAmt - raw * 30); }
      const hint = new Set(game.hint.map((p) => key(p.row, p.col))), explored = new Set(game.explored.map((p) => key(p.row, p.col)));
      const cheb = (a, b) => Math.max(Math.abs(a.row - b.row), Math.abs(a.col - b.col));
      const spr = (name, x, y, w = T, h = T) => ctx.drawImage(getSprite(name), x, y, w, h);
      const emoji = (ch, x, y, size = 20) => { ctx.font = `${size}px serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(ch, x + T / 2, y + T / 2 + 1); };

      for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) {
        const x = c * T, y = r * T, code = game.grid[r][c];
        if (R < 99 && !game.seen.has(key(r, c))) continue;                       // unexplored fog stays dark
        if (code === C.WALL || code === C.SECRET) {
          ctx.fillStyle = th.wall; ctx.fillRect(x, y, T, T);
          ctx.fillStyle = th.dark; for (let by = 7; by < T; by += 8) { ctx.fillRect(x, y + by, T, 1); const off = ((by / 8 | 0) % 2) * 8; for (let bx = off + 8; bx < T; bx += 16) ctx.fillRect(x + bx, y + by - 7, 1, 7); }
          ctx.fillStyle = th.top; ctx.fillRect(x, y, T, 2); ctx.fillStyle = th.dark; ctx.fillRect(x, y + T - 3, T, 3);
          if (code === C.SECRET) { ctx.strokeStyle = "#1a0f18"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x + 8, y + 3); ctx.lineTo(x + 14, y + 12); ctx.lineTo(x + 10, y + 18); ctx.lineTo(x + 20, y + 29); ctx.stroke(); }
          continue;
        }
        ctx.fillStyle = (r + c) % 2 ? th.floor : th.floor2; ctx.fillRect(x, y, T, T);
        if ((r * 7 + c * 13) % 5 === 0) { ctx.fillStyle = "#ffffff10"; ctx.fillRect(x + 6 + (r * 3) % 14, y + 8 + (c * 5) % 14, 3, 2); }
        const bob = Math.sin(t * 3 + r * 1.3 + c) * 1.5;
        switch (code) {
          case C.COIN: { const w = Math.abs(Math.cos(t * 3 + r + c)) * T * 0.55 + T * 0.2; spr("coin", x + (T - w) / 2, y + bob + 2, w, T - 4); break; }
          case C.GEM: spr("gem", x + 3, y + 3 + bob, T - 6, T - 6); break;
          case C.KEY: spr("key", x + 2, y + 2 + bob, T - 4, T - 4); break;
          case C.RKEY: spr("rkey", x + 2, y + 2 + bob, T - 4, T - 4); break;
          case C.HEART: { const s = 1 + Math.sin(t * 6) * 0.06; spr("heart", x + T * (1 - s) / 2 + 2, y + T * (1 - s) / 2 + 2, (T - 4) * s, (T - 4) * s); break; }
          case C.CHEST: spr("chest", x + 2, y + 2, T - 4, T - 4); break;
          case C.TRAP: spr("trap", x + 2, y + 2, T - 4, T - 4); break;
          case C.SWITCH: spr("lever", x + 2, y + 2, T - 4, T - 4); break;
          case C.GATE: spr("gate", x, y); break;
          case C.RDOOR: spr("rdoor", x, y); break;
          case C.EXIT: {
            ctx.fillStyle = game.hasKey ? `rgba(131,224,208,${0.25 + Math.sin(t * 4) * 0.1})` : "#00000044"; ctx.fillRect(x, y, T, T);
            spr("exit", x + 1, y + 1, T - 2, T - 2); if (!game.hasKey) { ctx.fillStyle = "#000000aa"; ctx.fillRect(x, y, T, T); emoji("🔒", x, y, 16); } break;
          }
          case C.PORTAL: {
            ctx.save(); ctx.translate(x + T / 2, y + T / 2); ctx.rotate(t * 2);
            for (let i = 0; i < 3; i++) { ctx.strokeStyle = ["#c7a6ff", "#7cd9f2", "#ef8e9e"][i]; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, 5 + i * 4, i, i + 4.2); ctx.stroke(); }
            ctx.restore(); break;
          }
          default: if (EMOJI[code]) emoji(EMOJI[code], x, y + bob, 18);
        }
        const k = key(r, c);
        if (explored.has(k)) { ctx.fillStyle = "#8f7de055"; ctx.fillRect(x, y, T, T); }
        if (hint.has(k)) { ctx.fillStyle = "#83e0d055"; ctx.fillRect(x, y, T, T); ctx.fillStyle = "#c8fff4"; ctx.fillRect(x + T / 2 - 2, y + T / 2 - 2, 4, 4); }
        if (R < 99 && cheb({ row: r, col: c }, game.player) > R) { ctx.fillStyle = "#00000073"; ctx.fillRect(x, y, T, T); }   // remembered but out of sight
      }

      // monsters (smooth movement, bobbing)
      for (const e of game.enemies) {
        if (R < 99 && cheb(e, game.player) > R) continue;
        let v = S.vis.get(e.id); if (!v) { v = { x: e.col, y: e.row }; S.vis.set(e.id, v); }
        const k = 1 - Math.exp(-dt * 14); v.x += (e.col - v.x) * k; v.y += (e.row - v.y) * k;
        const big = e.type === "boss" ? 1.35 : 1, sz = T * big, x = v.x * T - (sz - T) / 2, y = v.y * T - (sz - T) + Math.sin(t * 5 + e.id) * 2;
        const sprite = { chaser: "slime", bat: "bat", guardian: "ogre", boss: "boss" }[e.type];
        ctx.fillStyle = "#00000055"; ctx.beginPath(); ctx.ellipse(v.x * T + T / 2, v.y * T + T - 3, 10 * big, 4, 0, 0, 6.283); ctx.fill();
        ctx.globalAlpha = e.stun > 0 ? 0.55 : 1; spr(sprite, x + 2, y + 2, sz - 4, sz - 4); ctx.globalAlpha = 1;
        if (e.stun > 0) emoji("💫", x, y - 10, 14);
        if (e.type === "boss") { ctx.fillStyle = "#000000aa"; ctx.fillRect(x, y - 8, sz, 6); ctx.fillStyle = "#ff4a5a"; ctx.fillRect(x + 1, y - 7, (sz - 2) * (e.hp / e.maxHp), 4); }
      }

      // player
      const k2 = 1 - Math.exp(-dt * 18), pv = S.pv, dx = game.player.col - pv.x, dy = game.player.row - pv.y;
      if (Math.abs(dx) + Math.abs(dy) > 2.6) { pv.x = game.player.col; pv.y = game.player.row; } else { pv.x += dx * k2; pv.y += dy * k2; }
      const moving = Math.abs(dx) + Math.abs(dy) > 0.05, bounce = moving ? Math.abs(Math.sin(t * 18)) * 3 : Math.sin(t * 3) * 0.8;
      const px = pv.x * T, py = pv.y * T;
      ctx.fillStyle = "#00000066"; ctx.beginPath(); ctx.ellipse(px + T / 2, py + T - 3, 10, 4, 0, 0, 6.283); ctx.fill();
      if (!(game.grace > 0 && Math.floor(t * 10) % 2)) {
        ctx.save(); if (game.facing[1] < 0) { ctx.translate(px + T, 0); ctx.scale(-1, 1); ctx.drawImage(getHero(o.avatar), 0, py + 2 - bounce, T - 2, T - 2); } else ctx.drawImage(getHero(o.avatar), px + 1, py + 2 - bounce, T - 2, T - 2);
        ctx.restore();
      }
      if (game.shield) { ctx.strokeStyle = `rgba(124,217,242,${0.6 + Math.sin(t * 8) * 0.3})`; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(px + T / 2, py + T / 2, 15, 0, 6.283); ctx.stroke(); }
      ctx.restore();

      // torch light: dark everywhere except a flickering warm circle around the hero
      ctx.save(); const cx = (pv.x + 0.5) * T, cy = (pv.y + 0.5) * T, fl = 1 + Math.sin(t * 9) * 0.03 + Math.sin(t * 23) * 0.02;
      const inner = T * 2.4 * fl, outer = T * (R < 99 ? Math.min(R + 1, 7.5) : 8) * fl;
      const g = ctx.createRadialGradient(cx, cy, inner, cx, cy, outer); g.addColorStop(0, "rgba(8,4,12,0)"); g.addColorStop(1, `rgba(8,4,12,${DARKNESS[game.level - 1] || 0.5})`);
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, W);
      ctx.globalCompositeOperation = "lighter"; const w = ctx.createRadialGradient(cx, cy, 0, cx, cy, outer * 0.8); w.addColorStop(0, "rgba(255,170,80,0.16)"); w.addColorStop(1, "rgba(255,170,80,0)");
      ctx.fillStyle = w; ctx.fillRect(0, 0, W, W); ctx.restore();

      // projectiles, particles, floating text, flash
      for (let i = S.proj.length - 1; i >= 0; i--) {
        const p = S.proj[i]; p.t += raw * 5; const f = Math.min(1, p.t);
        ctx.font = "18px serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(p.emoji, p.x0 + (p.x1 - p.x0) * f, p.y0 + (p.y1 - p.y0) * f - Math.sin(f * 3.14) * 8);
        if (p.t >= 1) S.proj.splice(i, 1);
      }
      for (let i = S.parts.length - 1; i >= 0; i--) {
        const p = S.parts[i]; p.life -= dt; p.vy += p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt;
        if (p.life <= 0 || p.y > W + 20) { S.parts.splice(i, 1); continue; }
        ctx.globalAlpha = Math.min(1, p.life * 2); ctx.fillStyle = p.color; ctx.fillRect(p.x, p.y, p.size, p.size); ctx.globalAlpha = 1;
      }
      for (let i = S.floats.length - 1; i >= 0; i--) {
        const f = S.floats[i]; f.t += raw; if (f.t > 1.1) { S.floats.splice(i, 1); continue; }
        ctx.globalAlpha = 1 - f.t / 1.1; ctx.font = "bold 13px monospace"; ctx.textAlign = "center"; ctx.lineWidth = 3; ctx.strokeStyle = "#140b12"; ctx.strokeText(f.text, f.x, f.y - f.t * 24); ctx.fillStyle = f.color; ctx.fillText(f.text, f.x, f.y - f.t * 24); ctx.globalAlpha = 1;
      }
      if (S.flashFx) { ctx.globalAlpha = S.flashFx.a; ctx.fillStyle = S.flashFx.color; ctx.fillRect(0, 0, W, W); ctx.globalAlpha = 1; S.flashFx.a -= raw * 1.2; if (S.flashFx.a <= 0) S.flashFx = null; }
    }
  };
  return api;
}
