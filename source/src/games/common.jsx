import { useEffect, useRef, useState } from 'preact/hooks';
import { WORDS } from '../data/words.js';
import { CHARS } from '../data/chars.js';
import { useRoom, Btn } from '../ui/kit.jsx';
import { sfx } from '../core/audio.js';
import { uid } from '../core/util.js';

export const split = s => String(s).split('|').map(x => x.trim()).filter(Boolean);
// ---- word pools ----
export function wordCats(filter) {
  return Object.entries(WORDS).filter(([, c]) => !filter || filter(c)).map(([k, c]) => [k, `${c.e} ${c.n}`]);
}
export function packChoices(ctxOrPacks, type = 'words') {
  const packs = Array.isArray(ctxOrPacks) ? ctxOrPacks : [];
  return packs.filter(p => p.type === type).map(p => ['pack:' + p.id, `⭐ ${p.name}`]);
}
export function pool(ctx, key, filter) {
  if (key && key.startsWith('pack:')) {
    const p = ctx.packs.find(x => 'pack:' + x.id === key);
    if (p && p.items.length >= 3) return { name: p.name, words: p.items.slice() };
  }
  if (key && WORDS[key]) return { name: WORDS[key].n, words: split(WORDS[key].w) };
  const keys = Object.keys(WORDS).filter(k => !filter || filter(WORDS[k]));
  const k = ctx.pick(keys);
  return { name: WORDS[k].n, words: split(WORDS[k].w), key: k };
}
export function charPool(ctx, key) {
  if (key && key.startsWith('pack:')) {
    const p = ctx.packs.find(x => 'pack:' + x.id === key);
    if (p && p.items.length >= 2) return p.items.map(w => w.split('/').map(s => s.trim()).filter(Boolean));
  }
  const keys = key && CHARS[key] ? [key] : Object.keys(CHARS);
  const out = [];
  for (const k of keys) for (const item of split(CHARS[k].w)) out.push(item.split('/').map(s => s.trim()).filter(Boolean));
  return out;
}
// ---- phase helpers (host side) ----
export function setPh(ctx, G, ph, secs) {
  G.ph = ph; G.dur = secs || 0; G.dl = secs ? ctx.now() + secs * 1000 : 0; G._v = (G._v || 0) + 1;
}
export const expired = (ctx, G, force) => force || (G.dl && ctx.now() >= G.dl);
export const allIn = (ctx, map) => { const a = ctx.active(); return a.length > 0 && a.every(id => map[id] != null); };
export const basic = G => ({ ph: G.ph, dl: G.dl, dur: G.dur, round: G.round, rounds: G.rounds });
export const opt = (k, label, choices, def, extra) => ({ k, label, type: 'choice', choices, def, ...extra });
export const nums = (arr, unit = '') => arr.map(n => [n, `${n}${unit}`]);
export const yesno = [[true, 'إيه'], [false, 'لا']];

