import { render } from 'preact';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { RoomCtx, useRoom, Btn, Av, Who, Timer, Sheet, Note, Score } from './kit.jsx';
import { Room, browserStorage } from '../core/client.js';
import { supaTransport, localTransport, logRoom } from '../net/transport.js';
import { GAMES, GAME_LIST, SHELVES } from '../games/index.js';
import { gameOptions } from '../core/engine.js';
import { uid, westDigits } from '../core/util.js';
import { unlock, sfx, music, setAudio, audioCfg, hasArabicVoice } from '../core/audio.js';

const Q = new URLSearchParams(location.search);
const LOCAL = Q.has('local');
const NS = Q.get('tab') ? ':' + Q.get('tab') : '';
const AVATARS = ['😎', '🤠', '👽', '🤖', '👻', '🐸', '🐵', '🦁', '🐯', '🐼', '🦊', '🐺', '🐙', '🦄', '🐲', '🦅', '🐪', '🦂', '🐢', '🐧', '🦈', '🐳', '🦩', '🐝', '🍉', '🍕', '🌶️', '☕', '🍩', '🧃', '🥷', '🧞', '👑', '💀', '🎃', '⚡', '🔥', '🎮', '🚀', '⚽'];
const COLORS = ['#ff3fa4', '#2ef2ff', '#ffb02e', '#45f59a', '#a78bfa', '#ff8a3d', '#ff5b5b', '#f4f1ff'];
const store = {
  get(k, d) { try { const v = localStorage.getItem('felha:' + k + NS); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem('felha:' + k + NS, JSON.stringify(v)); } catch (e) { } },
};
const loadMe = () => store.get('me', null) || { id: 'p' + uid(9), name: '', av: AVATARS[Math.floor(Math.random() * 12)], col: COLORS[Math.floor(Math.random() * COLORS.length)] };
const loadPacks = () => store.get('packs', []);
const hashCode = () => { const h = westDigits(decodeURIComponent(location.hash.slice(1))).replace(/\D/g, ''); return h.length === 4 ? h : ''; };
const linkFor = code => `${location.origin}${location.pathname}#${code}`;
let dictP = null;
const dictLoader = () => (dictP = dictP || fetch('dict-ar.txt').then(r => { if (!r.ok) throw new Error('dict'); return r.text(); }).then(t => new Set(t.split('\n'))).catch(e => { dictP = null; throw e; }));
// in local test mode tabs share one browser, so keep each tab's host snapshot separate
const storage = NS ? { load: c => store.get('host:' + c, null), save: (c, s) => store.set('host:' + c, s), clear: c => { try { localStorage.removeItem('felha:host:' + c + NS); } catch (e) { } } } : browserStorage;

function App() {
  const [me, setMe] = useState(loadMe);
  const [room, setRoom] = useState(null);
  const [, bump] = useState(0);
  const [code, setCode] = useState(hashCode);
  const raf = useRef(0);
  const [busy, setBusy] = useState(false);
  const onChange = () => { if (!raf.current) raf.current = requestAnimationFrame(() => { raf.current = 0; bump(x => x + 1); }); };
  useEffect(() => {
    const g = () => unlock();
    addEventListener('pointerdown', g, { passive: true }); addEventListener('keydown', g);
    const hc = () => { const c = hashCode(); if (!room) setCode(c); };
    addEventListener('hashchange', hc);
    // came back to the same room after a reload → rejoin straight away
    const last = store.get('last', null);
    if (me.name && last && last.code === hashCode() && Date.now() - last.at < 6 * 3600e3) go('join', last.code);
    return () => { removeEventListener('pointerdown', g); removeEventListener('keydown', g); removeEventListener('hashchange', hc); };
  }, []);
  const saveMe = m => { setMe(m); store.set('me', m); if (room) room.updateMe(m); };
  async function go(kind, c, who) {
    const me2 = who || me;
    if (busy) return; setBusy(true);
    try {
      for (let t = 0; t < 6; t++) {
        const cc = kind === 'create' ? String(1000 + Math.floor(Math.random() * 9000)) : c;
        const tr = LOCAL ? localTransport(cc, me2.id) : supaTransport(cc, me2.id);
        const r = new Room({ code: cc, me: me2, transport: tr, games: GAMES, storage, packs: loadPacks, dictLoader, onChange, logRoom: LOCAL ? null : logRoom });
        setRoom(r);
        if (kind === 'create') { const ok = await r.create(); if (!ok) continue; } else await r.join();
        if (r.st === 'live' || r.st === 'connecting') { history.replaceState(null, '', '#' + cc); store.set('last', { code: cc, at: Date.now() }); sfx('join'); }
        break;
      }
    } catch (e) { console.error(e); }
    setBusy(false);
  }
  const leave = async () => { if (room) await room.leave(); setRoom(null); store.set('last', null); history.replaceState(null, '', location.pathname + location.search); setCode(''); music.mood('lobby'); };
  if (!room) return <Home me={me} saveMe={saveMe} code={code} setCode={setCode} busy={busy} go={go} />;
  return <RoomShell room={room} me={me} saveMe={saveMe} leave={leave} />;
}

