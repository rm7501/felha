import { createContext } from 'preact';
import { useContext, useEffect, useRef, useState, useMemo } from 'preact/hooks';
import { sfx } from '../core/audio.js';

export const RoomCtx = createContext(null);
export const useRoom = () => useContext(RoomCtx);

export function useTicker(ms = 250) {
  const [, set] = useState(0);
  useEffect(() => { const t = setInterval(() => set(x => x + 1), ms); return () => clearInterval(t); }, [ms]);
}
// seconds left until a host-clock deadline
export function useLeft(dl) {
  const R = useRoom();
  useTicker(200);
  if (!dl) return null;
  return Math.max(0, (dl - R.room.now()) / 1000);
}
export function useFx(fx) {
  const last = useRef(fx ? fx.i : 0);
  useEffect(() => { if (fx && fx.i !== last.current) { last.current = fx.i; sfx(fx.s); } }, [fx && fx.i]);
}
export function usePhase(ph, map) {
  const last = useRef(ph);
  useEffect(() => { if (ph !== last.current) { last.current = ph; const s = map && map[ph]; if (s) sfx(s); } }, [ph]);
}

export function Btn({ kind = 'main', big, small, onClick, disabled, children, class: cls = '', title, type = 'button' }) {
  return <button type={type} title={title} class={`btn btn-${kind} ${big ? 'big' : ''} ${small ? 'small' : ''} ${cls}`} disabled={disabled}
    onClick={e => { if (disabled) return; sfx('click'); onClick && onClick(e); }}>{children}</button>;
}
export function Av({ p, size = 44, ring, dim }) {
  if (!p) return <span class="av" style={{ width: size, height: size }} />;
  return <span class={`av ${ring ? 'ring' : ''} ${dim ? 'dim' : ''}`} style={{ width: size, height: size, fontSize: size * 0.52, '--c': p.col }}>{p.av}</span>;
}
export function Who({ id, size = 30, tag, dim, me }) {
  const R = useRoom(); const p = R.P[id];
  return <span class={`who ${dim ? 'dim' : ''}`}><Av p={p} size={size} dim={dim} /><b style={{ color: p ? p.col : '' }}>{p ? p.name : '؟'}</b>{id === R.me && me !== false ? <i class="you">أنت</i> : null}{tag}</span>;
}
export function Timer({ dl, dur, label, ticking = true, onZero }) {
  const R = useRoom();
  const left = useLeft(dl);
  const fired = useRef(null), lastS = useRef(null);
  useEffect(() => {
    if (left == null) return;
    const s = Math.ceil(left);
    if (ticking && s !== lastS.current && s <= 5 && s > 0) sfx(s % 2 ? 'tick' : 'tock');
    lastS.current = s;
    if (left <= 0 && fired.current !== dl) { fired.current = dl; R.room.act('nudge'); onZero && onZero(); }
  });
  if (left == null) return null;
  const frac = dur ? Math.min(1, left / dur) : 1;
  const urgent = left <= 5;
  return <div class={`timer ${urgent ? 'urgent' : ''}`} role="timer" aria-label={`باقي ${Math.ceil(left)} ثانية`}>
    <div class="timer-bar"><i style={{ transform: `scaleX(${frac})` }} /></div>
    <span class="timer-n">{label ? <small>{label}</small> : null}{Math.ceil(left)}</span>
  </div>;
}
export function PlayerGrid({ ids, onPick, picked, disabledIds = [], badge, showMe = true, cols }) {
  const R = useRoom();
  return <div class="pgrid" style={cols ? { gridTemplateColumns: `repeat(${cols},1fr)` } : null}>
    {ids.filter(id => showMe || id !== R.me).map(id => {
      const p = R.P[id]; const dis = disabledIds.includes(id);
      return <button type="button" key={id} class={`pcard ${picked === id ? 'on' : ''}`} disabled={dis || !onPick} style={{ '--c': p ? p.col : '#fff' }}
        onClick={() => { if (!dis && onPick) { sfx('vote'); onPick(id); } }}>
        <Av p={p} size={46} ring={picked === id} />
        <span class="pname">{p ? p.name : '؟'}{id === R.me ? ' (أنت)' : ''}</span>
        {badge ? <span class="pbadge">{badge(id)}</span> : null}
      </button>;
    })}
  </div>;
}
export function Done({ ids, done, label = 'خلّصوا' }) {
  const R = useRoom();
  const n = ids.filter(id => done[id]).length;
  return <div class="done"><span class="done-n">{label} {n}/{ids.length}</span>
    <div class="done-avs">{ids.map(id => <span key={id} class={done[id] ? 'ok' : 'wait'}><Av p={R.P[id]} size={26} dim={!done[id]} /></span>)}</div></div>;
}
export function SendBox({ placeholder, onSend, max = 40, disabled, autoFocus, keep, btn = 'أرسل', onType, value: v0 }) {
  const [v, setV] = useState(v0 || '');
  const ref = useRef();
  useEffect(() => { if (autoFocus && ref.current && !disabled) ref.current.focus({ preventScroll: true }); }, [autoFocus, disabled]);
  const go = e => { e && e.preventDefault(); const t = v.trim(); if (!t || disabled) return; onSend(t); if (!keep) setV(''); };
  return <form class="sendbox" onSubmit={go}>
    <input ref={ref} value={v} maxLength={max} disabled={disabled} placeholder={placeholder} enterKeyHint="send" autoComplete="off" autoCorrect="off"
      onInput={e => { setV(e.currentTarget.value); onType && onType(e.currentTarget.value); }} dir="auto" />
    <Btn type="submit" disabled={disabled || !v.trim()}>{btn}</Btn>
  </form>;
}
export function Sheet({ open, onClose, title, children, wide }) {
  useEffect(() => {
    if (!open) return;
    const k = e => { if (e.key === 'Escape') onClose && onClose(); };
    addEventListener('keydown', k); return () => removeEventListener('keydown', k);
  }, [open]);
  if (!open) return null;
  return <div class="sheet-wrap" onClick={e => { if (e.target === e.currentTarget) onClose && onClose(); }}>
    <div class={`sheet ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
      <div class="sheet-head"><h3>{title}</h3><button class="x" onClick={onClose} aria-label="سكّر">✕</button></div>
      <div class="sheet-body">{children}</div>
    </div>
  </div>;
}
export function Reveal({ children, cover = 'اضغط عشان تشوف', id }) {
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [id]);
  return <button type="button" class={`reveal ${open ? 'open' : ''}`} onClick={() => { sfx(open ? 'click' : 'reveal'); setOpen(!open); }}>
    {open ? <div class="reveal-in">{children}<small>اضغط عشان تخفيها</small></div> : <div class="reveal-cover"><span class="eye">👁️</span>{cover}</div>}
  </button>;
}
export function Phase({ title, sub, children, icon }) {
  return <div class="phase"><div class="phase-head">{icon ? <span class="phase-ic">{icon}</span> : null}<div><h2>{title}</h2>{sub ? <p>{sub}</p> : null}</div></div>{children}</div>;
}
export function Score({ ids, pts, hi }) {
  const R = useRoom();
  const rows = [...ids].sort((a, b) => (pts[b] || 0) - (pts[a] || 0));
  return <ol class="score">{rows.map(id => <li key={id} class={hi && hi.includes(id) ? 'hi' : ''}><Who id={id} size={24} /><b class="num">{pts[id] || 0}</b></li>)}</ol>;
}
export function Big({ children, c }) { return <div class="bigword" style={c ? { '--c': c } : null}>{children}</div>; }
export function Note({ children, kind = 'info' }) { return <div class={`note note-${kind}`}>{children}</div>; }
export function HostOnly({ children, else: other = null }) { const R = useRoom(); return R.isHost ? children : other; }
export function Feed({ items }) {
  const ref = useRef();
  useEffect(() => { if (ref.current) ref.current.scrollTop = ref.current.scrollHeight; }, [items && items.length]);
  return <div class="feed" ref={ref}>{(items || []).map((m, i) => <div key={i} class={`fm ${m.k || ''}`}>{m.f ? <Who id={m.f} size={20} me={false} /> : null}<span>{m.x}</span></div>)}</div>;
}
export const useMemoOnce = f => useMemo(f, []);
