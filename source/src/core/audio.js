// Sound effects + generative background music, all synthesized with Web Audio (no files).
let ac = null, master, sfxBus, musBus, noiseBuf;
const cfg = loadCfg();
function loadCfg() {
  try { return { music: 0.5, sfx: 0.8, mute: false, tts: false, ...JSON.parse(localStorage.getItem('felha:audio') || '{}') }; }
  catch (e) { return { music: 0.5, sfx: 0.8, mute: false, tts: false }; }
}
export const audioCfg = () => ({ ...cfg });
export function setAudio(patch) {
  Object.assign(cfg, patch);
  try { localStorage.setItem('felha:audio', JSON.stringify(cfg)); } catch (e) { }
  apply();
  if (cfg.music > 0 && !cfg.mute) music.start(); else music.stop();
}
function apply() {
  if (!ac) return;
  const t = ac.currentTime;
  master.gain.setTargetAtTime(cfg.mute ? 0 : 1, t, 0.05);
  sfxBus.gain.setTargetAtTime(cfg.sfx * 0.9, t, 0.05);
  musBus.gain.setTargetAtTime(cfg.music * 0.32, t, 0.3);
}
export function unlock() {
  if (typeof window === 'undefined') return;
  if (!ac) {
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    ac = new AC();
    master = ac.createGain(); master.connect(ac.destination);
    const comp = ac.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4; comp.connect(master);
    sfxBus = ac.createGain(); sfxBus.connect(comp);
    musBus = ac.createGain(); musBus.gain.value = 0; musBus.connect(comp);
    noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
    const ch = noiseBuf.getChannelData(0); for (let i = 0; i < ch.length; i++) ch[i] = Math.random() * 2 - 1;
    apply();
  }
  if (ac.state === 'suspended') ac.resume();
  if (cfg.music > 0 && !cfg.mute) music.start();
}

// ---------- building blocks ----------
function tone(f, t, dur, { type = 'sine', vol = 0.3, to = null, bus = sfxBus, att = 0.005, q = null } = {}) {
  const o = ac.createOscillator(), g = ac.createGain();
  o.type = type; o.frequency.setValueAtTime(f, t);
  if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + att); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  let node = o;
  if (q) { const f2 = ac.createBiquadFilter(); f2.type = 'lowpass'; f2.frequency.value = q; o.connect(f2); node = f2; }
  node.connect(g); g.connect(bus); o.start(t); o.stop(t + dur + 0.02);
}
function noise(t, dur, { vol = 0.3, type = 'bandpass', f = 1200, to = null, bus = sfxBus, qv = 0.8 } = {}) {
  const s = ac.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
  const fl = ac.createBiquadFilter(); fl.type = type; fl.frequency.setValueAtTime(f, t); fl.Q.value = qv;
  if (to) fl.frequency.exponentialRampToValueAtTime(to, t + dur);
  const g = ac.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(fl); fl.connect(g); g.connect(bus); s.start(t); s.stop(t + dur + 0.02);
}
const N = n => 440 * Math.pow(2, (n - 69) / 12);