// ---- drawing ----
// strokes: {id, c, w, p:[x,y,x,y...]} in a 1000x750 space
export const PALETTE = ['#ffffff', '#ff3fa4', '#2ef2ff', '#ffb02e', '#45f59a', '#ff4b4b', '#a78bfa', '#ff8a3d', '#8b5a2b', '#14102a'];
export const INK_BG = '#14102a';
export function paint(ctx2d, strokes, W, H, from = 0) {
  const sx = W / 1000, sy = H / 750;
  if (from === 0) { ctx2d.fillStyle = INK_BG; ctx2d.fillRect(0, 0, W, H); }
  ctx2d.lineCap = 'round'; ctx2d.lineJoin = 'round';
  for (const s of strokes) {
    const p = s.p; if (!p || p.length < 2) continue;
    ctx2d.strokeStyle = s.c; ctx2d.lineWidth = Math.max(1, s.w * sx);
    ctx2d.beginPath(); ctx2d.moveTo(p[0] * sx, p[1] * sy);
    if (p.length === 2) ctx2d.lineTo(p[0] * sx + 0.1, p[1] * sy);
    for (let i = 2; i < p.length; i += 2) ctx2d.lineTo(p[i] * sx, p[i + 1] * sy);
    ctx2d.stroke();
  }
}
// read-only canvas fed by strokes array (re-render when version changes)
export function InkView({ strokes, ver }) {
  const ref = useRef();
  useEffect(() => {
    const c = ref.current; if (!c) return;
    const draw = () => { const r = c.getBoundingClientRect(); const dpr = Math.min(2, devicePixelRatio || 1); c.width = Math.max(10, r.width * dpr); c.height = Math.max(10, r.width * 0.75 * dpr); paint(c.getContext('2d'), strokes || [], c.width, c.height); };
    draw(); const ro = new ResizeObserver(draw); ro.observe(c); return () => ro.disconnect();
  }, [strokes, ver]);
  return <canvas ref={ref} class="ink" aria-label="رسمة" />;
}
// live canvas: shows the room's shared drawing (did), drawer can draw
export function LiveInk({ did, canDraw }) {
  const R = useRoom(); const room = R.room;
  const ref = useRef(); const st = useRef({ cur: null, pend: [], last: null });
  const [color, setColor] = useState(PALETTE[1]); const [w, setW] = useState(8);
  const tool = useRef({ color, w }); tool.current = { color, w };
  const redraw = () => { const c = ref.current; if (!c) return; paint(c.getContext('2d'), room.canvas.did === did ? room.canvas.strokes : [], c.width, c.height); };
  useEffect(() => {
    const c = ref.current;
    const size = () => { const r = c.getBoundingClientRect(); const dpr = Math.min(2, devicePixelRatio || 1); c.width = Math.max(10, r.width * dpr); c.height = Math.max(10, r.width * 0.75 * dpr); redraw(); };
    size(); const ro = new ResizeObserver(size); ro.observe(c);
    const off1 = room.on('draw', d => { if (d.did === did) redraw(); });
    const off2 = room.on('dsync', d => { if (d.did === did) redraw(); });
    if (room.canvas.did !== did && !canDraw) room.req();
    return () => { ro.disconnect(); off1(); off2(); };
  }, [did]);
  // drawer: strokes go straight into room.canvas; new points are sent in batches every 90ms
  const local = () => { if (room.canvas.did !== did) room.canvas = { did, strokes: [] }; return room.canvas.strokes; };
  const flush = () => {
    const s = st.current; if (!s.pend.length) return;
    const batch = s.pend; s.pend = [];
    room.drawSend({ did, s: batch });
  };
  useEffect(() => {
    if (!canDraw) return;
    const t = setInterval(flush, 120);
    return () => { clearInterval(t); flush(); };
  }, [canDraw, did]);
  const pos = e => { const r = ref.current.getBoundingClientRect(); return [Math.round(Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * 1000), Math.round(Math.max(0, Math.min(1, (e.clientY - r.top) / r.height)) * 750)]; };
  const down = e => {
    if (!canDraw) return; e.preventDefault(); try { ref.current.setPointerCapture(e.pointerId); } catch (er) { }
    const [x, y] = pos(e); const s = st.current;
    s.cur = { id: uid(5), c: tool.current.color, w: tool.current.w, p: [x, y] };
    local().push(s.cur);
    s.pend.push({ id: s.cur.id, c: s.cur.c, w: s.cur.w, p: [x, y] }); s.last = [x, y];
    redraw();
  };
  const move = e => {
    const s = st.current; if (!canDraw || !s.cur) return; e.preventDefault();
    const [x, y] = pos(e); const [lx, ly] = s.last; if (Math.hypot(x - lx, y - ly) < 4) return;
    s.last = [x, y]; s.cur.p.push(x, y);
    const pend = s.pend.find(z => z.id === s.cur.id);
    if (pend) pend.p.push(x, y); else s.pend.push({ id: s.cur.id, c: s.cur.c, w: s.cur.w, p: [x, y] });
    const c = ref.current, cx = c.getContext('2d'); const sx = c.width / 1000, sy = c.height / 750;
    cx.strokeStyle = s.cur.c; cx.lineWidth = Math.max(1, s.cur.w * sx); cx.lineCap = 'round';
    cx.beginPath(); cx.moveTo(lx * sx, ly * sy); cx.lineTo(x * sx, y * sy); cx.stroke();
  };
  const up = () => { st.current.cur = null; };
  const undo = () => { const S = local(); if (!S.length) return; const last = S.pop(); st.current.pend = st.current.pend.filter(z => z.id !== last.id); room.drawSend({ did, u: last.id }); redraw(); };
  const clear = () => { local().length = 0; st.current.pend = []; room.drawSend({ did, x: 1 }); redraw(); sfx('whoosh'); };
  return <div class="inkbox">
    <canvas ref={ref} class={`ink ${canDraw ? 'can' : ''}`} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} style={{ touchAction: canDraw ? 'none' : 'auto' }} aria-label="لوحة الرسم" />
    {canDraw ? <Tools color={color} setColor={setColor} w={w} setW={setW} undo={undo} clear={clear} /> : null}
  </div>;
}
function Tools({ color, setColor, w, setW, undo, clear }) {
  return <div class="tools">
    <div class="swatches">{PALETTE.map(c => <button type="button" key={c} class={`sw ${c === color ? 'on' : ''} ${c === INK_BG ? 'eraser' : ''}`} style={{ '--c': c }} onClick={() => setColor(c)} aria-label={c === INK_BG ? 'ممحاة' : 'لون'}>{c === INK_BG ? '🧽' : ''}</button>)}</div>
    <div class="sizes">{[4, 8, 16, 30].map(s => <button type="button" key={s} class={`sz ${s === w ? 'on' : ''}`} onClick={() => setW(s)} aria-label={`حجم ${s}`}><i style={{ width: s / 1.6 + 4, height: s / 1.6 + 4 }} /></button>)}
      <Btn small kind="ghost" onClick={undo}>↶ تراجع</Btn><Btn small kind="ghost" onClick={clear}>🗑️ امسح</Btn></div>
  </div>;
}
// local-only canvas (telephone): returns strokes via onChange
export function SoloInk({ onChange, initial }) {
  const ref = useRef(); const S = useRef(initial ? JSON.parse(JSON.stringify(initial)) : []); const cur = useRef(null);
  const [color, setColor] = useState(PALETTE[1]); const [w, setW] = useState(8);
  const tool = useRef(); tool.current = { color, w };
  const redraw = () => { const c = ref.current; if (c) paint(c.getContext('2d'), S.current, c.width, c.height); };
  useEffect(() => {
    const c = ref.current;
    const size = () => { const r = c.getBoundingClientRect(); const dpr = Math.min(2, devicePixelRatio || 1); c.width = Math.max(10, r.width * dpr); c.height = Math.max(10, r.width * 0.75 * dpr); redraw(); };
    size(); const ro = new ResizeObserver(size); ro.observe(c); return () => ro.disconnect();
  }, []);
  const pos = e => { const r = ref.current.getBoundingClientRect(); return [Math.round(Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * 1000), Math.round(Math.max(0, Math.min(1, (e.clientY - r.top) / r.height)) * 750)]; };
  const emit = () => onChange && onChange(S.current);
  const down = e => { e.preventDefault(); ref.current.setPointerCapture(e.pointerId); const [x, y] = pos(e); cur.current = { id: uid(5), c: tool.current.color, w: tool.current.w, p: [x, y] }; S.current.push(cur.current); redraw(); };
  const move = e => { const s = cur.current; if (!s) return; e.preventDefault(); const [x, y] = pos(e); const n = s.p.length; if (Math.hypot(x - s.p[n - 2], y - s.p[n - 1]) < 4) return; s.p.push(x, y); const c = ref.current, cx = c.getContext('2d'), sx = c.width / 1000, sy = c.height / 750; cx.strokeStyle = s.c; cx.lineWidth = Math.max(1, s.w * sx); cx.lineCap = 'round'; cx.beginPath(); cx.moveTo(s.p[n - 2] * sx, s.p[n - 1] * sy); cx.lineTo(x * sx, y * sy); cx.stroke(); };
  const up = () => { if (cur.current) { cur.current = null; emit(); } };
  const undo = () => { S.current.pop(); redraw(); emit(); };
  const clear = () => { S.current = []; redraw(); emit(); sfx('whoosh'); };
  return <div class="inkbox">
    <canvas ref={ref} class="ink can" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} style={{ touchAction: 'none' }} aria-label="لوحة الرسم" />
    <Tools color={color} setColor={setColor} w={w} setW={setW} undo={undo} clear={clear} />
  </div>;
}
// keep drawings small: drop near-duplicate points and cap total size
export function slim(strokes, maxPts = 2600) {
  let total = 0; const out = [];
  for (const s of strokes || []) {
    const p = s.p || []; const q = [p[0], p[1]];
    for (let i = 2; i < p.length; i += 2) { const n = q.length; if (Math.hypot(p[i] - q[n - 2], p[i + 1] - q[n - 1]) >= 6 || i >= p.length - 2) q.push(p[i], p[i + 1]); }
    total += q.length / 2; if (total > maxPts) break;
    out.push({ id: s.id, c: String(s.c).slice(0, 9), w: Math.min(40, +s.w || 8), p: q.map(v => Math.round(+v || 0)) });
  }
  return out;
}