// ---------------------------------------------------------------- home
function Sign() {
  return <h1 class="sign" aria-label="فلها"><span class="tube">فلها</span></h1>;
}
function Home({ me, saveMe, code, setCode, busy, go }) {
  const [name, setName] = useState(me.name);
  const [pick, setPick] = useState(false);
  const [join, setJoin] = useState(!!code);
  const [jc, setJc] = useState(code);
  const ok = name.trim().length >= 1;
  const commit = () => { const m = { ...me, name: name.trim().slice(0, 18) }; saveMe(m); return m; };
  const doJoin = () => { const c = westDigits(jc).replace(/\D/g, ''); if (c.length !== 4 || !ok) return; go('join', c, commit()); };
  return <main class="home">
    <Sign />
    <p class="lede">ألعاب الشلة وأنتم بالديسكورد. افتحوا الرابط، اكتبوا الكود، وفلّوها.</p>
    <section class="profile" aria-label="ملفك">
      <button type="button" class="av-btn" onClick={() => setPick(true)} aria-label="غيّر الأفاتار"><Av p={{ ...me, name }} size={76} ring /><span>غيّر</span></button>
      <div class="pfields">
        <label class="lbl" for="nm">اسمك</label>
        <input id="nm" class="inp" value={name} maxLength={18} placeholder="وش نسميك؟" onInput={e => setName(e.currentTarget.value)} autoComplete="nickname" dir="auto" />
        <div class="colors" role="radiogroup" aria-label="لونك">{COLORS.map(c => <button type="button" key={c} role="radio" aria-checked={me.col === c} class={`dot ${me.col === c ? 'on' : ''}`} style={{ '--c': c }} onClick={() => saveMe({ ...me, col: c, name })} />)}</div>
      </div>
    </section>
    {join ? <section class="joinbox">
      <label class="lbl" for="cd">كود الروم</label>
      <input id="cd" class="inp code" inputMode="numeric" pattern="[0-9]*" maxLength={4} value={jc} placeholder="١٢٣٤" onInput={e => setJc(westDigits(e.currentTarget.value).replace(/\D/g, '').slice(0, 4))} onKeyDown={e => e.key === 'Enter' && doJoin()} />
      <Btn big disabled={!ok || jc.length !== 4 || busy} onClick={doJoin}>{busy ? 'ندخل…' : 'ادخل الروم'}</Btn>
      {!ok ? <p class="hint">اكتب اسمك أول</p> : null}
      <button type="button" class="linkish" onClick={() => { setJoin(false); setCode(''); }}>أو سوّ روم جديدة</button>
    </section> : <section class="actions">
      <Btn big disabled={!ok || busy} onClick={() => go('create', null, commit())}>{busy ? 'نجهّز الروم…' : 'سوّ روم جديدة'}</Btn>
      <Btn kind="ghost" big disabled={!ok} onClick={() => setJoin(true)}>عندي كود</Btn>
      {!ok ? <p class="hint">اكتب اسمك عشان تبدأ</p> : null}
    </section>}
    <ul class="marquee" aria-label="الألعاب">{GAME_LIST.map(g => <li key={g.id} style={{ '--c': g.c }}><span>{g.e}</span>{g.name}</li>)}</ul>
    <Sheet open={pick} onClose={() => setPick(false)} title="اختار أفاتارك">
      <div class="avgrid">{AVATARS.map(a => <button type="button" key={a} class={`avpick ${me.av === a ? 'on' : ''}`} onClick={() => { saveMe({ ...me, av: a, name }); setPick(false); sfx('pop'); }}>{a}</button>)}</div>
    </Sheet>
  </main>;
}

