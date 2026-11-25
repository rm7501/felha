import { useEffect, useRef, useState } from 'preact/hooks';
import { useRoom, Btn, Who, Av, PlayerGrid, Done, SendBox, Phase, Big, Note, Feed, useFx, useLeft, useTicker } from '../ui/kit.jsx';
import { pool, wordCats, packChoices, setPh, expired, allIn, basic, opt, nums, yesno, LiveInk, InkView, SoloInk, slim } from './common.jsx';
import { TELE } from '../data/party.js';
import { BOMB } from '../data/bomb-prompts.js';
import { judge, loose, norm, stripAl, firstLetter, normLetter, ARABIC_LETTERS, EASY_LETTERS, lines } from '../core/util.js';
import { sfx } from '../core/audio.js';

// =====================================================================
// ارسم وخمّن — Draw & Guess
// =====================================================================
export const draw = {
  id: 'draw', name: 'ارسم وخمّن', e: '🎨', c: '#ff8a3d', min: 2, max: 12, tag: 'واحد يرسم والباقي يخمّنون',
  how: ['بدورك تختار كلمة من ثلاث وترسمها', 'الباقين يكتبون تخمينهم، أسرع واحد ياخذ نقاط أكثر', 'الراسم ياخذ نقاط على كل واحد يعرفها'],
  options: packs => [opt('cat', 'الكلمات', [['mix', '🎲 خلطة'], ...wordCats(c => c.d), ...packChoices(packs)], 'mix'), opt('rounds', 'كم مرة يرسم كل واحد', nums([1, 2, 3]), 1), opt('time', 'وقت الرسم', nums([60, 80, 100], ' ث'), 80)],
  setup(ctx, G) { G.order = ctx.shuffle(ctx.active()); G.round = 1; G.rounds = G.opts.rounds; G.turn = -1; G.used = []; G.feed = []; dgNext(ctx, G); },
  act(ctx, G, pid, t, d) {
    const drawer = G.order[G.turn];
    if (t === 'choose' && G.ph === 'choose' && pid === drawer && G.choices[d]) dgStart(ctx, G, G.choices[d]);
    else if (t === 'guess' && G.ph === 'draw' && pid !== drawer && G.ids.includes(pid) && !G.got[pid]) {
      const g = String(d || '').trim().slice(0, 30); if (!g) return;
      const r = judge(g, [G.word]);
      if (r === 'yes') {
        const k = Object.keys(G.got).length; G.got[pid] = k + 1;
        const gp = Math.max(10 - 2 * k, 4); G.pts[pid] += gp; G.pts[drawer] += 2; G.tgain[pid] = gp; G.tgain[drawer] = (G.tgain[drawer] || 0) + 2;
        G.feed.push({ f: pid, x: 'عرفها! ✅', k: 'ok' }); ctx.fx('correct');
        if (ctx.active().filter(x => x !== drawer).every(x => G.got[x])) dgEnd(ctx, G);
      } else {
        if (r === 'close') G.close[pid] = (G.close[pid] || 0) + 1;
        G.feed.push({ f: pid, x: g }); if (G.feed.length > 40) G.feed.splice(0, G.feed.length - 40);
      }
    }
  },
  tick(ctx, G, force) {
    if (G.ph === 'draw' && !force) {
      const frac = (G.dl - ctx.now()) / (G.dur * 1000);
      const want = frac < 0.25 ? 2 : frac < 0.5 ? 1 : 0;
      if (G.hint.length < want && G.word.replace(/\s/g, '').length > 3) { const free = [...G.word].map((c, i) => i).filter(i => G.word[i] !== ' ' && !G.hint.includes(i)); if (free.length > 1) { G.hint.push(ctx.pick(free)); return true; } }
      if (!ctx.on(G.order[G.turn])) { dgEnd(ctx, G); return true; }
    }
    if (G.ph === 'choose' && !ctx.on(G.order[G.turn])) { dgNext(ctx, G); return true; }
    if (!expired(ctx, G, force)) return false;
    if (G.ph === 'choose') dgStart(ctx, G, G.choices[0]);
    else if (G.ph === 'draw') dgEnd(ctx, G);
    else if (G.ph === 'turnend') dgNext(ctx, G);
    return true;
  },
  view(ctx, G) {
    const mask = G.word ? [...G.word].map((c, i) => (c === ' ' ? ' ' : G.hint.includes(i) || G.ph === 'turnend' ? c : '_')) : [];
    return { ...basic(G), drawer: G.order[G.turn], did: G.did, mask, got: G.got || {}, feed: G.feed.slice(-14), word: G.ph === 'turnend' ? G.word : null, tgain: G.ph === 'turnend' ? G.tgain : null, len: G.word ? G.word.replace(/\s/g, '').length : 0 };
  },
  pv(ctx, G, pid) {
    const drawer = G.order[G.turn];
    if (pid === drawer) return G.ph === 'choose' ? { choices: G.choices } : { word: G.word };
    return { close: (G.close && G.close[pid]) || 0, word: G.got && G.got[pid] ? G.word : null };
  },
  View: DrawView,
};
function dgNext(ctx, G) {
  let tries = 0;
  do { G.turn++; if (G.turn >= G.order.length) { G.turn = 0; G.round++; } tries++; } while (!ctx.on(G.order[G.turn]) && tries <= G.order.length);
  if (G.round > G.rounds) return ctx.finish({});
  const pl = pool(ctx, G.opts.cat === 'mix' ? null : G.opts.cat, c => c.d);
  const fresh = pl.words.filter(w => !G.used.includes(w));
  G.choices = ctx.sample(fresh.length >= 3 ? fresh : pl.words, 3); G.word = null; G.hint = []; G.got = {}; G.close = {}; G.tgain = {};
  G.did = G.round * 100 + G.turn + Math.floor(ctx.rnd(1, 9)) * 1000;
  G.feed = [{ x: `دور ${ctx.name(G.order[G.turn])} يرسم ✏️`, k: 'sys' }];
  setPh(ctx, G, 'choose', 15); ctx.fx('pop');
}
function dgStart(ctx, G, w) { G.word = w; G.used.push(w); setPh(ctx, G, 'draw', G.opts.time); ctx.fx('go'); }
function dgEnd(ctx, G) { G.feed.push({ x: `الكلمة كانت: ${G.word}`, k: 'sys' }); setPh(ctx, G, 'turnend', 6); ctx.fx(Object.keys(G.got).length ? 'reveal' : 'lose'); }
function DrawView({ v, pv }) {
  const R = useRoom(); const me = R.me; const amDrawer = v.drawer === me; useFx(v.fx);
  const mask = <div class="mask" aria-label={`${v.len} حروف`}>{v.mask.map((c, i) => <span key={i} class={c === '_' ? 'u' : c === ' ' ? 'sp' : ''}>{c === '_' ? '' : c}</span>)}<small>{v.len} حروف</small></div>;
  if (v.ph === 'choose') return <Phase icon="🎨" title={amDrawer ? 'اختار كلمة ترسمها' : <span><Who id={v.drawer} size={26} /> يختار كلمة…</span>} sub={`الجولة ${v.round} من ${v.rounds}`}>
    {amDrawer && pv && pv.choices ? <div class="choices">{pv.choices.map((c, i) => <Btn key={c} big onClick={() => R.room.gact('choose', i)}>{c}</Btn>)}</div> : <div class="wait-art">🖌️</div>}
  </Phase>;
  return <div class="drawlay">
    <div class="drawtop">{amDrawer && pv && pv.word ? <div class="drawword">ارسم: <b>{pv.word}</b></div> : v.word ? <div class="drawword">الكلمة: <b>{v.word}</b></div> : pv && pv.word ? <div class="drawword ok">عرفتها: <b>{pv.word}</b> ✅</div> : mask}</div>
    <LiveInk did={v.did} canDraw={amDrawer && v.ph === 'draw'} />
    <div class="drawside">
      <div class="gotrow">{v.ids.filter(id => id !== v.drawer).map(id => <span key={id} class={v.got[id] ? 'got' : ''}><Av p={R.P[id]} size={24} dim={!v.got[id]} />{v.got[id] ? '✅' : ''}</span>)}</div>
      <Feed items={v.feed} />
      {v.ph === 'draw' && !amDrawer && !(pv && pv.word) && v.ids.includes(me) ? <><SendBox placeholder="وش يرسم؟ اكتب تخمينك" max={30} onSend={g => R.room.gact('guess', g)} btn="خمّن" />{pv && pv.close ? <Note kind="warn">قريبة! 🔥</Note> : null}</> : null}
      {v.ph === 'turnend' && v.tgain ? <TGain g={v.tgain} /> : null}
    </div>
  </div>;
}
function TGain({ g }) { const R = useRoom(); const e = Object.entries(g).filter(([, x]) => x); return <div class="gains">{e.length ? e.sort((a, b) => b[1] - a[1]).map(([k, x]) => <span key={k} class="gain"><Av p={R.P[k]} size={22} /><b>+{x}</b></span>) : <span class="muted">محد عرفها 😅</span>}</div>; }