const FX = {
  click: t => tone(720, t, 0.05, { type: 'square', vol: 0.08, q: 2400 }),
  pop: t => tone(600, t, 0.09, { type: 'sine', vol: 0.25, to: 1300 }),
  join: t => { tone(N(84), t, 0.12, { type: 'triangle', vol: 0.2 }); tone(N(88), t + 0.09, 0.18, { type: 'triangle', vol: 0.2 }); },
  leave: t => { tone(N(88), t, 0.12, { type: 'triangle', vol: 0.15 }); tone(N(81), t + 0.09, 0.2, { type: 'triangle', vol: 0.15 }); },
  tick: t => tone(1500, t, 0.03, { type: 'square', vol: 0.06, q: 3000 }),
  tock: t => tone(1000, t, 0.04, { type: 'square', vol: 0.07, q: 2000 }),
  go: t => [60, 64, 67, 72].forEach((n, i) => tone(N(n + 12), t + i * 0.06, 0.25, { type: 'sawtooth', vol: 0.09, q: 3000 })),
  reveal: t => { noise(t, 0.45, { vol: 0.18, f: 400, to: 5000 }); tone(N(91), t + 0.35, 0.5, { type: 'sine', vol: 0.18 }); tone(N(96), t + 0.42, 0.6, { type: 'sine', vol: 0.12 }); },
  correct: t => [72, 76, 79, 84].forEach((n, i) => tone(N(n), t + i * 0.07, 0.22, { type: 'triangle', vol: 0.22 })),
  wrong: t => { tone(160, t, 0.28, { type: 'sawtooth', vol: 0.16, q: 900 }); tone(110, t + 0.12, 0.3, { type: 'sawtooth', vol: 0.14, q: 700 }); },
  vote: t => tone(N(79), t, 0.12, { type: 'triangle', vol: 0.18, to: N(84) }),
  buzz: t => tone(220, t, 0.32, { type: 'square', vol: 0.12, q: 1600 }),
  win: t => { [[72, 0], [76, .12], [79, .24], [84, .36], [79, .5], [84, .62]].forEach(([n, d]) => tone(N(n), t + d, 0.3, { type: 'square', vol: 0.1, q: 3500 })); tone(N(48), t + 0.36, 0.9, { type: 'sawtooth', vol: 0.12, q: 600 }); },
  lose: t => [67, 63, 60, 55].forEach((n, i) => tone(N(n), t + i * 0.16, 0.3, { type: 'triangle', vol: 0.18 })),
  boom: t => { noise(t, 1.1, { vol: 0.9, type: 'lowpass', f: 3000, to: 60, qv: 0.5 }); tone(140, t, 0.9, { type: 'sine', vol: 0.7, to: 30 }); },
  alarm: t => { for (let i = 0; i < 4; i++) tone(i % 2 ? 660 : 880, t + i * 0.13, 0.12, { type: 'square', vol: 0.09, q: 2500 }); },
  whoosh: t => noise(t, 0.35, { vol: 0.25, f: 300, to: 4000 }),
  heart: t => { tone(N(81), t, 0.1, { type: 'sine', vol: 0.2 }); tone(N(88), t + 0.08, 0.16, { type: 'sine', vol: 0.18 }); },
  type: t => tone(2200 + Math.random() * 400, t, 0.015, { type: 'square', vol: 0.03, q: 5000 }),
  night: t => { tone(N(57), t, 1.4, { type: 'sine', vol: 0.18 }); tone(N(64), t + 0.2, 1.4, { type: 'sine', vol: 0.12 }); tone(N(69), t + 0.4, 1.6, { type: 'sine', vol: 0.1 }); },
  sting: t => { tone(N(50), t, 0.8, { type: 'sawtooth', vol: 0.14, q: 500 }); tone(N(53), t, 0.8, { type: 'sawtooth', vol: 0.1, q: 500 }); noise(t, 0.6, { vol: 0.1, f: 200 }); },
};
export function sfx(name) {
  if (!ac || cfg.mute || cfg.sfx <= 0) return;
  const f = FX[name]; if (f) try { f(ac.currentTime + 0.01); } catch (e) { }
}

// ---------- music: a slow synthwave loop that the game screen speeds up a little ----------
const PROG = [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]]; // Am F C G
let timer = null, step = 0, nextT = 0, mood = 'lobby';
export const music = {
  start() { if (!ac || timer) return; nextT = ac.currentTime + 0.1; step = 0; timer = setInterval(schedule, 40); },
  stop() { if (timer) { clearInterval(timer); timer = null; } },
  mood(m) { mood = m; },
};
function schedule() {
  const bpm = mood === 'game' ? 108 : 94, s16 = 60 / bpm / 4;
  while (nextT < ac.currentTime + 0.15) { playStep(step, nextT, s16); nextT += s16; step = (step + 1) % 64; }
}
function playStep(i, t, s16) {
  const bar = Math.floor(i / 16), chord = PROG[bar], b = i % 16;
  const mb = musBus;
  if (b === 0 || b === 8) tone(N(chord[0] - 24), t, s16 * 7, { type: 'sawtooth', vol: 0.11, q: 420, bus: mb, att: 0.02 });
  if (b === 0) chord.forEach(n => tone(N(n), t, s16 * 15, { type: 'triangle', vol: 0.035, bus: mb, att: 0.4 }));
  if (b % 2 === 0) { const n = chord[(b / 2) % 3] + 12 + (b >= 8 ? 12 : 0); tone(N(n), t, s16 * 1.6, { type: 'square', vol: 0.022, q: 1800, bus: mb }); }
  if (b === 0 || b === 8) tone(110, t, 0.22, { type: 'sine', vol: 0.22, to: 40, bus: mb });
  if (b === 4 || b === 12) noise(t, 0.16, { vol: 0.07, f: 1800, bus: mb });
  if (mood === 'game' && b % 2 === 1) noise(t, 0.04, { vol: 0.03, type: 'highpass', f: 8000, bus: mb });
}

// ---------- narrator (Mafia) via the device's own Arabic voice, if it has one ----------
export function hasArabicVoice() {
  try { return typeof speechSynthesis !== 'undefined' && speechSynthesis.getVoices().some(v => /^ar/i.test(v.lang)); } catch (e) { return false; }
}
export function say(text) {
  if (!cfg.tts || cfg.mute) return;
  try {
    const u = new SpeechSynthesisUtterance(text.replace(/[^\p{L}\p{N}\s،.!؟]/gu, ''));
    const v = speechSynthesis.getVoices().find(v => /^ar/i.test(v.lang)); if (v) u.voice = v;
    u.lang = v ? v.lang : 'ar-SA'; u.rate = 1;
    speechSynthesis.cancel(); speechSynthesis.speak(u);
  } catch (e) { }
}