// ---------------------------------------------------------------- room shell
function RoomShell({ room, me, saveMe, leave }) {
  const pub = room.pub;
  const P = useMemo(() => Object.fromEntries((pub ? pub.players : []).map(p => [p.id, p])), [pub]);
  const ctx = { room, pub, pv: room.pv, me: me.id, isHost: !!room.E, P };
  const [settings, setSettings] = useState(false);
  const [toast, setToast] = useState(null);
  const lastT = useRef(0);
  useEffect(() => { const t = pub && pub.toast; if (t && t.i !== lastT.current) { lastT.current = t.i; setToast(t); if (t.kind === 'join') sfx('join'); const h = setTimeout(() => setToast(null), 3200); return () => clearTimeout(h); } }, [pub && pub.toast && pub.toast.i]);
  useEffect(() => { music.mood(pub && pub.screen === 'game' ? 'game' : 'lobby'); }, [pub && pub.screen]);
  if (['notfound', 'kicked', 'full', 'closed', 'taken'].includes(room.st)) {
    const msg = { notfound: ['ما لقينا الروم 🤷', 'تأكد من الكود، أو يمكن المضيف سكّر الروم.'], kicked: ['انطردت من الروم 😬', 'المضيف طلّعك.'], full: ['الروم فل 🈵', 'الروم فيها ١٢ لاعب.'], closed: ['طلعت من الروم', ''], taken: ['صار خطأ', 'جرّب مرة ثانية.'] }[room.st];
    return <main class="center-msg"><Sign /><h2>{msg[0]}</h2><p>{msg[1]}</p><Btn big onClick={leave}>رجوع</Btn></main>;
  }
  if (!pub) return <main class="center-msg"><Sign /><div class="loader" aria-hidden="true" /><p>ندخل الروم {room.code}…</p><Btn kind="ghost" onClick={leave}>إلغاء</Btn></main>;
  const hostAway = !room.E && room.hostGoneAt && Date.now() - room.hostGoneAt > 8000;
  return <RoomCtx.Provider value={ctx}>
    <div class={`shell scr-${pub.screen}`}>
      <TopBar onSettings={() => setSettings(true)} leave={leave} />
      {room.conn === 'down' ? <div class="banner warn" role="status">انقطع الاتصال… نحاول نرجع 📶</div> : null}
      {hostAway ? <HostAway /> : null}
      <main class="stage">{pub.screen === 'lobby' ? <Lobby /> : pub.screen === 'game' && pub.game ? <GameScreen /> : pub.screen === 'results' ? <Results /> : null}</main>
      {toast ? <div class={`toast t-${toast.kind}`} role="status">{toast.text}</div> : null}
      <SettingsSheet open={settings} onClose={() => setSettings(false)} me={me} saveMe={saveMe} />
    </div>
  </RoomCtx.Provider>;
}
function HostAway() {
  const R = useRoom(); const [t, setT] = useState(0);
  useEffect(() => { const h = setInterval(() => setT(x => x + 1), 1000); return () => clearInterval(h); }, []);
  const secs = Math.floor((Date.now() - R.room.hostGoneAt) / 1000);
  return <div class="banner warn" role="status">المضيف فصل… {secs < 20 ? 'ننتظره يرجع ⏳' : <Btn small onClick={() => R.room.takeover()}>خلني أنا المضيف 👑</Btn>}</div>;
}
function TopBar({ onSettings, leave }) {
  const R = useRoom(); const pub = R.pub;
  const [copied, setCopied] = useState(false);
  const share = async () => {
    const url = linkFor(pub.code);
    try { if (navigator.share && matchMedia('(pointer:coarse)').matches) { await navigator.share({ title: 'فلها', text: `تعال العب معنا — كود الروم ${pub.code}`, url }); return; } } catch (e) { }
    try { await navigator.clipboard.writeText(url); } catch (e) { const i = document.createElement('input'); i.value = url; document.body.appendChild(i); i.select(); document.execCommand('copy'); i.remove(); }
    setCopied(true); sfx('pop'); setTimeout(() => setCopied(false), 1800);
  };
  const on = pub.players.filter(p => p.on);
  return <header class="topbar">
    <button type="button" class="codechip" onClick={share} title="انسخ رابط الروم"><small>الروم</small><b>{pub.code}</b><span>{copied ? 'انسخ ✓' : '🔗'}</span></button>
    <div class="stack-avs" aria-label={`${on.length} لاعبين`}>{on.slice(0, 6).map(p => <Av key={p.id} p={p} size={28} />)}{on.length > 6 ? <span class="more">+{on.length - 6}</span> : null}</div>
    <div class="tb-actions"><button type="button" class="iconbtn" onClick={onSettings} aria-label="الإعدادات">⚙️</button><button type="button" class="iconbtn" onClick={() => { if (confirm('أكيد تبي تطلع من الروم؟')) leave(); }} aria-label="اطلع">🚪</button></div>
  </header>;
}

