import { useEffect, useRef, useState } from 'preact/hooks';
import { useRoom, Btn, Who, Av, PlayerGrid, Done, SendBox, Phase, Big, Note, Feed, useFx, useTicker } from '../ui/kit.jsx';
import { setPh, expired, allIn, basic, opt, nums, split } from './common.jsx';
import { TRIVIA, EMOJI, FEUD, TOPICS } from '../data/quiz.js';
import { WAVE } from '../data/party.js';
import { WORDS } from '../data/words.js';
import { judge, loose, lines, alts } from '../core/util.js';
import { Gains } from './talk.jsx';

const topicOpts = [['mix', '🎲 خلطة'], ...Object.entries(TOPICS).map(([k, t]) => [k, t])];

// =====================================================================
// مسابقة — Trivia buzzer
// =====================================================================
export const trivia = {
  id: 'trivia', name: 'مسابقة', e: '🧠', c: '#2ef2ff', min: 1, max: 12, tag: 'سؤال، أربع خيارات، والأسرع يكسب',
  how: ['يطلع سؤال مع أربع خيارات', 'جاوب صح وبسرعة: كل ما كنت أسرع زادت نقاطك', 'أسرع واحد يجاوب صح ياخذ ⚡'],
  options: [opt('topic', 'المواضيع', topicOpts, 'mix'), opt('count', 'عدد الأسئلة', nums([8, 10, 15, 20]), 10), opt('time', 'وقت السؤال', nums([12, 15, 20], ' ث'), 15)],
  setup(ctx, G) {
    const keys = G.opts.topic === 'mix' ? Object.keys(TRIVIA) : [G.opts.topic];
    const all = []; for (const k of keys) for (const l of lines(TRIVIA[k])) { const [q, ...o] = l.split('|').map(s => s.trim()); if (o.length >= 2) all.push({ q, o, k }); }
    G.qs = ctx.sample(all, Math.min(G.opts.count, all.length)); G.round = 0; G.rounds = G.qs.length; trNext(ctx, G);
  },
  act(ctx, G, pid, t, d) {
    if (t === 'ans' && G.ph === 'q' && G.a[pid] == null && G.cur.o[d] != null) { G.a[pid] = { i: d, t: ctx.now() }; if (allIn(ctx, G.a)) trReveal(ctx, G); }
    else if (t === 'next' && G.ph === 'a' && pid === ctx.host) trNext(ctx, G);
  },
  tick(ctx, G, force) { if (!expired(ctx, G, force)) return false; if (G.ph === 'q') trReveal(ctx, G); else trNext(ctx, G); return true; },
  view(ctx, G) { return { ...basic(G), q: G.cur.q, o: G.cur.o, k: G.cur.k, done: Object.fromEntries(Object.keys(G.a).map(k => [k, true])), right: G.ph === 'a' ? G.cur.right : null, picks: G.ph === 'a' ? Object.fromEntries(Object.entries(G.a).map(([k, x]) => [k, x.i])) : null, gain: G.gain, fast: G.fast }; },
  pv(ctx, G, pid) { return { mine: G.a[pid] ? G.a[pid].i : null }; },
  View: TriviaView,
};
function trNext(ctx, G) {
  if (G.round >= G.rounds) return ctx.finish({});
  const q = G.qs[G.round]; G.round++;
  const order = ctx.shuffle(q.o.map((t, i) => ({ t, i })));
  G.cur = { q: q.q, o: order.map(x => x.t), right: order.findIndex(x => x.i === 0), k: q.k };
  G.a = {}; G.gain = null; G.fast = null; setPh(ctx, G, 'q', G.opts.time); ctx.fx('pop');
}
function trReveal(ctx, G) {
  G.gain = {}; let best = null;
  for (const [pid, x] of Object.entries(G.a)) if (x.i === G.cur.right) {
    const left = Math.max(0, G.dl - x.t) / (G.dur * 1000);
    const p = Math.round((500 + 500 * left) / 10) * 10; G.pts[pid] += p; G.gain[pid] = p;
    if (!best || x.t < G.a[best].t) best = pid;
  }
  G.fast = best; setPh(ctx, G, 'a', 7); ctx.fx(best ? 'correct' : 'wrong');
}
function TriviaView({ v, pv }) {
  const R = useRoom(); useFx(v.fx); const mine = pv ? pv.mine : null;
  return <Phase icon="🧠" title={v.q} sub={`${TOPICS[v.k] || ''} — سؤال ${v.round} من ${v.rounds}`}>
    <div class="tr-opts">{v.o.map((o, i) => {
      const cls = v.right != null ? (i === v.right ? 'right' : mine === i ? 'wrongpick' : '') : mine === i ? 'on' : '';
      return <button type="button" key={i} class={`tr-o t${i} ${cls}`} disabled={v.ph !== 'q' || mine != null} onClick={() => R.room.gact('ans', i)}>
        <span class="tr-l">{'أبجد'[i]}</span><span class="tr-t">{o}</span>
        {v.picks ? <span class="tr-who">{Object.keys(v.picks).filter(k => v.picks[k] === i).map(k => <Av key={k} p={R.P[k]} size={20} />)}</span> : null}
      </button>;
    })}</div>
    {v.ph === 'q' ? <Done ids={v.ids} done={v.done} label="جاوبوا" /> : <>{v.fast ? <Note kind="ok">⚡ الأسرع: <Who id={v.fast} size={22} /></Note> : <Note kind="bad">محد جابها 😬</Note>}<Gains gain={v.gain} />{R.isHost ? <Btn onClick={() => R.room.gact('next')}>التالي ⏭️</Btn> : null}</>}
  </Phase>;
}

