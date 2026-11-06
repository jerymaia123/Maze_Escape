// audio.js - tiny synthesized sound effects and a looping chiptune melody (no audio files needed).
export function createAudio() {
  let ctx = null, master = null, sfxOn = true, musicOn = true, volume = 0.5, timer = null, step = 0;
  const AC = typeof window !== "undefined" && (window.AudioContext || window.webkitAudioContext);
  function ensure() {
    if (!AC) return false;
    try {
      if (!ctx) { ctx = new AC(); master = ctx.createGain(); master.gain.value = volume; master.connect(ctx.destination); }
      if (ctx.state === "suspended") ctx.resume();
      return true;
    } catch { return false; }
  }
  function tone(freq, dur = 0.08, type = "square", gain = 0.06, delay = 0, slide = 0) {
    if (!ensure()) return;
    try {
      const t = ctx.currentTime + delay, o = ctx.createOscillator(), g = ctx.createGain();
      o.type = type; o.frequency.setValueAtTime(freq, t); if (slide) o.frequency.linearRampToValueAtTime(slide, t + dur);
      g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.02);
    } catch { /* sound is optional */ }
  }
  const seq = (notes, type, gain) => notes.forEach(([f, d, at]) => tone(f, d, type, gain, at));
  const SFX = {
    step: () => tone(150 + Math.random() * 30, 0.04, "triangle", 0.04),
    bump: () => tone(110, 0.08, "square", 0.05),
    coin: () => seq([[988, 0.07, 0], [1319, 0.12, 0.06]], "square", 0.05),
    gem: () => seq([[1175, 0.07, 0], [1568, 0.07, 0.06], [1976, 0.14, 0.12]], "square", 0.05),
    key: () => seq([[660, 0.08, 0], [880, 0.08, 0.08], [1320, 0.16, 0.16]], "triangle", 0.07),
    heart: () => seq([[523, 0.1, 0], [659, 0.1, 0.1], [784, 0.18, 0.2]], "triangle", 0.07),
    power: () => seq([[440, 0.08, 0], [660, 0.12, 0.08]], "square", 0.05),
    switch: () => seq([[300, 0.06, 0], [600, 0.12, 0.06]], "sawtooth", 0.05),
    hurt: () => tone(300, 0.35, "sawtooth", 0.09, 0, 70),
    trap: () => tone(180, 0.2, "sawtooth", 0.07, 0, 90),
    die: () => seq([[392, 0.2, 0], [330, 0.2, 0.2], [262, 0.2, 0.4], [196, 0.5, 0.6]], "sawtooth", 0.08),
    win: () => seq([[523, 0.12, 0], [659, 0.12, 0.12], [784, 0.12, 0.24], [1047, 0.4, 0.36]], "square", 0.07),
    throw: () => tone(500, 0.12, "square", 0.05, 0, 900),
    boom: () => tone(120, 0.4, "sawtooth", 0.1, 0, 30),
    portal: () => seq([[400, 0.1, 0], [800, 0.1, 0.08], [1200, 0.14, 0.16]], "sine", 0.07),
    secret: () => seq([[330, 0.1, 0], [440, 0.1, 0.1], [587, 0.2, 0.2]], "triangle", 0.07),
    door: () => seq([[200, 0.1, 0], [300, 0.15, 0.1]], "square", 0.06)
  };
  const bass = [131, 131, 165, 131, 147, 147, 175, 147], lead = [523, 0, 659, 784, 0, 659, 587, 0, 523, 0, 659, 784, 880, 784, 659, 0];
  const stopMusic = () => { clearInterval(timer); timer = null; };
  function startMusic() {
    stopMusic(); if (!ensure()) return;
    timer = setInterval(() => {
      if (!musicOn) return;
      if (step % 2 === 0) tone(bass[(step / 2 | 0) % bass.length], 0.22, "triangle", 0.05);
      const l = lead[step % lead.length]; if (l) tone(l, 0.14, "square", 0.025); step++;
    }, 190);
  }
  return {
    play(name) { if (sfxOn) SFX[name]?.(); },
    setSfx(v) { sfxOn = v; },
    setMusic(v) { musicOn = v; if (v) startMusic(); else stopMusic(); },
    setVolume(v) { volume = v; if (master) master.gain.value = v; },
    unlock() { if (ensure() && musicOn && !timer) startMusic(); }
  };
}