// ---------------------------------------------------------------- lobby
function Lobby() {
  const R = useRoom(); const pub = R.pub; const g = GAMES[pub.sel] || GAME_LIST[0];
  const [packs, setPacks] = useState(false);
  const online = pub.players.filter(p => p.on).length;
  const played = pub.hist && pub.hist.length;
  const pickedRef = useRef();
  const choose = id => { R.room.act('sel', id); setTimeout(() => { if (pickedRef.current) pickedRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }, 60); };
  return <div class="lobby">
    <div class="lb-side">
      <section class="panel invite">
        <div><h2>ادعُ الشلة</h2><p>أرسل الرابط بالديسكورد، أو خلهم يكتبون الكود</p></div>
        <InviteCode />
      </section>
      <section class="panel players" aria-label="اللاعبين">
        <h3>اللاعبين <small>{online}/{pub.players.length}</small></h3>
        <ul class="plist">{pub.players.map(p => <PlayerRow key={p.id} p={p} />)}</ul>
      </section>
      {played ? <section class="panel night"><h3>نقاط السهرة 🏆</h3><Night />{R.isHost ? <button type="button" class="linkish" onClick={() => { if (confirm('نصفّر نقاط السهرة؟')) R.room.act('resetNight'); }}>صفّر النقاط</button> : null}</section> : null}
    </div>
    <div class="lb-main">
      <section class="panel picked" style={{ '--c': g.c }} ref={pickedRef}>
        <div class="picked-head"><span class="tile-e">{g.e}</span><div><h2>{g.name}</h2><p>{g.tag}</p></div></div>
        <ol class="how">{g.how.map((h, i) => <li key={i}>{h}</li>)}</ol>
        <Options g={g} />
        {R.isHost ? <Btn big disabled={online < g.min || pub.loading} onClick={() => R.room.act('start', g.id)}>{pub.loading ? 'نحمّل…' : online < g.min ? `تحتاج ${g.min} لاعبين` : `ابدأ ${g.name} ▶️`}</Btn> : <Note>ننتظر <Who id={pub.hostId} size={20} me={false} /> يبدأ اللعبة 👑</Note>}
      </section>
      <section class="panel games">
        <div class="games-head"><h3>{R.isHost ? 'اختار اللعبة' : 'الألعاب'}</h3>{R.isHost ? <Btn small kind="ghost" onClick={() => setPacks(true)}>⭐ كلماتي</Btn> : null}</div>
        {SHELVES.map(s => <div key={s.n} class="shelf"><h4>{s.n}</h4><div class="tiles">{s.ids.map(id => { const x = GAMES[id]; const enough = online >= x.min; return <button type="button" key={id} class={`tile ${pub.sel === id ? 'on' : ''} ${enough ? '' : 'few'}`} style={{ '--c': x.c }} disabled={!R.isHost} aria-pressed={pub.sel === id} onClick={() => choose(id)}><span class="tile-e">{x.e}</span><b>{x.name}</b><small>{enough ? x.tag : `يبي ${x.min} لاعبين`}</small></button>; })}</div></div>)}
      </section>
    </div>
    <PacksSheet open={packs} onClose={() => setPacks(false)} />
  </div>;
}
function InviteCode() {
  const R = useRoom(); const [c, setC] = useState(false);
  const url = linkFor(R.pub.code);
  const copy = async () => { try { await navigator.clipboard.writeText(url); } catch (e) { } setC(true); sfx('pop'); setTimeout(() => setC(false), 1600); };
  return <div class="invite-r"><div class="bigcode" aria-label={`الكود ${R.pub.code}`}>{R.pub.code.split('').map((d, i) => <span key={i}>{d}</span>)}</div><Btn onClick={copy}>{c ? 'انسخ ✓' : 'انسخ الرابط'}</Btn></div>;
}
function PlayerRow({ p }) {
  const R = useRoom(); const [menu, setMenu] = useState(false);
  const isHostP = p.id === R.pub.hostId;
  return <li class={`prow ${p.on ? '' : 'off'}`}>
    <Av p={p} size={36} dim={!p.on} /><b style={{ color: p.col }}>{p.name}</b>
    {isHostP ? <span class="badge">👑 المضيف</span> : null}{p.id === R.me ? <span class="badge you">أنت</span> : null}{!p.on ? <span class="badge">غايب</span> : null}
    {R.isHost && p.id !== R.me ? <span class="pmenu"><button type="button" class="iconbtn" onClick={() => setMenu(!menu)} aria-label="خيارات">⋯</button>
      {menu ? <span class="pmenu-list"><button type="button" onClick={() => { setMenu(false); R.room.giveHost(p.id); }}>خله المضيف 👑</button><button type="button" class="danger" onClick={() => { setMenu(false); if (confirm(`تطرد ${p.name}؟`)) R.room.kick(p.id); }}>اطرده 🚫</button></span> : null}</span> : null}
  </li>;
}
function Night() {
  const R = useRoom(); const rows = [...R.pub.players].sort((a, b) => b.night - a.night);
  return <ol class="nightlist">{rows.map((p, i) => <li key={p.id} class={i === 0 && p.night > 0 ? 'lead' : ''}><span class="rk">{i === 0 && p.night > 0 ? '👑' : i + 1}</span><Av p={p} size={26} /><b>{p.name}</b><span class="num">{p.night}</span></li>)}</ol>;
}
function Options({ g }) {
  const R = useRoom(); const pub = R.pub;
  const ops = gameOptions(g, pub.packs);
  const cur = {}; for (const o of ops) cur[o.k] = o.def; Object.assign(cur, pub.opts[g.id] || {});
  const shown = ops.filter(o => !o.show || o.show(cur));
  if (!shown.length) return null;
  return <div class="opts">{shown.map(o => <label key={o.k} class="opt"><span>{o.label}</span>
    {R.isHost ? <select value={JSON.stringify(cur[o.k])} onChange={e => R.room.act('opt', { gid: g.id, k: o.k, v: JSON.parse(e.currentTarget.value) })}>{o.choices.map(([v, l]) => <option key={String(v)} value={JSON.stringify(v)}>{l}</option>)}</select>
      : <b>{(o.choices.find(([v]) => v === cur[o.k]) || [null, '—'])[1]}</b>}</label>)}</div>;
}