// =====================================================================
// خمّن الإيموجي — Emoji riddles
// =====================================================================
const EMO_T = { m: '🎬 فيلم', s: '📺 مسلسل', a: '🍥 أنمي', g: '🎮 لعبة', k: '🇸🇦 سعودي', p: '📜 مثل', f: '⚽ كورة' };
export const emoji = {
  id: 'emoji', name: 'خمّن الإيموجي', e: '🧩', c: '#ffb02e', min: 1, max: 12, tag: 'فيلم أو مثل… بالإيموجي',
  how: ['تطلع إيموجيات تمثّل فيلم أو مسلسل أو مثل أو لعبة', 'اكتب تخمينك، تقدر تحاول أكثر من مرة', 'أول واحد يعرف ياخذ ٥، اللي بعده ٤… وبنص الوقت يطلع تلميح'],
  options: [opt('topic', 'النوع', [['mix', '🎲 خلطة'], ...Object.entries(EMO_T)], 'mix'), opt('count', 'عدد الألغاز', nums([6, 8, 10, 15]), 10), opt('time', 'وقت اللغز', nums([30, 45, 60], ' ث'), 45)],
  setup(ctx, G) {
    const all = lines(EMOJI).map(l => { const [e, a, k] = l.split('|').map(s => s.trim()); return { e, a: alts(a), k }; }).filter(x => G.opts.topic === 'mix' || x.k === G.opts.topic);
    G.qs = ctx.sample(all, Math.min(G.opts.count, all.length)); G.round = 0; G.rounds = G.qs.length; emNext(ctx, G);
  },
  act(ctx, G, pid, t, d) {
    if (t === 'g' && G.ph === 'q' && !G.got[pid]) {
      const g = String(d || '').trim().slice(0, 40); if (!g) return;
      const r = judge(g, G.cur.a);
      if (r === 'yes') { const k = Object.keys(G.got).length; G.got[pid] = k + 1; const p = Math.max(5 - k, 1); G.pts[pid] += p; G.gain[pid] = p; G.feed.push({ f: pid, x: 'عرفه ✅', k: 'ok' }); ctx.fx('correct'); if (allIn(ctx, G.got)) emReveal(ctx, G); }
      else { G.tries[pid] = (G.tries[pid] || 0) + 1; G.close[pid] = r === 'close' ? (G.close[pid] || 0) + 1 : (G.close[pid] || 0); }
    } else if (t === 'next' && G.ph === 'a' && pid === ctx.host) emNext(ctx, G);
  },
  tick(ctx, G, force) {
    if (G.ph === 'q' && !G.hint && ctx.now() > G.dl - G.dur * 500) { G.hint = true; return true; }
    if (!expired(ctx, G, force)) return false; if (G.ph === 'q') emReveal(ctx, G); else emNext(ctx, G); return true;
  },
  view(ctx, G) { const a = G.cur.a[0]; return { ...basic(G), e: G.cur.e, k: G.cur.k, hint: G.hint ? { first: a[0], len: a.replace(/\s/g, '').length, words: a.split(' ').length } : null, got: G.got, feed: G.feed.slice(-8), ans: G.ph === 'a' ? a : null, gain: G.gain }; },
  pv(ctx, G, pid) { return { got: !!G.got[pid], close: G.close[pid] || 0, tries: G.tries[pid] || 0 }; },
  View: EmojiView,
};
function emNext(ctx, G) { if (G.round >= G.rounds) return ctx.finish({}); G.cur = G.qs[G.round]; G.round++; G.got = {}; G.gain = {}; G.feed = []; G.tries = {}; G.close = {}; G.hint = false; setPh(ctx, G, 'q', G.opts.time); ctx.fx('pop'); }
function emReveal(ctx, G) { setPh(ctx, G, 'a', 7); ctx.fx('reveal'); }
function EmojiView({ v, pv }) {
  const R = useRoom(); useFx(v.fx);
  return <Phase icon="🧩" title={EMO_T[v.k] || 'خمّن'} sub={`لغز ${v.round} من ${v.rounds}`}>
    <div class="emo">{v.e}</div>
    {v.hint && v.ph === 'q' ? <Note>تلميح: يبدأ بـ «{v.hint.first}»، {v.hint.len} حروف{v.hint.words > 1 ? `، ${v.hint.words} كلمات` : ''}</Note> : null}
    {v.ph === 'a' ? <div class="endcard"><small>الجواب</small><Big>{v.ans}</Big></div> : pv && pv.got ? <Note kind="ok">عرفته ✅ ننتظر الباقين</Note>
      : <><SendBox key={v.round} autoFocus placeholder="وش هو؟" max={40} onSend={g => R.room.gact('g', g)} btn="خمّن" />{pv && pv.close ? <Note kind="warn">قريب! 🔥</Note> : pv && pv.tries ? <Note>لا مو هو… جرّب مرة ثانية</Note> : null}</>}
    <div class="gotrow">{v.ids.map(id => <span key={id} class={v.got[id] ? 'got' : ''}><Av p={R.P[id]} size={24} dim={!v.got[id]} />{v.got[id] ? `#${v.got[id]}` : ''}</span>)}</div>
    {v.ph === 'a' ? <><Gains gain={v.gain} />{R.isHost ? <Btn onClick={() => R.room.gact('next')}>التالي ⏭️</Btn> : null}</> : null}
  </Phase>;
}