// =====================================================================
// تلفون خربان — Draw telephone
// =====================================================================
export const phone = {
  id: 'phone', name: 'تلفون خربان', e: '📞', c: '#2ef2ff', min: 3, max: 10, tag: 'جملة، رسمة، وصف… وشوف وين وصلت',
  how: ['كل واحد يكتب جملة غريبة', 'اللي بعده يرسمها، واللي بعده يوصف الرسمة… وهكذا', 'بالنهاية نشوف كل سلسلة وش صار فيها، وتعطون قلوب لأحلى شي'],
  options: [opt('dt', 'وقت الرسم', nums([60, 90, 120], ' ث'), 90), opt('wt', 'وقت الكتابة', nums([30, 45, 60], ' ث'), 45)],
  setup(ctx, G) { G.rids = ctx.active(); const n = G.rids.length; G.n = n; G.chains = G.rids.map(() => []); G.step = 0; G.sub = {}; G.likes = {}; G.round = 1; G.rounds = n; const sg = ctx.shuffle(lines(TELE)); G.sug = Object.fromEntries(G.rids.map((id, i) => [id, sg[i % sg.length]])); setPh(ctx, G, 'write', G.opts.wt + 15); },
  act(ctx, G, pid, t, d) {
    const i = G.rids.indexOf(pid);
    if (t === 'sub' && (G.ph === 'write' || G.ph === 'draw' || G.ph === 'desc' || G.ph === 'collect') && i >= 0) {
      const kind = phKind(G);
      if (kind === 'draw') { if (!Array.isArray(d)) return; G.sub[pid] = slim(d); }
      else { const x = String(d || '').trim().slice(0, 90); if (!x) return; G.sub[pid] = x; }
      if (allIn(ctx, pickIds(G.sub, G.rids))) phCommit(ctx, G);
      return;
    }
    if (t === 'next' && G.ph === 'album' && pid === ctx.host) phAlbumNext(ctx, G);
    if (t === 'like' && G.ph === 'album' && d && typeof d.c === 'number') {
      const it = G.chains[d.c] && G.chains[d.c][d.i]; if (!it || it.by === pid || d.c !== G.alb.c || d.i > G.alb.i) return;
      const key = d.c + ':' + d.i; const L = (G.likes[key] = G.likes[key] || {});
      if (L[pid]) { delete L[pid]; G.pts[it.by] = Math.max(0, G.pts[it.by] - 1); } else { L[pid] = 1; G.pts[it.by] += 1; ctx.fx('heart'); }
    }
  },
  tick(ctx, G, force) {
    if (G.ph === 'album') { if (force) { phAlbumNext(ctx, G); return true; } return false; }
    if (!expired(ctx, G, force)) return false;
    if (G.ph === 'collect' || force) phCommit(ctx, G);
    else { G.ph = 'collect'; G.dl = ctx.now() + 2500; G.dur = 0; }
    return true;
  },
  view(ctx, G) {
    const base = { ...basic(G), rids: G.rids, step: G.step, steps: G.n, done: Object.fromEntries(Object.keys(G.sub).map(k => [k, true])) };
    if (G.ph === 'album') { const ch = G.chains[G.alb.c]; base.alb = { c: G.alb.c, i: G.alb.i, owner: ch[0] && ch[0].by, items: ch.slice(0, G.alb.i + 1).map((it, j) => ({ ...it, likes: Object.keys(G.likes[G.alb.c + ':' + j] || {}) })), last: G.alb.c >= G.n - 1 && G.alb.i >= ch.length - 1 }; }
    return base;
  },
  pv(ctx, G, pid) {
    const i = G.rids.indexOf(pid); if (i < 0 || G.ph === 'album') return null;
    const kind = phKind(G); const c = (i - G.step + G.n * 10) % G.n; const prev = G.step > 0 ? G.chains[c][G.step - 1] : null;
    return { kind, prev: prev ? { k: prev.k, d: prev.d } : null, done: G.sub[pid] != null, sug: G.step === 0 ? G.sug[pid] : null };
  },
  View: PhoneView,
};
const pickIds = (map, ids) => Object.fromEntries(Object.entries(map).filter(([k]) => ids.includes(k)));
const phKind = G => (G.step === 0 ? 'write' : G.step % 2 ? 'draw' : 'desc');
function phCommit(ctx, G) {
  const kind = phKind(G);
  G.rids.forEach((pid, i) => {
    const c = (i - G.step + G.n * 10) % G.n; let d = G.sub[pid];
    if (d == null) d = kind === 'draw' ? [] : (kind === 'write' ? 'قطوة تسوق سيكل بالكورنيش' : '؟؟؟ ما وصف شي');
    G.chains[c][G.step] = { by: pid, k: kind === 'draw' ? 'draw' : 'text', d };
  });
  G.sub = {}; G.step++; G.round = G.step + 1;
  if (G.step >= G.n) { G.alb = { c: 0, i: 0 }; setPh(ctx, G, 'album', 0); ctx.fx('reveal'); return; }
  const k = phKind(G); setPh(ctx, G, k, k === 'draw' ? G.opts.dt : G.opts.wt); ctx.fx('whoosh');
}
function phAlbumNext(ctx, G) {
  const ch = G.chains[G.alb.c];
  if (G.alb.i < ch.length - 1) G.alb.i++;
  else if (G.alb.c < G.n - 1) { G.alb.c++; G.alb.i = 0; }
  else return ctx.finish({ note: 'القلوب صارت نقاط ❤️' });
  ctx.fx('pop');
}
function PhoneView({ v, pv }) {
  const R = useRoom(); useFx(v.fx);
  if (v.ph === 'album') {
    const a = v.alb;
    return <Phase icon="📖" title={<span>سلسلة <Who id={a.owner} size={26} /></span>} sub={`${a.c + 1} من ${v.rids.length}`}>
      <div class="album">{a.items.map((it, j) => <div key={j} class={`alb-it ${it.k}`}>
        <div class="alb-by"><Who id={it.by} size={22} me={false} /><span>{j === 0 ? 'كتب' : it.k === 'draw' ? 'رسم' : 'وصف'}</span></div>
        {it.k === 'draw' ? <InkView strokes={it.d} ver={a.c * 100 + j} /> : <p class="alb-text">«{it.d}»</p>}
        {it.by !== R.me ? <button type="button" class={`like ${it.likes.includes(R.me) ? 'on' : ''}`} onClick={() => R.room.gact('like', { c: a.c, i: j })}>❤️ {it.likes.length || ''}</button> : <span class="like mine">❤️ {it.likes.length || ''}</span>}
      </div>)}</div>
      {R.isHost ? <Btn big onClick={() => R.room.gact('next')}>{a.last ? 'النتيجة 🏁' : 'اللي بعده ▶️'}</Btn> : <Note>المضيف يقلّب الصفحات</Note>}
    </Phase>;
  }
  if (!pv) return <Phase icon="📞" title="تلفون خربان" sub="تتفرج هالمرة"><Done ids={v.rids} done={v.done} /></Phase>;
  return <PhoneStep v={v} pv={pv} />;
}
function PhoneStep({ v, pv }) {
  const R = useRoom(); const [txt, setTxt] = useState(''); const strokes = useRef([]); const sent = useRef(false);
  const left = useLeft(v.dl);
  const key = v.step;
  useEffect(() => { sent.current = false; strokes.current = []; setTxt(''); }, [key]);
  const send = () => { if (pv.kind === 'draw') R.room.gact('sub', slim(strokes.current)); else { const t = txt.trim() || (pv.kind === 'write' ? pv.sug : ''); if (t) R.room.gact('sub', t); } sent.current = true; sfx('pop'); };
  useEffect(() => { if (left != null && left < 1.3 && !sent.current && !pv.done && (v.ph !== 'collect')) send(); });
  useEffect(() => { if (v.ph === 'collect' && !sent.current && !pv.done) send(); }, [v.ph]);
  if (pv.done) return <Phase icon="⏳" title="تمام! ننتظر الباقين" sub={`الخطوة ${v.step + 1} من ${v.steps}`}><Done ids={v.rids} done={v.done} /></Phase>;
  if (pv.kind === 'write') return <Phase icon="✍️" title="اكتب جملة غريبة" sub="شي ينرسم ويضحك">
    <textarea class="ta" maxLength={90} value={txt} placeholder={pv.sug} onInput={e => setTxt(e.currentTarget.value)} dir="auto" />
    <div class="row"><Btn kind="ghost" onClick={() => setTxt(pv.sug)}>🎲 اقتراح</Btn><Btn big onClick={send}>تم ✅</Btn></div>
    <Done ids={v.rids} done={v.done} />
  </Phase>;
  if (pv.kind === 'draw') return <Phase icon="🎨" title="ارسم هذي:" sub={`الخطوة ${v.step + 1} من ${v.steps}`}>
    <div class="tele-prompt">«{pv.prev ? pv.prev.d : ''}»</div>
    <SoloInk key={key} onChange={s => { strokes.current = s; }} />
    <Btn big onClick={send}>خلصت رسمتي ✅</Btn>
  </Phase>;
  return <Phase icon="🔍" title="وش هذي الرسمة؟" sub="اوصفها بجملة">
    {pv.prev ? <InkView strokes={pv.prev.d} ver={key} /> : null}
    <textarea class="ta" maxLength={90} value={txt} placeholder="أشوف…" onInput={e => setTxt(e.currentTarget.value)} dir="auto" />
    <Btn big disabled={!txt.trim()} onClick={send}>تم ✅</Btn>
  </Phase>;
}