// ---------------------------------------------------------------- game + results
function GameScreen() {
  const R = useRoom(); const v = R.pub.game; const g = GAMES[v.id];
  const [sc, setSc] = useState(false); const [menu, setMenu] = useState(false);
  const spectating = !v.ids.includes(R.me);
  return <div class="game" style={{ '--c': g.c }}>
    <div class="gbar">
      <span class="gname">{g.e} {g.name}</span>
      {v.dl ? <Timer dl={v.dl} dur={v.dur} /> : <span />}
      <div class="gbar-r"><button type="button" class="iconbtn" onClick={() => setSc(!sc)} aria-label="النقاط">🏅</button>
        {R.isHost ? <span class="pmenu"><button type="button" class="iconbtn" onClick={() => setMenu(!menu)} aria-label="تحكم المضيف">👑</button>{menu ? <span class="pmenu-list"><button type="button" onClick={() => { setMenu(false); R.room.act('skip'); }}>تخطّي هالمرحلة ⏭️</button><button type="button" class="danger" onClick={() => { setMenu(false); if (confirm('ننهي اللعبة الحين؟')) R.room.act('end'); }}>أنهِ اللعبة ⏹️</button></span> : null}</span> : null}</div>
    </div>
    {sc ? <div class="panel scorepop"><Score ids={v.ids} pts={v.pts} /></div> : null}
    {spectating ? <Note>دخلت والجولة شغالة، تفرّج لين اللعبة الجاية 👀</Note> : null}
    <div class="gbody"><g.View v={v} pv={R.pv} /></div>
  </div>;
}
function Results() {
  const R = useRoom(); const res = R.pub.result;
  useEffect(() => { if (res) sfx(res.rows.some(r => r.pid === R.me && r.place === 1) ? 'win' : 'reveal'); }, [res && res.at]);
  if (!res) return null; const g = GAMES[res.gid];
  const top = res.rows.filter(r => r.place <= 3);
  return <div class="results" style={{ '--c': g.c }}>
    <h2 class="res-title">{g.e} انتهت {g.name}</h2>
    {res.extra && res.extra.note ? <p class="res-note">{res.extra.note}</p> : null}
    <div class="podium">{[2, 1, 3].map(pl => { const rs = top.filter(r => r.place === pl); if (!rs.length) return <div key={pl} class={`pod p${pl} empty`} />; return <div key={pl} class={`pod p${pl}`}>{rs.map(r => <Who key={r.pid} id={r.pid} size={pl === 1 ? 64 : 48} />)}<div class="step"><b>{pl === 1 ? '🥇' : pl === 2 ? '🥈' : '🥉'}</b></div></div>; })}</div>
    <ol class="reslist">{res.rows.map(r => <li key={r.pid}><span class="rk">{r.place}</span><Who id={r.pid} size={28} /><span class="num">{r.pts}</span>{r.night ? <span class="nplus">+{r.night} للسهرة</span> : null}</li>)}</ol>
    {res.extra && res.extra.list ? <div class="panel"><h3>{res.extra.listTitle || ''}</h3><ul class="xlist">{res.extra.list.map(x => <li key={x.pid}><Who id={x.pid} size={24} /><span>{x.t}</span></li>)}</ul></div> : null}
    <div class="panel night"><h3>نقاط السهرة 🏆</h3><Night /></div>
    {R.isHost ? <div class="row"><Btn big onClick={() => R.room.act('start', res.gid)}>نلعبها مرة ثانية 🔁</Btn><Btn big kind="ghost" onClick={() => R.room.act('lobby')}>نختار لعبة ثانية</Btn></div> : <Note>المضيف يختار وش نلعب بعدها</Note>}
  </div>;
}