// =====================================================================
// الشفرة — Codenames-style
// =====================================================================
const cnWords = () => { const out = new Set(); for (const c of Object.values(WORDS)) if (c.cn !== 0) for (const w of split(c.w)) if (!w.includes(' ') && w.length <= 9) out.add(w); return [...out]; };
const TEAM = { A: { n: 'الوردي', c: '#ff3fa4' }, B: { n: 'السماوي', c: '#2ef2ff' }, T: { n: 'الشلة', c: '#45f59a' } };
export const codenames = {
  id: 'codenames', name: 'الشفرة', e: '🕶️', c: '#a78bfa', min: 2, max: 12, tag: 'كلمة وحدة تفتح كذا كلمة',
  how: ['فيه ٢٥ كلمة، قائد الفريق يعرف كلمات فريقه', 'القائد يعطي كلمة وحدة ورقم: كم كلمة تتعلق فيها', 'الفريق يكشف الكلمات… وانتبهوا من الكلمة القاتلة ☠️'],
  options: [opt('mode', 'طريقة اللعب', [['teams', '⚔️ فريقين (٤ وفوق)'], ['coop', '🤝 كلنا فريق واحد']], 'teams'), opt('turns', 'عدد الأدوار (للفريق الواحد)', nums([7, 8, 9, 10]), 8), opt('ct', 'وقت القائد', nums([60, 90, 120], ' ث'), 90), opt('gt', 'وقت التخمين', nums([60, 90, 120], ' ث'), 90)],
  setup(ctx, G) {
    const ids = ctx.shuffle(ctx.active()); G.coop = G.opts.mode === 'coop' || ids.length < 4;
    G.words = ctx.sample(cnWords(), 25); G.rev = Array(25).fill(null); G.sel = {}; G.log = [];
    if (G.coop) {
      G.team = Object.fromEntries(ids.map(id => [id, 'T'])); G.spy = { T: ids[0] };
      G.key = ctx.shuffle([...Array(9).fill('T'), ...Array(3).fill('X'), ...Array(13).fill('N')]);
      G.act = 'T'; G.turnsLeft = G.opts.turns; G.rounds = G.opts.turns; G.round = 1;
    } else {
      G.team = {}; ids.forEach((id, i) => { G.team[id] = i % 2 ? 'B' : 'A'; });
      G.spy = { A: ids[0], B: ids[1] };
      G.key = ctx.shuffle([...Array(9).fill('A'), ...Array(8).fill('B'), ...Array(7).fill('N'), 'X']);
      G.act = 'A'; G.round = 1; G.rounds = 0;
    }
    cnClue(ctx, G);
  },
  act(ctx, G, pid, t, d) {
    const tm = G.team[pid]; if (!tm) return;
    const isSpy = G.spy[tm] === pid;
    if (t === 'clue' && G.ph === 'clue' && tm === G.act && isSpy && d) {
      const w = String(d.w || '').trim().split(/\s+/)[0].slice(0, 20); const n = Math.max(0, Math.min(9, parseInt(d.n, 10) || 0)); if (!w) return;
      G.clue = { w, n, by: pid }; G.left = n === 0 ? 25 : n + 1; G.sel = {}; G.log.push({ f: pid, x: `🗝️ «${w}» × ${n}` }); setPh(ctx, G, 'guess', G.opts.gt); ctx.fx('go');
    } else if (t === 'sel' && G.ph === 'guess' && tm === G.act && !isSpy && G.rev[d] == null && G.words[d]) { G.sel[pid] = G.sel[pid] === d ? null : d; }
    else if (t === 'rev' && G.ph === 'guess' && tm === G.act && !isSpy && G.rev[d] == null && G.words[d]) cnReveal(ctx, G, d, pid);
    else if (t === 'pass' && G.ph === 'guess' && tm === G.act && !isSpy) cnSwitch(ctx, G);
  },
  tick(ctx, G, force) {
    if (G.ph === 'clue' && !ctx.on(G.spy[G.act]) && !force) { const alt = Object.keys(G.team).find(id => G.team[id] === G.act && ctx.on(id)); if (alt && alt !== G.spy[G.act] && ctx.now() - G.dl + G.dur * 1000 > 8000) { G.spy[G.act] = alt; return true; } }
    if (!expired(ctx, G, force)) return false;
    if (G.ph === 'clue') { G.clue = { w: '—', n: 1, by: G.spy[G.act] }; G.left = 1; setPh(ctx, G, 'guess', G.opts.gt); }
    else if (G.ph === 'guess') cnSwitch(ctx, G);
    return true;
  },
  view(ctx, G) {
    const over = G.ph === 'over';
    return { ...basic(G), coop: G.coop, words: G.words, rev: G.rev, team: G.team, spy: G.spy, act: G.act, clue: G.ph === 'guess' ? G.clue : null, left: G.left, sel: G.sel, log: G.log.slice(-6), turnsLeft: G.turnsLeft, keyAll: over ? G.key : null, win: G.win || null, counts: cnCounts(G) };
  },
  pv(ctx, G, pid) { const tm = G.team[pid]; return tm && G.spy[tm] === pid ? { key: G.key } : null; },
  View: CodenamesView,
};
function cnCounts(G) { const c = {}; G.key.forEach((k, i) => { c[k] = c[k] || { all: 0, found: 0 }; c[k].all++; if (G.rev[i]) c[k].found++; }); return c; }
function cnClue(ctx, G) { G.clue = null; G.sel = {}; setPh(ctx, G, 'clue', G.opts.ct); }
function cnReveal(ctx, G, i, pid) {
  const k = G.key[i]; G.rev[i] = k; G.sel = {};
  G.log.push({ f: pid, x: `كشف «${G.words[i]}» ${k === 'X' ? '☠️' : k === G.act ? '✅' : k === 'N' ? '😐' : '❌'}` });
  const c = cnCounts(G);
  if (k === 'X') return cnEnd(ctx, G, G.coop ? null : (G.act === 'A' ? 'B' : 'A'), 'الكلمة القاتلة ☠️');
  if (G.coop) { if (c.T.found === c.T.all) return cnEnd(ctx, G, 'T', 'لقيتوا كل الكلمات 🎉'); }
  else { if (c.A.found === c.A.all) return cnEnd(ctx, G, 'A', 'خلّصوا كلماتهم'); if (c.B.found === c.B.all) return cnEnd(ctx, G, 'B', 'خلّصوا كلماتهم'); }
  if (k === G.act) { ctx.fx('correct'); G.left--; if (G.left <= 0) cnSwitch(ctx, G); }
  else { ctx.fx('wrong'); cnSwitch(ctx, G); }
}
function cnSwitch(ctx, G) {
  if (G.coop) { G.turnsLeft--; G.round++; if (G.turnsLeft <= 0) return cnEnd(ctx, G, null, 'خلصت الأدوار ⌛'); }
  else { G.act = G.act === 'A' ? 'B' : 'A'; G.round++; }
  cnClue(ctx, G);
}
function cnEnd(ctx, G, win, why) {
  G.win = { t: win, why }; const c = cnCounts(G);
  for (const id of Object.keys(G.team)) {
    if (G.coop) G.pts[id] = c.T.found + (win === 'T' ? 5 : 0);
    else G.pts[id] = (G.team[id] === win ? 5 : 0) + c[G.team[id]].found;
  }
  setPh(ctx, G, 'over', 0); ctx.fx(win ? 'win' : 'lose');
  ctx.finish({ note: win ? `فاز فريق ${TEAM[win].n} — ${why}` : `خسرتوا — ${why}` });
}
function CodenamesView({ v, pv }) {
  const R = useRoom(); const me = R.me; useFx(v.fx);
  const tm = v.team[me]; const isSpy = tm && v.spy[tm] === me; const myTurn = tm === v.act;
  const canGuess = v.ph === 'guess' && myTurn && !isSpy;
  const key = pv && pv.key; const mySel = v.sel[me];
  const teamRow = t => <div class={`cn-team ${v.act === t ? 'act' : ''}`} style={{ '--c': TEAM[t].c }}><b>{TEAM[t].n}</b>{Object.keys(v.team).filter(id => v.team[id] === t).map(id => <span key={id} class="cn-mem"><Av p={R.P[id]} size={24} />{v.spy[t] === id ? '🕶️' : ''}</span>)}<span class="cn-left">{v.counts[t] ? `${v.counts[t].found}/${v.counts[t].all}` : ''}</span></div>;
  return <div class="cn">
    <div class="cn-teams">{v.coop ? teamRow('T') : <>{teamRow('A')}{teamRow('B')}</>}{v.coop ? <span class="cn-turns">باقي {v.turnsLeft} أدوار</span> : null}</div>
    <div class="cn-status">{v.ph === 'clue' ? (isSpy && myTurn ? <ClueBox /> : <Note>قائد فريق {TEAM[v.act].n} <Who id={v.spy[v.act]} size={22} /> يفكّر في الشفرة… 🤔</Note>)
      : v.clue ? <div class="cn-clue" style={{ '--c': TEAM[v.act].c }}>🗝️ <b>{v.clue.w}</b> × {v.clue.n} <small>باقي {v.left >= 25 ? '∞' : v.left} تخمينات</small></div> : null}</div>
    <div class="cn-grid">{v.words.map((w, i) => {
      const r = v.rev[i]; const k = key ? key[i] : null; const sels = Object.keys(v.sel).filter(id => v.sel[id] === i);
      return <button type="button" key={i} class={`cn-card ${r ? 'rev k' + r : ''} ${!r && k ? 'spy k' + k : ''} ${mySel === i ? 'mine' : ''}`} disabled={!canGuess || r} onClick={() => R.room.gact('sel', i)}>
        <span>{w}</span>{sels.length ? <span class="cn-sels">{sels.map(id => <Av key={id} p={R.P[id]} size={16} />)}</span> : null}</button>;
    })}</div>
    {canGuess ? <div class="row">{mySel != null ? <Btn big onClick={() => R.room.gact('rev', mySel)}>اكشف «{v.words[mySel]}» ✋</Btn> : <Note>اختار كلمة…</Note>}<Btn kind="ghost" onClick={() => R.room.gact('pass')}>نكتفي ⏭️</Btn></div> : null}
    {isSpy ? <Note kind="info">أنت القائد 🕶️ الألوان الباهتة هي المفتاح، لا تأشر عليها!</Note> : null}
    <Feed items={v.log} />
  </div>;
}
function ClueBox() {
  const R = useRoom(); const [w, setW] = useState(''); const [n, setN] = useState(1);
  return <form class="cluebox" onSubmit={e => { e.preventDefault(); if (w.trim()) R.room.gact('clue', { w, n }); }}>
    <input value={w} maxLength={20} placeholder="الشفرة (كلمة وحدة)" onInput={e => setW(e.currentTarget.value.replace(/\s/g, ''))} dir="auto" />
    <div class="nsel">{[1, 2, 3, 4, 5].map(x => <button type="button" key={x} class={n === x ? 'on' : ''} onClick={() => setN(x)}>{x}</button>)}</div>
    <Btn type="submit" disabled={!w.trim()}>أرسل 🗝️</Btn>
  </form>;
}