// =====================================================================
// القنبلة — Bomb word
// =====================================================================
export const bomb = {
  id: 'bomb', name: 'القنبلة', e: '💣', c: '#ffb02e', min: 2, max: 10, needs: 'dict', tag: 'اكتب كلمة قبل ما تنفجر فيك',
  how: ['القنبلة عند واحد، يطلع له حرفين', 'لازم يكتب كلمة عربية فيها الحرفين بنفس الترتيب ويمرّرها', 'محد يعرف متى تنفجر! اللي تنفجر عنده يخسر روح'],
  options: [opt('lives', 'عدد الأرواح', nums([1, 2, 3]), 2), opt('lvl', 'الصعوبة', [['ramp', '📈 تصعب شوي شوي'], ['easy', 'سهلة'], ['med', 'متوسطة'], ['hard', 'صعبة']], 'ramp'), opt('min', 'أقل وقت للانفجار', nums([8, 12, 16], ' ث'), 10)],
  setup(ctx, G) {
    G.order = ctx.shuffle(ctx.active()); G.lives = Object.fromEntries(G.order.map(id => [id, G.opts.lives])); G.cur = 0; G.used = {}; G.nUsed = 0; G.elim = []; G.last = null; G.err = null; G.round = 1; G.rounds = 0;
    bmPrompt(ctx, G); bmFuse(ctx, G); G.ph = 'play'; G.turnAt = ctx.now(); G.dl = 0;
  },
  act(ctx, G, pid, t, d) {
    if (t !== 'word' || G.ph !== 'play' || G.order[G.cur] !== pid) return;
    const raw = String(d || '').trim().slice(0, 30); const w = norm(raw).replace(/ /g, '');
    let why = null;
    if (w.length < 2) why = 'short';
    else if (!w.includes(G.prompt)) why = 'prompt';
    else if (G.used[stripAl(w)]) why = 'used';
    else if (!bmValid(ctx.dict, w)) why = 'dict';
    if (why) { G.err = { f: pid, w: raw, why, i: ((G.err && G.err.i) || 0) + 1 }; ctx.fx('wrong'); return; }
    G.used[stripAl(w)] = 1; G.nUsed++; G.last = { f: pid, w: raw, p: G.prompt }; G.err = null;
    if (ctx.now() > G.boomAt - 2500) G.boomAt = ctx.now() + 2500;
    bmPass(ctx, G); bmPrompt(ctx, G); ctx.fx('pop');
  },
  tick(ctx, G, force) {
    if (G.ph === 'boom') { if (ctx.now() >= G.dl || force) { G.ph = 'play'; G.dl = 0; G.turnAt = ctx.now(); bmFuse(ctx, G); return true; } return false; }
    if (G.ph !== 'play') return false;
    if (!ctx.on(G.order[G.cur]) && ctx.now() - G.turnAt > 6000) { bmBoom(ctx, G); return true; }
    if (force || ctx.now() >= G.boomAt) { bmBoom(ctx, G); return true; }
    return false;
  },
  view(ctx, G) { return { ph: G.ph, order: G.order, cur: G.order[G.cur], lives: G.lives, prompt: G.prompt, last: G.last, err: G.err, elim: G.elim, turnAt: G.turnAt, boomed: G.boomed || null, dl: G.ph === 'boom' ? G.dl : 0, nUsed: G.nUsed }; },
  View: BombView,
};
function bmValid(dict, w) {
  if (!dict) return true;
  const cands = [w, stripAl(w), 'ال' + w];
  if (/^[وف]/.test(w) && w.length > 3) cands.push(w.slice(1), stripAl(w.slice(1)));
  if (/^[بلك]/.test(w) && w.length > 3) cands.push(w.slice(1));
  return cands.some(x => dict.has(x));
}
function bmPrompt(ctx, G) {
  let tier = G.opts.lvl;
  if (tier === 'ramp') tier = G.nUsed < 6 ? 'easy' : G.nUsed < 16 ? ctx.pick(['easy', 'med']) : ctx.pick(['med', 'hard']);
  const list = BOMB[tier] || BOMB.easy; let p;
  for (let i = 0; i < 6; i++) { p = ctx.pick(list); if (p !== G.prompt) break; }
  G.prompt = p;
}
function bmFuse(ctx, G) { G.boomAt = ctx.now() + ctx.rnd(G.opts.min, G.opts.min + 16) * 1000; }
function bmPass(ctx, G) {
  const n = G.order.length;
  for (let k = 1; k <= n; k++) { const j = (G.cur + k) % n; if (G.lives[G.order[j]] > 0) { G.cur = j; break; } }
  G.turnAt = ctx.now();
}
function bmBoom(ctx, G) {
  const id = G.order[G.cur]; G.lives[id] = Math.max(0, G.lives[id] - 1); G.boomed = { id, i: ((G.boomed && G.boomed.i) || 0) + 1 }; ctx.fx('boom');
  if (G.lives[id] === 0) G.elim.push(id);
  const alive = G.order.filter(x => G.lives[x] > 0);
  if (alive.length <= 1) {
    const n = G.order.length;
    G.elim.forEach((x, i) => { G.pts[x] = i; });
    if (alive[0]) G.pts[alive[0]] = n + 1;
    return ctx.finish({ note: alive[0] ? `${ctx.name(alive[0])} آخر واحد صامد 💪` : '' });
  }
  bmPass(ctx, G); bmPrompt(ctx, G); G.err = null;
  G.ph = 'boom'; G.dl = ctx.now() + 2200; G.dur = 0;
}
const WHY = { short: 'قصيرة مرة', prompt: 'ما فيها الحرفين', used: 'انقالت قبل!', dict: 'مو بالقاموس 🤔' };
function BombView({ v }) {
  const R = useRoom(); const me = R.me; const mine = v.cur === me && v.ph === 'play'; useFx(v.fx); useTicker(500);
  const [live, setLive] = useState({});
  useEffect(() => R.room.on('live', d => { if (d && d.f) setLive(l => ({ ...l, [d.f]: String(d.t || '').slice(0, 30) })); }), []);
  useEffect(() => { setLive({}); }, [v.cur, v.prompt]);
  const lastLive = useRef(0);
  const elapsed = Math.max(0, (R.room.now() - v.turnAt) / 1000);
  return <div class={`bomb-stage ${v.ph === 'boom' ? 'exploded' : ''}`}>
    <div class="bomb-ring">{v.order.map((id, i) => { const ang = (i / v.order.length) * Math.PI * 2 - Math.PI / 2; return <div key={id} class={`bomb-p ${id === v.cur ? 'cur' : ''} ${v.lives[id] === 0 ? 'out' : ''}`} style={{ left: `${50 + 40 * Math.cos(ang)}%`, top: `${50 + 40 * Math.sin(ang)}%` }}>
      <Av p={R.P[id]} size={40} dim={v.lives[id] === 0} /><span class="lives">{v.lives[id] ? '❤️'.repeat(v.lives[id]) : '💀'}</span>{id === v.cur ? <span class="bomb-live">{live[id] || ''}</span> : null}</div>; })}
      <div class="bomb-core"><span class={`bomb-e ${elapsed > 8 ? 'hot' : ''}`}>{v.ph === 'boom' ? '💥' : '💣'}</span><div class="prompt">{v.prompt}</div></div>
    </div>
    {v.ph === 'boom' && v.boomed ? <Note kind="bad">انفجرت عند <Who id={v.boomed.id} size={22} />!</Note> : null}
    {v.last ? <p class="lastword"><Who id={v.last.f} size={20} me={false} />: <b>{v.last.w}</b></p> : null}
    {v.err && v.err.f === me ? <Note kind="warn">«{v.err.w}» — {WHY[v.err.why]}</Note> : null}
    {mine ? <SendBox key={v.prompt + v.nUsed} autoFocus placeholder={`كلمة فيها «${v.prompt}»`} max={30} btn="مرّر 💨" onSend={w => R.room.gact('word', w)} onType={t => { const n = Date.now(); if (n - lastLive.current > 160) { lastLive.current = n; R.room.live({ t }); sfx('type'); } }} />
      : v.ph === 'play' ? <Note>القنبلة عند <Who id={v.cur} size={22} />… 😬</Note> : null}
  </div>;
}