// ---------------------------------------------------------------- settings & packs
function SettingsSheet({ open, onClose, me, saveMe }) {
  const [a, setA] = useState(audioCfg()); const [name, setName] = useState(me.name);
  useEffect(() => { if (open) { setA(audioCfg()); setName(me.name); } }, [open]);
  const upd = p => { setAudio(p); setA(audioCfg()); };
  const voice = hasArabicVoice();
  return <Sheet open={open} onClose={onClose} title="الإعدادات">
    <div class="set-sec"><h4>ملفك</h4>
      <div class="row"><input class="inp" value={name} maxLength={18} onInput={e => setName(e.currentTarget.value)} dir="auto" /><Btn onClick={() => name.trim() && saveMe({ ...me, name: name.trim() })}>حفظ</Btn></div>
      <div class="avgrid sm">{AVATARS.map(x => <button type="button" key={x} class={`avpick ${me.av === x ? 'on' : ''}`} onClick={() => saveMe({ ...me, av: x })}>{x}</button>)}</div>
      <div class="colors">{COLORS.map(c => <button type="button" key={c} class={`dot ${me.col === c ? 'on' : ''}`} style={{ '--c': c }} onClick={() => saveMe({ ...me, col: c })} aria-label="لون" />)}</div>
    </div>
    <div class="set-sec"><h4>الصوت</h4>
      <label class="tog"><input type="checkbox" checked={!a.mute} onChange={e => upd({ mute: !e.currentTarget.checked })} /> كل الأصوات</label>
      <label class="rng"><span>الموسيقى</span><input type="range" min="0" max="1" step="0.05" value={a.music} onInput={e => upd({ music: +e.currentTarget.value })} /></label>
      <label class="rng"><span>المؤثرات</span><input type="range" min="0" max="1" step="0.05" value={a.sfx} onInput={e => upd({ sfx: +e.currentTarget.value })} /></label>
      {voice ? <label class="tog"><input type="checkbox" checked={a.tts} onChange={e => upd({ tts: e.currentTarget.checked })} /> راوي المافيا يتكلم (صوت جهازك)</label> : null}
    </div>
    <p class="credits">القاموس العربي في لعبة القنبلة مأخوذ من FrequencyWords (Hermit Dave) بترخيص CC BY-SA 4.0</p>
  </Sheet>;
}
const PTYPES = [['words', 'كلمات (برا السالفة، ارسم وخمّن، مين أنا)'], ['wyr', 'أسئلة لو خيروك (خيار | خيار)'], ['mlt', 'أسئلة مين الأكثر']];
function PacksSheet({ open, onClose }) {
  const R = useRoom(); const [packs, setPacks] = useState(loadPacks); const [edit, setEdit] = useState(null); const [imp, setImp] = useState('');
  const save = list => { setPacks(list); store.set('packs', list); R.room.setPacks(list); };
  useEffect(() => { if (open) setPacks(loadPacks()); }, [open]);
  if (edit) return <Sheet open={open} onClose={() => setEdit(null)} title={edit.isNew ? 'باقة جديدة' : 'عدّل الباقة'} wide>
    <label class="lbl">اسم الباقة</label><input class="inp" value={edit.name} maxLength={24} placeholder="مثلًا: أكلات الاستراحة" onInput={e => setEdit({ ...edit, name: e.currentTarget.value })} dir="auto" />
    <label class="lbl">النوع</label><select class="inp" value={edit.type} onChange={e => setEdit({ ...edit, type: e.currentTarget.value })}>{PTYPES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
    <label class="lbl">{edit.type === 'wyr' ? 'كل سطر: خيار | خيار' : 'كل سطر كلمة أو سؤال'}</label>
    <textarea class="ta tall" value={edit.text} onInput={e => setEdit({ ...edit, text: e.currentTarget.value })} dir="auto" placeholder={edit.type === 'wyr' ? 'تاكل كبسة كل يوم | ما تاكلها أبد' : edit.type === 'mlt' ? 'مين أكثر واحد ينام بدري؟' : 'كبسة\nمندي\nمطبق'} />
    <div class="row"><Btn big disabled={!edit.name.trim() || edit.text.split('\n').filter(x => x.trim()).length < 3} onClick={() => { const items = edit.text.split('\n').map(x => x.trim()).filter(Boolean).slice(0, 300); const p = { id: edit.id, name: edit.name.trim(), type: edit.type, items }; save(edit.isNew ? [...packs, p] : packs.map(x => (x.id === p.id ? p : x))); setEdit(null); }}>حفظ</Btn>
      {!edit.isNew ? <Btn kind="danger" onClick={() => { if (confirm('نحذف الباقة؟')) { save(packs.filter(x => x.id !== edit.id)); setEdit(null); } }}>حذف</Btn> : null}</div>
    <p class="hint">لازم ٣ أسطر على الأقل. الباقة تنحفظ بجهازك وتطلع لما تكون أنت المضيف.</p>
  </Sheet>;
  return <Sheet open={open} onClose={onClose} title="⭐ كلماتي" wide>
    <p class="muted">سوّ باقات بكلماتكم الخاصة: أسماء الشلة، أماكن تعرفونها، نكت داخلية… وتطلع لك بخيارات اللعبة.</p>
    <ul class="packlist">{packs.map(p => <li key={p.id}><b>{p.name}</b><small>{(PTYPES.find(t => t[0] === p.type) || [])[1]} — {p.items.length}</small><Btn small kind="ghost" onClick={() => setEdit({ ...p, text: p.items.join('\n') })}>تعديل</Btn>
      <Btn small kind="ghost" onClick={async () => { const s = btoa(unescape(encodeURIComponent(JSON.stringify({ n: p.name, t: p.type, i: p.items })))); try { await navigator.clipboard.writeText('felha:' + s); alert('نسخنا كود الباقة، أرسله لربعك'); } catch (e) { prompt('انسخ الكود:', 'felha:' + s); } }}>مشاركة</Btn></li>)}</ul>
    {!packs.length ? <Note>ما عندك باقات للحين</Note> : null}
    <div class="row"><Btn onClick={() => setEdit({ id: uid(6), name: '', type: 'words', text: '', isNew: true })}>+ باقة جديدة</Btn></div>
    <div class="row"><input class="inp" value={imp} placeholder="الصق كود باقة من ربعك" onInput={e => setImp(e.currentTarget.value)} /><Btn kind="ghost" disabled={!imp.startsWith('felha:')} onClick={() => { try { const o = JSON.parse(decodeURIComponent(escape(atob(imp.slice(6).trim())))); save([...packs, { id: uid(6), name: String(o.n).slice(0, 24), type: ['words', 'wyr', 'mlt'].includes(o.t) ? o.t : 'words', items: (o.i || []).map(String).slice(0, 300) }]); setImp(''); } catch (e) { alert('الكود مو صحيح'); } }}>استيراد</Btn></div>
  </Sheet>;
}

render(<App />, document.getElementById('app'));