// =====================================================================
// مقياس — Wavelength
// =====================================================================
const zonePts = d => (d <= 4 ? 4 : d <= 9 ? 3 : d <= 15 ? 2 : 0);
export const wave = {
  id: 'wave', name: 'مقياس', e: '📡', c: '#ff8a3d', min: 2, max: 12, tag: 'وين تقع الإجابة على المقياس؟',
  how: ['واحد يشوف مكان سري على مقياس بين شيئين (مثل بارد ↔ حار)', 'يعطي تلميح: شي يقع بهالمكان بالضبط', 'الباقين يحرّكون المؤشر… كل ما قربتوا زادت النقاط'],
  options: [opt('mode', 'طريقة اللعب', [['ffa', '🙋 كل واحد لحاله'], ['coop', '🤝 كلنا مع بعض'], ['teams', '⚔️ فريقين']], 'ffa'), opt('laps', 'كم مرة يصير كل واحد الدليل', nums([1, 2]), 1), opt('ct', 'وقت التلميح', nums([45, 60, 90], ' ث'), 60)],
  setup(ctx, G) {
    const ids = ctx.shuffle(ctx.active()); G.mode = G.opts.mode === 'teams' && ids.length < 4 ? 'coop' : G.opts.mode;
    G.team = {}; ids.forEach((id, i) => { G.team[id] = G.mode === 'teams' ? (i % 2 ? 'B' : 'A') : 'T'; });
    if (G.mode === 'teams') { const A = ids.filter(id => G.team[id] === 'A'), B = ids.filter(id => G.team[id] === 'B'); G.order = []; for (let i = 0; i < Math.max(A.length, B.length) * 2; i++) { const arr = i % 2 ? B : A; G.order.push(arr[Math.floor(i / 2) % arr.length]); } G.order = G.order.slice(0, ids.length); }
    else G.order = ids;
    G.cards = ctx.shuffle(lines(WAVE).map(l => split(l))); G.round = 0; G.rounds = G.order.length * G.opts.laps; G.tpts = { A: 0, B: 0, T: 0 };
    wvNext(ctx, G);
  },
  act(ctx, G, pid, t, d) {
    const psy = G.psy;
    if (t === 'clue' && G.ph === 'clue' && pid === psy) { const x = String(d || '').trim().slice(0, 40); if (!x) return; G.clue = x; setPh(ctx, G, 'guess', 75); ctx.fx('go'); return; }
    if (G.ph === 'guess' && pid !== psy && G.team[pid]) {
      const x = Math.max(0, Math.min(100, Math.round(+d || 0)));
      if (G.mode === 'ffa') { if (t === 'move' && !G.lock[pid]) G.g[pid] = x; if (t === 'lock') { if (d != null) G.g[pid] = x; G.lock[pid] = 1; const others = ctx.active().filter(id => id !== psy); if (others.every(id => G.lock[id])) wvReveal(ctx, G); } }
      else if (G.team[pid] === G.team[psy]) { if (t === 'move') G.needle = x; if (t === 'lock') { if (d != null) G.needle = x; if (G.mode === 'teams') { setPh(ctx, G, 'lr', 25); } else wvReveal(ctx, G); } }
      return;
    }
    if (t === 'lr' && G.ph === 'lr' && G.team[pid] && G.team[pid] !== G.team[psy] && (d === 'l' || d === 'r')) { G.lr = d; wvReveal(ctx, G); return; }
    if (t === 'next' && G.ph === 'reveal' && pid === ctx.host) wvNext(ctx, G);
  },
  tick(ctx, G, force) {
    if (G.ph === 'clue' && !ctx.on(G.psy) && !force) { wvNext(ctx, G); return true; }
    if (!expired(ctx, G, force)) return false;
    if (G.ph === 'clue') wvNext(ctx, G);
    else if (G.ph === 'guess') { if (G.mode === 'teams') setPh(ctx, G, 'lr', 25); else wvReveal(ctx, G); }
    else if (G.ph === 'lr') wvReveal(ctx, G);
    else if (G.ph === 'reveal') wvNext(ctx, G);
    return true;
  },
  view(ctx, G) {
    const rev = G.ph === 'reveal';
    return { ...basic(G), mode: G.mode, team: G.team, psy: G.psy, card: G.card, clue: G.clue, needle: G.needle, lockN: Object.keys(G.lock || {}).length, lock: G.lock, target: rev ? G.target : null, guesses: rev && G.mode === 'ffa' ? G.g : null, gain: rev ? G.gain : null, lr: G.lr, tpts: G.tpts };
  },
  pv(ctx, G, pid) { return pid === G.psy && G.ph !== 'reveal' ? { target: G.target } : (G.mode === 'ffa' && G.g ? { mine: G.g[pid] != null ? G.g[pid] : null, locked: !!(G.lock && G.lock[pid]) } : null); },
  View: WaveView,
};
function wvNext(ctx, G) {
  if (G.round >= G.rounds) return ctx.finish({});
  G.psy = G.order[G.round % G.order.length]; G.round++;
  G.card = G.cards[(G.round - 1) % G.cards.length]; G.target = ctx.rnd(6, 94); G.clue = null; G.needle = 50; G.g = {}; G.lock = {}; G.lr = null; G.gain = null;
  setPh(ctx, G, 'clue', G.opts.ct); ctx.fx('pop');
}
function wvReveal(ctx, G) {
  G.gain = {}; const add = (id, n) => { if (n) { G.pts[id] += n; G.gain[id] = (G.gain[id] || 0) + n; } };
  const team = G.team[G.psy];
  if (G.mode === 'ffa') {
    const gs = Object.entries(G.g); let tot = 0;
    for (const [id, x] of gs) { const p = zonePts(Math.abs(x - G.target)); add(id, p); tot += p; }
    add(G.psy, gs.length ? Math.ceil(tot / gs.length) : 0);
  } else {
    const p = zonePts(Math.abs(G.needle - G.target)); G.tpts[team] += p;
    for (const id of Object.keys(G.team)) if (G.team[id] === team) add(id, p);
    if (G.mode === 'teams' && G.lr && p < 4) { const right = G.target < G.needle ? 'r' : 'l'; if (G.lr === right) { const other = team === 'A' ? 'B' : 'A'; G.tpts[other] += 1; for (const id of Object.keys(G.team)) if (G.team[id] === other) add(id, 1); } }
  }
  setPh(ctx, G, 'reveal', 0); ctx.fx('reveal');
}
function WaveView({ v, pv }) {
  const R = useRoom(); const me = R.me; useFx(v.fx);
  const isPsy = v.psy === me; const myTeam = v.team[me];
  const sameTeam = myTeam && myTeam === v.team[v.psy];
  const [loc, setLoc] = useState(50);
  useEffect(() => { setLoc(pv && pv.mine != null ? pv.mine : 50); }, [v.round]);
  const shared = v.mode !== 'ffa';
  const canMove = v.ph === 'guess' && !isPsy && myTeam && (shared ? sameTeam : !(pv && pv.locked));
  const last = useRef(0);
  const move = x => { if (shared) { const n = Date.now(); if (n - last.current > 220) { last.current = n; R.room.gact('move', x); } } else setLoc(x); };
  const val = shared ? v.needle : loc;
  const target = isPsy && pv ? pv.target : v.target;
  const others = v.guesses ? Object.entries(v.guesses).map(([id, x]) => ({ id, x })) : [];
  return <Phase icon="📡" title={<span>{v.card[0]} ↔ {v.card[1]}</span>} sub={<span>الدليل: <Who id={v.psy} size={22} /> — جولة {v.round} من {v.rounds}</span>}>
    <Dial a={v.card[0]} b={v.card[1]} val={v.ph === 'clue' ? null : val} target={target} onMove={canMove ? move : null} marks={others} showTarget={isPsy || v.ph === 'reveal'} />
    {v.clue ? <div class="wv-clue">«{v.clue}»</div> : null}
    {v.ph === 'clue' ? (isPsy ? <SendBox autoFocus placeholder="تلميحك: شي يقع عند المؤشر" max={40} onSend={x => R.room.gact('clue', x)} /> : <Note>الدليل يفكّر بتلميح… 🤔</Note>) : null}
    {v.ph === 'guess' && canMove ? <Btn big onClick={() => R.room.gact('lock', shared ? v.needle : loc)}>ثبّت هنا 📍</Btn> : null}
    {v.ph === 'guess' && !shared && pv && pv.locked ? <Note kind="ok">ثبّتّ! ننتظر الباقين ({v.lockN})</Note> : null}
    {v.ph === 'guess' && shared && !canMove && !isPsy ? <Note>فريق الدليل يحرّكون المؤشر…</Note> : null}
    {v.ph === 'lr' ? (myTeam && myTeam !== v.team[v.psy] ? <div class="row"><Btn onClick={() => R.room.gact('lr', 'r')}>الهدف يمين ➡️</Btn><Btn onClick={() => R.room.gact('lr', 'l')}>⬅️ الهدف يسار</Btn></div> : <Note>الفريق الثاني يخمّن: يمين ولا يسار؟</Note>) : null}
    {v.ph === 'reveal' ? <><Gains gain={v.gain} />{v.mode === 'teams' ? <p class="muted">الوردي {v.tpts.A} — السماوي {v.tpts.B}</p> : null}{R.isHost ? <Btn onClick={() => R.room.gact('next')}>التالي ⏭️</Btn> : null}</> : null}
  </Phase>;
}
// semicircle: x=0 at the right end, x=100 at the left end (reads right-to-left)
function Dial({ a, b, val, target, onMove, marks, showTarget }) {
  const ref = useRef(); const R = useRoom();
  const W = 320, H = 180, cx = 160, cy = 165, r = 140;
  const pt = (x, rr = r) => { const th = Math.PI * x / 100; return [cx + rr * Math.cos(th), cy - rr * Math.sin(th)]; };
  const wedge = (x0, x1, rr) => { const [ax, ay] = pt(Math.max(0, x0), rr), [bx, by] = pt(Math.min(100, x1), rr); return `M${cx},${cy} L${ax},${ay} A${rr},${rr} 0 0,0 ${bx},${by} Z`; };
  const fromEvt = e => { const s = ref.current.getBoundingClientRect(); const px = (e.clientX - s.left) * W / s.width, py = (e.clientY - s.top) * H / s.height; let th = Math.atan2(cy - py, px - cx); if (th < 0) th = px < cx ? Math.PI : 0; return Math.round(Math.max(0, Math.min(100, th / Math.PI * 100))); };
  const dragging = useRef(false);
  const down = e => { if (!onMove) return; dragging.current = true; try { ref.current.setPointerCapture(e.pointerId); } catch (er) { } onMove(fromEvt(e)); };
  const mv = e => { if (dragging.current && onMove) onMove(fromEvt(e)); };
  const up = () => { dragging.current = false; };
  return <div class="dial"><svg ref={ref} viewBox={`0 0 ${W} ${H}`} onPointerDown={down} onPointerMove={mv} onPointerUp={up} onPointerCancel={up} style={{ touchAction: onMove ? 'none' : 'auto' }} role="slider" aria-valuemin="0" aria-valuemax="100" aria-valuenow={val || 0}>
    <path d={wedge(0, 100, r)} class="dial-bg" />
    {showTarget && target != null ? <g class="dial-zones"><path d={wedge(target - 15, target + 15, r)} class="z2" /><path d={wedge(target - 9, target + 9, r)} class="z3" /><path d={wedge(target - 4, target + 4, r)} class="z4" /></g> : null}
    <path d={wedge(0, 100, 34)} class="dial-hub" />
    {marks.map(m => { const [x, y] = pt(m.x, r - 8); const p = R.P[m.id]; return <g key={m.id}><line x1={cx} y1={cy} x2={x} y2={y} class="dial-mark" style={{ stroke: p ? p.col : '#fff' }} /><text x={x} y={y - 4} class="dial-emo" text-anchor="middle">{p ? p.av : ''}</text></g>; })}
    {val != null ? (() => { const [x, y] = pt(val, r - 4); return <line x1={cx} y1={cy} x2={x} y2={y} class="dial-needle" />; })() : null}
  </svg><div class="dial-labels"><span>{a}</span><span>{b}</span></div></div>;
}