// =====================================================================
// إنسان حيوان جماد — Categories
// =====================================================================
const SETS = {
  classic: ['إنسان', 'حيوان', 'نبات', 'جماد', 'بلاد'],
  plus: ['إنسان', 'حيوان', 'نبات', 'جماد', 'بلاد', 'أكلة', 'مهنة'],
  fun: ['أكلة', 'لاعب كرة', 'مسلسل أو فيلم', 'أنمي أو كرتون', 'ماركة', 'بلاد'],
};
export const cats = {
  id: 'cats', name: 'إنسان حيوان جماد', e: '📝', c: '#45f59a', min: 2, max: 10, tag: 'حرف واحد وكل الخانات',
  how: ['يطلع حرف، املوا كل الخانات بكلمات تبدأ فيه', 'أول واحد يخلّص يضغط «ستوب» والباقين معهم ٥ ثواني', 'تراجعون أجوبة بعض: الجواب اللي محد كتبه ١٠، المكرر ٥، والغلط صفر'],
  options: [opt('rounds', 'عدد الحروف', nums([3, 4, 5, 6]), 4), opt('set', 'الخانات', [['classic', 'إنسان، حيوان، نبات، جماد، بلاد'], ['plus', 'الكلاسيكية + أكلة + مهنة'], ['fun', 'أكلة، لاعب، مسلسل، أنمي، ماركة، بلاد']], 'classic'), opt('time', 'أقصى وقت للحرف', nums([60, 90, 120], ' ث'), 90), opt('hard', 'حروف صعبة؟ (ث ذ ض ظ غ)', yesno, false)],
  setup(ctx, G) { G.cats = SETS[G.opts.set] || SETS.classic; G.letters = ctx.sample(G.opts.hard ? ARABIC_LETTERS : EASY_LETTERS, G.opts.rounds); G.round = 0; G.rounds = G.letters.length; caNext(ctx, G); },
  act(ctx, G, pid, t, d) {
    if (!G.ids.includes(pid)) return;
    if (t === 'ans' && ['write', 'stopping', 'collect'].includes(G.ph) && Array.isArray(d)) { G.ans[pid] = G.cats.map((_, i) => String(d[i] || '').trim().slice(0, 30)); }
    if (t === 'stop' && G.ph === 'write') {
      const a = G.ans[pid] || []; if (G.cats.every((_, i) => (a[i] || '').length)) { G.stopBy = pid; setPh(ctx, G, 'stopping', 6); ctx.fx('alarm'); }
    }
    if (t === 'rej' && G.ph === 'review' && d && d.p !== pid && G.ans[d.p]) { const k = d.p + ':' + d.i; const m = (G.rej[k] = G.rej[k] || {}); if (m[pid]) delete m[pid]; else m[pid] = 1; }
    if (t === 'ok' && G.ph === 'review') { G.ok[pid] = 1; if (allIn(ctx, G.ok)) caScore(ctx, G); }
    if (t === 'next' && G.ph === 'scores' && pid === ctx.host) caNext(ctx, G);
  },
  tick(ctx, G, force) {
    if (!expired(ctx, G, force)) return false;
    if (G.ph === 'write' || G.ph === 'stopping') { G.ph = 'collect'; G.dl = ctx.now() + 1800; G.dur = 0; }
    else if (G.ph === 'collect') { G.rej = {}; G.ok = {}; setPh(ctx, G, 'review', 45); ctx.fx('reveal'); }
    else if (G.ph === 'review') caScore(ctx, G);
    else if (G.ph === 'scores') caNext(ctx, G);
    return true;
  },
  view(ctx, G) {
    const L = G.letters[G.round - 1];
    const out = { ...basic(G), letter: L, cats: G.cats, stopBy: G.stopBy || null, filled: Object.fromEntries(G.ids.map(id => [id, (G.ans[id] || []).filter(Boolean).length])) };
    if (['review', 'scores'].includes(G.ph)) { out.ans = G.ans; out.rej = Object.fromEntries(Object.entries(G.rej).map(([k, m]) => [k, Object.keys(m)])); out.auto = caAuto(G); out.ok = G.ok; }
    if (G.ph === 'scores') out.rs = G.rs;
    return out;
  },
  View: CatsView,
};
function caNext(ctx, G) { if (G.round >= G.rounds) return ctx.finish({}); G.round++; G.ans = {}; G.stopBy = null; G.rs = null; setPh(ctx, G, 'write', G.opts.time); ctx.fx('go'); }
function caAuto(G) {
  const L = normLetter(G.letters[G.round - 1]); const bad = {};
  for (const id of G.ids) (G.ans[id] || []).forEach((a, i) => { if (!a || firstLetter(a) !== L) bad[id + ':' + i] = 1; });
  for (const id of G.ids) G.cats.forEach((_, i) => { if (!(G.ans[id] || [])[i]) bad[id + ':' + i] = 1; });
  return bad;
}
function caScore(ctx, G) {
  const auto = caAuto(G); const n = ctx.active().length; const need = Math.max(1, Math.ceil((n - 1) / 2));
  const valid = (id, i) => !auto[id + ':' + i] && Object.keys(G.rej[id + ':' + i] || {}).length < need;
  G.rs = {};
  G.cats.forEach((_, i) => {
    const seen = {};
    for (const id of G.ids) if (valid(id, i)) { const k = loose(G.ans[id][i]); seen[k] = (seen[k] || 0) + 1; }
    for (const id of G.ids) {
      const p = valid(id, i) ? (seen[loose(G.ans[id][i])] > 1 ? 5 : 10) : 0;
      (G.rs[id] = G.rs[id] || []).push(p); G.pts[id] = (G.pts[id] || 0) + p;
    }
  });
  setPh(ctx, G, 'scores', 0); ctx.fx('correct');
}
function CatsView({ v }) {
  const R = useRoom(); const me = R.me; useFx(v.fx);
  if (['write', 'stopping', 'collect'].includes(v.ph)) return <CatsWrite v={v} key={v.round} />;
  const mineIdx = (id, i) => id + ':' + i;
  return <Phase icon="🧐" title={v.ph === 'review' ? `راجعوا أجوبة حرف «${v.letter}»` : `نتيجة حرف «${v.letter}»`} sub={v.ph === 'review' ? 'اضغط على أي جواب غلط عشان ترفضه ❌' : ''}>
    <div class="ca-table" style={{ '--cols': v.ids.length }}>
      <div class="ca-row head"><span />{v.ids.map(id => <span key={id}><Av p={R.P[id]} size={26} /></span>)}</div>
      {v.cats.map((c, i) => <div key={c} class="ca-row"><span class="ca-cat">{c}</span>{v.ids.map(id => {
        const k = mineIdx(id, i); const a = (v.ans[id] || [])[i] || ''; const rej = (v.rej[k] || []); const auto = v.auto[k];
        const cls = auto ? 'bad' : rej.length ? 'rej' : '';
        return <button type="button" key={id} class={`ca-cell ${cls} ${rej.includes(me) ? 'mine' : ''}`} disabled={v.ph !== 'review' || id === me || auto} onClick={() => R.room.gact('rej', { p: id, i })}>
          <span>{a || '—'}</span>{rej.length ? <i>❌{rej.length}</i> : null}{v.rs ? <b class="ca-pts">{v.rs[id][i]}</b> : null}</button>;
      })}</div>)}
      {v.rs ? <div class="ca-row tot"><span>المجموع</span>{v.ids.map(id => <b key={id}>{v.rs[id].reduce((a, b) => a + b, 0)}</b>)}</div> : null}
    </div>
    {v.ph === 'review' ? <><Btn big disabled={v.ok && v.ok[me]} onClick={() => R.room.gact('ok')}>{v.ok && v.ok[me] ? 'ننتظر الباقين' : 'خلصت مراجعة ✅'}</Btn><Done ids={v.ids} done={v.ok || {}} label="راجعوا" /></>
      : R.isHost ? <Btn big onClick={() => R.room.gact('next')}>{v.round >= v.rounds ? 'النتيجة 🏁' : 'الحرف اللي بعده ▶️'}</Btn> : null}
  </Phase>;
}
function CatsWrite({ v }) {
  const R = useRoom(); const [a, setA] = useState(() => v.cats.map(() => ''));
  const timer = useRef(null); const latest = useRef(a); latest.current = a;
  const push = (arr) => { clearTimeout(timer.current); timer.current = setTimeout(() => R.room.gact('ans', arr), 900); };
  useEffect(() => { if (v.ph !== 'write') { clearTimeout(timer.current); R.room.gact('ans', latest.current); } }, [v.ph]);
  useEffect(() => () => clearTimeout(timer.current), []);
  const full = a.every(x => x.trim());
  const L = normLetter(v.letter);
  return <Phase icon="📝" title={<span>الحرف: <span class="letter">{v.letter}</span></span>} sub={v.ph === 'stopping' ? <span><Who id={v.stopBy} size={22} /> قال ستوب! 🛑 بسرعة</span> : `حرف ${v.round} من ${v.rounds}`}>
    <div class="ca-form">{v.cats.map((c, i) => { const val = a[i]; const ok = val && firstLetter(val) === L; return <label key={c} class={`ca-in ${val ? (ok ? 'ok' : 'bad') : ''}`}><span>{c}</span>
      <input value={val} maxLength={30} disabled={v.ph === 'collect'} dir="auto" autoComplete="off" onInput={e => { const n = a.slice(); n[i] = e.currentTarget.value; setA(n); push(n); }} placeholder={`${v.letter}…`} /></label>; })}</div>
    {v.ph === 'write' ? <Btn big kind="danger" disabled={!full} onClick={() => { R.room.gact('ans', a); R.room.gact('stop'); }}>ستوب! 🛑</Btn> : null}
    <div class="ca-fill">{v.ids.map(id => <span key={id}><Av p={R.P[id]} size={22} /> {v.filled[id] || 0}/{v.cats.length}</span>)}</div>
  </Phase>;
}