// =====================================================================
// قالوا الناس — Family Feud
// =====================================================================
function feudParse(l) {
  const [q, rest] = l.split('|'); const ans = rest.split(';').map(x => { const [a, p, al] = x.split('='); return { a: a.trim(), p: +p || 0, k: [a.trim(), ...(al ? alts(al) : [])] }; }).sort((x, y) => y.p - x.p);
  return { q: q.trim(), ans };
}
function feudMatch(g, A) {
  const lg = loose(g);
  for (let i = 0; i < A.length; i++) {
    if (judge(g, A[i].k) === 'yes') return i;
    for (const k of A[i].k) { const lk = loose(k); if (lk.length >= 3 && lg.includes(lk)) return i; }
  }
  return -1;
}
export const feud = {
  id: 'feud', name: 'قالوا الناس', e: '📊', c: '#ffb02e', min: 2, max: 12, tag: 'خمّن أكثر شي قالوه الناس',
  how: ['يطلع سؤال مثل: شي تاخذه معك للبر', 'خمّنوا أشهر الأجوبة، كل جواب له نقاط حسب شهرته', 'ثلاث غلطات ❌ وتطلع من السؤال'],
  options: [opt('mode', 'طريقة اللعب', [['ffa', '🙋 كل واحد لحاله'], ['teams', '⚔️ فريقين']], 'ffa'), opt('rounds', 'عدد الأسئلة', nums([4, 5, 6, 8]), 5), opt('time', 'وقت السؤال', nums([40, 60, 90], ' ث'), 60)],
  setup(ctx, G) {
    const ids = ctx.shuffle(ctx.active()); G.teams = G.opts.mode === 'teams' && ids.length >= 2;
    G.team = {}; if (G.teams) ids.forEach((id, i) => { G.team[id] = i % 2 ? 'B' : 'A'; });
    G.tpts = { A: 0, B: 0 };
    G.qs = ctx.sample(lines(FEUD).map(feudParse), G.opts.rounds); G.round = 0; G.rounds = G.qs.length; G.start = 'A'; fdNext(ctx, G);
  },
  act(ctx, G, pid, t, d) {
    if (t === 'next' && G.ph === 'a' && pid === ctx.host) return fdNext(ctx, G);
    if (t !== 'g') return;
    const g = String(d || '').trim().slice(0, 40); if (!g) return;
    const A = G.cur.ans;
    if (!G.teams) {
      if (G.ph !== 'q' || (G.x[pid] || 0) >= 3) return;
      const i = feudMatch(g, A);
      if (i >= 0 && !G.open[i]) { G.open[i] = { by: pid }; G.pts[pid] += A[i].p; G.gain[pid] = (G.gain[pid] || 0) + A[i].p; ctx.fx('correct'); }
      else if (i >= 0) { G.dup[pid] = (G.dup[pid] || 0) + 1; }
      else { G.x[pid] = (G.x[pid] || 0) + 1; G.feed.push({ f: pid, x: `${g} ❌` }); ctx.fx('buzz'); }
      if (A.every((_, j) => G.open[j]) || ctx.active().every(id => (G.x[id] || 0) >= 3)) fdReveal(ctx, G);
      return;
    }
    const tm = G.team[pid]; if (!tm) return;
    if (G.ph === 'q' && tm === G.act) {
      const i = feudMatch(g, A);
      if (i >= 0 && !G.open[i]) { G.open[i] = { by: pid }; G.pot += A[i].p; ctx.fx('correct'); if (A.every((_, j) => G.open[j])) { fdBank(ctx, G, G.act); } }
      else if (i < 0) { G.tx++; G.feed.push({ f: pid, x: `${g} ❌` }); ctx.fx('buzz'); if (G.tx >= 3) { setPh(ctx, G, 'steal', 30); ctx.fx('alarm'); } }
    } else if (G.ph === 'steal' && tm !== G.act) {
      const i = feudMatch(g, A); G.feed.push({ f: pid, x: `سرقة: ${g} ${i >= 0 && !G.open[i] ? '✅' : '❌'}` });
      if (i >= 0 && !G.open[i]) { G.open[i] = { by: pid }; G.pot += A[i].p; fdBank(ctx, G, tm); } else fdBank(ctx, G, G.act);
    }
  },
  tick(ctx, G, force) {
    if (!expired(ctx, G, force)) return false;
    if (G.ph === 'q') { if (G.teams) { setPh(ctx, G, 'steal', 30); } else fdReveal(ctx, G); }
    else if (G.ph === 'steal') fdBank(ctx, G, G.act);
    else if (G.ph === 'a') fdNext(ctx, G);
    return true;
  },
  view(ctx, G) {
    const A = G.cur.ans; const showAll = G.ph === 'a';
    return { ...basic(G), q: G.cur.q, n: A.length, slots: A.map((x, i) => (G.open[i] || showAll ? { a: x.a, p: x.p, by: G.open[i] ? G.open[i].by : null } : null)), x: G.x, tx: G.tx, teams: G.teams, team: G.team, act: G.act, pot: G.pot, tpts: G.tpts, feed: G.feed.slice(-6), gain: G.ph === 'a' ? G.gain : null, banked: G.banked || null };
  },
  pv(ctx, G, pid) { return { dup: G.dup ? G.dup[pid] || 0 : 0 }; },
  View: FeudView,
};
function fdNext(ctx, G) {
  if (G.round >= G.rounds) return ctx.finish({});
  G.cur = G.qs[G.round]; G.round++; G.open = {}; G.x = {}; G.dup = {}; G.gain = {}; G.feed = []; G.pot = 0; G.tx = 0; G.banked = null;
  if (G.teams) { G.act = G.round % 2 ? G.start : (G.start === 'A' ? 'B' : 'A'); }
  setPh(ctx, G, 'q', G.opts.time); ctx.fx('pop');
}
function fdBank(ctx, G, tm) {
  G.tpts[tm] += G.pot; G.banked = { t: tm, p: G.pot };
  for (const id of Object.keys(G.team)) G.pts[id] = G.tpts[G.team[id]];
  G.gain = {}; for (const id of Object.keys(G.team)) if (G.team[id] === tm && G.pot) G.gain[id] = G.pot;
  setPh(ctx, G, 'a', 0); ctx.fx('win');
}
function fdReveal(ctx, G) { setPh(ctx, G, 'a', 0); ctx.fx('reveal'); }
function FeudView({ v, pv }) {
  const R = useRoom(); const me = R.me; useFx(v.fx);
  const tm = v.team[me];
  const canGuess = v.teams ? ((v.ph === 'q' && tm === v.act) || (v.ph === 'steal' && tm && tm !== v.act)) : (v.ph === 'q' && (v.x[me] || 0) < 3 && v.ids.includes(me));
  return <Phase icon="📊" title={v.q} sub={`سؤال ${v.round} من ${v.rounds}`}>
    {v.teams ? <div class="fd-teams"><span class={`fd-t A ${v.act === 'A' ? 'act' : ''}`}>الوردي {v.tpts.A}</span><span class="fd-pot">بالصندوق: {v.pot}</span><span class={`fd-t B ${v.act === 'B' ? 'act' : ''}`}>السماوي {v.tpts.B}</span></div> : null}
    <div class="fd-board">{v.slots.map((s, i) => <div key={i} class={`fd-slot ${s ? 'open' : ''} ${s && !s.by ? 'missed' : ''}`}><span class="fd-n">{i + 1}</span>{s ? <><b>{s.a}</b><span class="fd-p">{s.p}</span>{s.by ? <Av p={R.P[s.by]} size={20} /> : null}</> : <span class="fd-q" />}</div>)}</div>
    {v.teams ? <div class="fd-x">{'❌'.repeat(v.tx)}{v.ph === 'steal' ? <b> فرصة سرقة للفريق {v.act === 'A' ? 'السماوي' : 'الوردي'}!</b> : null}</div> : <div class="fd-xs">{v.ids.map(id => <span key={id}><Av p={R.P[id]} size={22} dim={(v.x[id] || 0) >= 3} />{'❌'.repeat(v.x[id] || 0)}</span>)}</div>}
    {canGuess ? <SendBox key={v.round + v.ph} autoFocus placeholder={v.ph === 'steal' ? 'جواب السرقة (فرصة وحدة)' : 'وش قالوا الناس؟'} max={40} onSend={g => R.room.gact('g', g)} btn="جرّب" /> : v.ph !== 'a' ? <Note>{v.teams ? 'دور الفريق الثاني…' : 'خلصت محاولاتك 😅'}</Note> : null}
    {pv && pv.dup && v.ph === 'q' ? <Note kind="warn">هذي انقالت قبل!</Note> : null}
    <Feed items={v.feed} />
    {v.ph === 'a' ? <>{v.banked ? <Note kind="ok">الفريق {v.banked.t === 'A' ? 'الوردي' : 'السماوي'} أخذ {v.banked.p} نقطة</Note> : null}<Gains gain={v.gain} />{R.isHost ? <Btn onClick={() => R.room.gact('next')}>التالي ⏭️</Btn> : null}</> : null}
  </Phase>;
}
