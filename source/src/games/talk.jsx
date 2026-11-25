import { useState, useEffect } from 'preact/hooks';
import { useRoom, Btn, Who, Av, PlayerGrid, Done, SendBox, Reveal, Phase, Big, Note, Feed, useFx, usePhase } from '../ui/kit.jsx';
import { pool, charPool, wordCats, packChoices, setPh, expired, allIn, basic, opt, nums, yesno, split } from './common.jsx';
import { CHARS } from '../data/chars.js';
import { WYR, MLT, BLUFF } from '../data/party.js';
import { judge, loose, lines } from '../core/util.js';
import { say } from '../core/audio.js';

const chars = () => Object.entries(CHARS).map(([k, c]) => [k, `${c.e} ${c.n}`]);
const nextIdx = (ctx, order, i) => { for (let k = 1; k <= order.length; k++) { const j = (i + k) % order.length; if (ctx.on(order[j])) return j; } return (i + 1) % order.length; };
const countVotes = (votes) => { const c = {}; Object.values(votes).forEach(t => { if (t) c[t] = (c[t] || 0) + 1; }); return c; };
const topOf = c => { const max = Math.max(0, ...Object.values(c)); return { max, top: Object.keys(c).filter(k => c[k] === max && max > 0) }; };

// =====================================================================
// برا السالفة — The Imposter
// =====================================================================
export const imposter = {
  id: 'imposter', name: 'برا السالفة', e: '🕵️', c: '#ff3fa4', min: 3, max: 12, tag: 'الكل يعرف السالفة إلا واحد',
  how: ['كل واحد يشوف الكلمة السرية… إلا اللي برا السالفة', 'اسألوا بعض أو اكتبوا تلميح بدون ما تفضحون الكلمة', 'صوّتوا مين برا السالفة، ولو انكشف يحاول يخمّن الكلمة'],
  options: packs => [
    opt('cat', 'التصنيف', [['mix', '🎲 عشوائي'], ...wordCats(c => c.imp !== 0), ...packChoices(packs)], 'mix'),
    opt('mode', 'طريقة اللعب', [['ask', '🎤 أسئلة بالصوت'], ['clue', '✍️ تلميح مكتوب']], 'ask'),
    opt('rounds', 'عدد الجولات', nums([1, 2, 3, 4, 5, 6]), 3),
    opt('laps', 'كم لفّة أسئلة أو تلميحات', nums([1, 2, 3]), 1),
    opt('imps', 'كم واحد برا السالفة', [[1, 'واحد'], [2, 'اثنين (لـ٦ وفوق)']], 1),
    opt('hint', 'اللي برا يعرف التصنيف؟', yesno, true),
  ],
  setup(ctx, G) { G.round = 0; G.rounds = G.opts.rounds; G.used = []; impRound(ctx, G); },
  act(ctx, G, pid, t, d) {
    const inR = G.rids.includes(pid);
    if (t === 'ready' && G.ph === 'see' && inR) { G.ready[pid] = true; if (allIn(ctx, pick(G.ready, G.rids))) impPlay(ctx, G); }
    else if (t === 'next' && G.ph === 'ask') { const pr = G.pairs[G.turn]; if (pr && (pid === pr[0] || pid === pr[1] || pid === ctx.host)) impNextPair(ctx, G); }
    else if (t === 'tovote' && (G.ph === 'ask' || G.ph === 'clue') && pid === ctx.host) impVote(ctx, G);
    else if (t === 'clue' && G.ph === 'clue' && G.order[G.turn] === pid) {
      const x = String(d || '').trim().slice(0, 24); if (!x) return;
      G.clues.push({ f: pid, x }); ctx.fx('pop'); impNextClue(ctx, G);
    }
    else if (t === 'vote' && G.ph === 'vote' && inR && d !== pid && G.rids.includes(d)) { G.votes[pid] = d; ctx.fx('vote'); if (allIn(ctx, pick(G.votes, G.rids))) impReveal(ctx, G); }
    else if (t === 'guess' && G.ph === 'guess' && pid === G.caught) { G.guess = String(d); impEnd(ctx, G); }
    else if (t === 'nextround' && G.ph === 'end' && pid === ctx.host) { if (G.round >= G.rounds) ctx.finish({ note: 'انتهت برا السالفة' }); else impRound(ctx, G); }
  },
  tick(ctx, G, force) {
    if (G.ph === 'clue' && !ctx.on(G.order[G.turn]) && !force) { G.clues.push({ f: G.order[G.turn], x: '(غايب)', k: 'dim' }); impNextClue(ctx, G); return true; }
    if (!expired(ctx, G, force)) return false;
    if (G.ph === 'see') impPlay(ctx, G);
    else if (G.ph === 'ask') impNextPair(ctx, G);
    else if (G.ph === 'clue') { G.clues.push({ f: G.order[G.turn], x: '…ما كتب شي', k: 'dim' }); impNextClue(ctx, G); }
    else if (G.ph === 'vote') impReveal(ctx, G);
    else if (G.ph === 'guess') impEnd(ctx, G);
    else if (G.ph === 'end' && force) { if (G.round >= G.rounds) ctx.finish({}); else impRound(ctx, G); }
    else return false;
    return true;
  },
  view(ctx, G) {
    const end = G.ph === 'end' || G.ph === 'guess';
    return {
      ...basic(G), mode: G.opts.mode, rids: G.rids, ready: G.ready, order: G.order, turn: G.turn, pairs: G.ph === 'ask' ? G.pairs : null,
      clues: G.clues, voted: Object.fromEntries(Object.keys(G.votes).map(k => [k, true])),
      votes: end ? G.votes : null, imps: end ? G.imps : null, caught: G.caught, word: G.ph === 'end' ? G.word : null,
      cat: G.ph === 'end' ? G.catName : null, choices: G.ph === 'guess' ? G.choices : null, guess: G.ph === 'end' ? G.guess : null, res: G.res, lap: G.lap, laps: G.opts.laps,
    };
  },
  pv(ctx, G, pid) {
    if (!G.rids.includes(pid) || G.ph === 'end') return null;
    const myVote = G.votes[pid] || null;
    if (G.imps.includes(pid)) return { imp: true, cat: G.opts.hint ? G.catName : null, mates: G.imps.filter(x => x !== pid), myVote };
    return { word: G.word, cat: G.catName, myVote };
  },
  View: ImposterView,
};
const pick = (map, ids) => Object.fromEntries(Object.entries(map).filter(([k]) => ids.includes(k)));
function impRound(ctx, G) {
  G.round++;
  const pl = pool(ctx, G.opts.cat === 'mix' ? null : G.opts.cat, c => c.imp !== 0);
  const fresh = pl.words.filter(w => !G.used.includes(w));
  G.word = ctx.pick(fresh.length ? fresh : pl.words); G.used.push(G.word); G.catName = pl.name;
  G.choices = ctx.shuffle([G.word, ...ctx.sample(pl.words.filter(w => w !== G.word), 7)]);
  const act = ctx.active(); G.rids = act.length >= 3 ? act : G.ids.slice();
  const n = G.opts.imps === 2 && G.rids.length >= 6 ? 2 : 1;
  G.imps = ctx.sample(G.rids, n);
  G.ready = {}; G.votes = {}; G.clues = []; G.guess = null; G.caught = null; G.res = null; G.lap = 1;
  G.order = ctx.shuffle(G.rids); G.turn = 0;
  G.pairs = [];
  for (let l = 0; l < G.opts.laps; l++) { const o = ctx.shuffle(G.rids); o.forEach((a, i) => G.pairs.push([a, o[(i + 1) % o.length]])); }
  setPh(ctx, G, 'see', 40); ctx.fx('reveal');
}
function impPlay(ctx, G) { G.turn = 0; G.lap = 1; if (G.opts.mode === 'clue') { if (!ctx.on(G.order[0])) G.turn = nextIdx(ctx, G.order, 0); setPh(ctx, G, 'clue', 40); } else setPh(ctx, G, 'ask', 60); ctx.fx('go'); }
function impNextPair(ctx, G) { G.turn++; if (G.turn >= G.pairs.length) impVote(ctx, G); else setPh(ctx, G, 'ask', 60); }
function impNextClue(ctx, G) {
  const n = G.order.length; const total = n * G.opts.laps;
  if (G.clues.length >= total) return impVote(ctx, G);
  G.turn = (G.turn + 1) % n; if (G.turn === 0) G.lap++;
  setPh(ctx, G, 'clue', 40);
}
function impVote(ctx, G) { setPh(ctx, G, 'vote', 60); ctx.fx('alarm'); }
function impReveal(ctx, G) {
  const c = countVotes(pick(G.votes, G.rids)); const { top } = topOf(c);
  G.caught = top.length === 1 && G.imps.includes(top[0]) ? top[0] : null;
  if (G.caught) { setPh(ctx, G, 'guess', 30); ctx.fx('sting'); } else impEnd(ctx, G);
}
function impEnd(ctx, G) {
  const correctGuess = !!(G.caught && G.guess && loose(G.guess) === loose(G.word));
  const gain = {};
  for (const [v, t] of Object.entries(G.votes)) if (!G.imps.includes(v) && G.imps.includes(t)) gain[v] = (gain[v] || 0) + 1;
  for (const im of G.imps) { if (im !== G.caught) gain[im] = (gain[im] || 0) + 2; else if (correctGuess) gain[im] = (gain[im] || 0) + 2; }
  for (const [k, x] of Object.entries(gain)) G.pts[k] = (G.pts[k] || 0) + x;
  G.res = { gain, correctGuess, escaped: !G.caught };
  setPh(ctx, G, 'end', 0); ctx.fx(G.caught && !correctGuess ? 'win' : 'lose');
}
function ImposterView({ v, pv }) {
  const R = useRoom(); const me = R.me; const playing = v.rids.includes(me);
  useFx(v.fx);
  const card = pv && (pv.imp
    ? <div class="card-imp"><Big c="#ff4b4b">أنت برا السالفة 🤫</Big>{pv.cat ? <p>التصنيف: <b>{pv.cat}</b></p> : <p>ولا تعرف حتى التصنيف 😅</p>}{pv.mates && pv.mates.length ? <p>معك برا: <Who id={pv.mates[0]} size={22} /></p> : null}</div>
    : <div class="card-in"><small>{pv.cat}</small><Big>{pv.word}</Big></div>);
  if (v.ph === 'see') return <Phase icon="🃏" title={`الجولة ${v.round} من ${v.rounds}`} sub="شوف كرتك بسرعة وخبّه عن الكاميرا 😄">
    {playing ? <Reveal id={v.round}>{card}</Reveal> : <Note>تتفرج هالجولة 👀</Note>}
    {playing ? <Btn big disabled={v.ready[me]} onClick={() => R.room.gact('ready')}>{v.ready[me] ? 'تمام، ننتظر الباقين' : 'شفت كرتي ✅'}</Btn> : null}
    <Done ids={v.rids} done={v.ready} label="جاهزين" />
  </Phase>;
  if (v.ph === 'ask') {
    const [a, b] = v.pairs[v.turn] || [];
    return <Phase icon="🎤" title="وقت الأسئلة" sub={`سؤال ${v.turn + 1} من ${v.pairs.length} — اسأل بالديسكورد سؤال عن الكلمة`}>
      <div class="askpair"><Who id={a} size={54} /><span class="arrow">يسأل ⟵</span><Who id={b} size={54} /></div>
      {playing ? <Reveal id={'k' + v.round}>{card}</Reveal> : null}
      <div class="row">{(me === a || me === b || R.isHost) ? <Btn big onClick={() => R.room.gact('next')}>السؤال اللي بعده ⏭️</Btn> : <Note>استمعوا زين… مين جوابه غريب؟</Note>}</div>
      {R.isHost ? <Btn kind="ghost" onClick={() => R.room.gact('tovote')}>خلاص، نصوّت الحين 🗳️</Btn> : null}
    </Phase>;
  }
  if (v.ph === 'clue') {
    const cur = v.order[v.turn];
    return <Phase icon="✍️" title="التلميحات" sub={`لفّة ${v.lap} من ${v.laps} — كل واحد يكتب كلمة وحدة تلمّح للسالفة`}>
      {playing ? <Reveal id={'c' + v.round}>{card}</Reveal> : null}
      <div class="clues">{v.clues.map((c, i) => <div key={i} class={`clue ${c.k || ''}`}><Who id={c.f} size={24} me={false} /><b>{c.x}</b></div>)}</div>
      {cur === me ? <SendBox autoFocus placeholder="تلميحك (كلمة وحدة)" max={24} onSend={x => R.room.gact('clue', x)} /> : <Note>دور <Who id={cur} size={22} /> يكتب…</Note>}
      {R.isHost ? <Btn kind="ghost" onClick={() => R.room.gact('tovote')}>خلاص، نصوّت الحين 🗳️</Btn> : null}
    </Phase>;
  }
  if (v.ph === 'vote') return <Phase icon="🗳️" title="مين برا السالفة؟" sub="صوّت على اللي تشك فيه">
    {playing ? <PlayerGrid ids={v.rids} showMe={false} picked={pv && pv.myVote} onPick={id => R.room.gact('vote', id)} /> : null}
    {playing && v.voted[me] ? <Note kind="ok">صوّتّ! تقدر تغيّر صوتك قبل ما يخلص الوقت</Note> : null}
    <Done ids={v.rids} done={v.voted} label="صوّتوا" />
  </Phase>;
  if (v.ph === 'guess') return <Phase icon="😱" title="انكشف!" sub={<span><Who id={v.caught} size={22} /> طلع برا السالفة… بس عنده فرصة يخمّن الكلمة</span>}>
    {me === v.caught ? <div class="choices">{v.choices.map(c => <Btn key={c} onClick={() => R.room.gact('guess', c)}>{c}</Btn>)}</div> : <Note>ننتظر تخمينه… 🤞</Note>}
    <VoteList votes={v.votes} />
  </Phase>;
  if (v.ph === 'end') {
    const r = v.res || {};
    return <Phase icon={r.escaped ? '😎' : r.correctGuess ? '🧠' : '🎉'} title={r.escaped ? 'اللي برا السالفة فلت!' : r.correctGuess ? 'انكشف بس خمّن الكلمة صح!' : 'صدتوه!'}>
      <div class="endcard"><small>الكلمة كانت ({v.cat})</small><Big>{v.word}</Big>
        <p>برا السالفة: {v.imps.map(id => <Who key={id} id={id} size={26} />)}</p>
        {v.guess ? <p>خمّن: <b>{v.guess}</b> {r.correctGuess ? '✅' : '❌'}</p> : null}
      </div>
      <VoteList votes={v.votes} />
      <Gains gain={r.gain} />
      {R.isHost ? <Btn big onClick={() => R.room.gact('nextround')}>{v.round >= v.rounds ? 'النتيجة النهائية 🏁' : 'الجولة الجاية ▶️'}</Btn> : <Note>ننتظر المضيف يكمّل</Note>}
    </Phase>;
  }
  return null;
}
function VoteList({ votes }) {
  const R = useRoom();
  if (!votes) return null;
  const c = countVotes(votes);
  return <div class="votelist">{Object.entries(c).sort((a, b) => b[1] - a[1]).map(([t, n]) => <div key={t} class="vrow"><Who id={t} size={26} /><span class="vbar"><i style={{ width: `${n * 22}px` }} /></span><b>{n}</b>
    <span class="vby">{Object.keys(votes).filter(k => votes[k] === t).map(k => <Av key={k} p={R.P[k]} size={18} />)}</span></div>)}</div>;
}
export function Gains({ gain }) {
  const R = useRoom();
  const e = Object.entries(gain || {}).filter(([, x]) => x);
  if (!e.length) return <Note>ما أحد أخذ نقاط هالمرة</Note>;
  return <div class="gains">{e.sort((a, b) => b[1] - a[1]).map(([k, x]) => <span key={k} class="gain"><Av p={R.P[k]} size={22} /><b>+{x}</b></span>)}</div>;
}

// =====================================================================
// مين أنا — Who Am I
// =====================================================================
export const whoami = {
  id: 'whoami', name: 'مين أنا', e: '🎭', c: '#a78bfa', min: 2, max: 10, tag: 'الكل يشوف شخصيتك إلا أنت',
  how: ['كل واحد عنده شخصية سرية، الكل يشوفها إلا هو', 'بدورك اسأل أسئلة جوابها إيه أو لا، والباقين يجاوبون', 'إذا عرفت اكتب تخمينك، وأول واحد يعرف ياخذ أكثر نقاط'],
  options: packs => [
    opt('src', 'مين يختار الشخصيات', [['site', '🎲 الموقع عشوائي'], ['friends', '🤝 الشلة يختارون لبعض']], 'site'),
    opt('cat', 'نوع الشخصيات', [['mix', '🎲 خلطة'], ...chars(), ...packChoices(packs)], 'mix', { show: o => o.src === 'site' }),
    opt('turn', 'وقت الدور', nums([45, 60, 90, 120], ' ث'), 90),
    opt('laps', 'كم لفّة كحد أقصى', nums([3, 5, 8]), 5),
  ],
  setup(ctx, G) {
    G.rids = ctx.active(); G.chars = {}; G.done = {}; G.place = 0; G.ans = {}; G.log = []; G.round = 1; G.rounds = G.opts.laps; G.pending = null;
    if (G.opts.src === 'friends') {
      const o = ctx.shuffle(G.rids); G.pickFor = {}; o.forEach((a, i) => { G.pickFor[a] = o[(i + 1) % o.length]; });
      G.chosen = {}; setPh(ctx, G, 'pick', 75);
    } else { waFill(ctx, G); waStart(ctx, G); }
  },
  act(ctx, G, pid, t, d) {
    if (t === 'choose' && G.ph === 'pick' && G.pickFor[pid]) {
      const x = String(d || '').trim().slice(0, 30); if (!x) return;
      G.chosen[pid] = x; if (allIn(ctx, pick(G.chosen, G.rids))) { waFromFriends(ctx, G); waStart(ctx, G); }
      return;
    }
    if (G.ph !== 'play') return;
    const cur = G.order[G.turn];
    if (t === 'ans' && pid !== cur && G.rids.includes(pid) && ['y', 'n', 'm'].includes(d)) { G.ans[pid] = d; G._v++; }
    else if (t === 'pass' && pid === cur && !G.pending) waNext(ctx, G);
    else if (t === 'guess' && pid === cur && !G.pending) {
      const g = String(d || '').trim().slice(0, 40); if (!g) return;
      const r = judge(g, G.chars[pid]);
      if (r === 'yes') waRight(ctx, G, pid, g);
      else { G.pending = { g, ok: {}, no: {}, dl: ctx.now() + 15000 }; ctx.fx('buzz'); }
    }
    else if (t === 'judge' && G.pending && pid !== cur && G.rids.includes(pid)) {
      (d ? G.pending.ok : G.pending.no)[pid] = true; delete (d ? G.pending.no : G.pending.ok)[pid];
      const others = ctx.active().filter(x => x !== cur).length;
      if (Object.keys(G.pending.ok).length * 2 >= Math.max(1, others) && Object.keys(G.pending.ok).length) waRight(ctx, G, cur, G.pending.g);
      else if (Object.keys(G.pending.no).length * 2 > others) waWrong(ctx, G, cur);
    }
  },
  tick(ctx, G, force) {
    if (G.ph === 'pick') { if (expired(ctx, G, force)) { waFromFriends(ctx, G); waStart(ctx, G); return true; } return false; }
    if (G.ph !== 'play') return false;
    if (G.pending) { if (force || ctx.now() >= G.pending.dl) { const ok = Object.keys(G.pending.ok).length, no = Object.keys(G.pending.no).length; if (ok > no) waRight(ctx, G, G.order[G.turn], G.pending.g); else waWrong(ctx, G, G.order[G.turn]); return true; } return false; }
    if (!ctx.on(G.order[G.turn])) { waNext(ctx, G); return true; }
    if (expired(ctx, G, force)) { waNext(ctx, G); return true; }
    return false;
  },
  view(ctx, G) {
    return { ...basic(G), rids: G.rids, cur: G.order ? G.order[G.turn] : null, done: G.done, ans: G.ans, log: G.log.slice(-6), pending: G.pending ? { g: G.pending.g, ok: Object.keys(G.pending.ok).length, no: Object.keys(G.pending.no).length, dl: G.pending.dl } : null, chosenN: G.chosen ? Object.keys(G.chosen).length : 0, picked: G.chosen ? Object.fromEntries(Object.keys(G.chosen).map(k => [k, true])) : {} };
  },
  pv(ctx, G, pid) {
    if (!G.rids.includes(pid)) return { others: Object.fromEntries(G.rids.filter(x => G.chars[x]).map(x => [x, G.chars[x][0]])) };
    if (G.ph === 'pick') return { pickFor: G.pickFor[pid], mine: G.chosen[pid] || null };
    const others = {}; for (const x of G.rids) if (x !== pid && G.chars[x]) others[x] = G.chars[x][0];
    return { others, mine: G.done[pid] ? G.chars[pid][0] : null };
  },
  View: WhoAmIView,
};
function waFill(ctx, G) {
  const all = charPool(ctx, G.opts.cat === 'mix' ? null : G.opts.cat);
  const picks = ctx.sample(all, G.rids.length);
  G.rids.forEach((id, i) => { G.chars[id] = picks[i % picks.length]; });
}
function waFromFriends(ctx, G) {
  const all = charPool(ctx, null);
  for (const [picker, target] of Object.entries(G.pickFor)) {
    const c = G.chosen[picker];
    G.chars[target] = c ? [c] : ctx.pick(all);
  }
  for (const id of G.rids) if (!G.chars[id]) G.chars[id] = ctx.pick(all);
}
function waStart(ctx, G) { G.order = ctx.shuffle(G.rids); G.turn = 0; G.ans = {}; setPh(ctx, G, 'play', G.opts.turn); ctx.fx('go'); }
function waLeft(G) { return G.rids.filter(id => !G.done[id]); }
function waNext(ctx, G) {
  G.ans = {}; G.pending = null;
  const left = waLeft(G);
  if (left.length <= 1 && G.rids.length > 1) return waFinish(ctx, G);
  let tries = 0;
  do { G.turn++; if (G.turn >= G.order.length) { G.turn = 0; G.round++; } tries++; } while ((G.done[G.order[G.turn]] || !ctx.on(G.order[G.turn])) && tries < G.order.length * 2);
  if (G.round > G.rounds) return waFinish(ctx, G);
  setPh(ctx, G, 'play', G.opts.turn);
}
const WA_PTS = [5, 3, 2];
function waRight(ctx, G, pid, g) {
  G.place++; G.done[pid] = G.place; G.pts[pid] = (G.pts[pid] || 0) + (WA_PTS[G.place - 1] || 1);
  G.log.push({ f: pid, x: `عرف إنه «${G.chars[pid][0]}» 🎉`, k: 'ok' }); ctx.fx('correct'); waNext(ctx, G);
}
function waWrong(ctx, G, pid) { G.log.push({ f: pid, x: `خمّن «${G.pending ? G.pending.g : ''}» ❌`, k: 'bad' }); ctx.fx('wrong'); waNext(ctx, G); }
function waFinish(ctx, G) { ctx.finish({ list: G.rids.map(id => ({ pid: id, t: G.chars[id] ? G.chars[id][0] : '؟' })), listTitle: 'الشخصيات كانت' }); }
function WhoAmIView({ v, pv }) {
  const R = useRoom(); const me = R.me; const playing = v.rids.includes(me);
  useFx(v.fx);
  if (v.ph === 'pick') {
    return <Phase icon="🤝" title="اختاروا شخصيات لبعض" sub="اختار شخصية مشهورة (لاعب، أنمي، فنان…) للي تحت">
      {pv && pv.pickFor ? (pv.mine ? <Note kind="ok">اخترت «{pv.mine}» لـ <Who id={pv.pickFor} size={22} /> 😈</Note>
        : <div class="pickfor"><Who id={pv.pickFor} size={48} /><SendBox autoFocus placeholder="اكتب اسم الشخصية" max={30} onSend={x => R.room.gact('choose', x)} btn="تم" /></div>) : null}
      <Done ids={v.rids} done={v.picked} label="اختاروا" />
    </Phase>;
  }
  const myTurn = v.cur === me;
  return <Phase icon="🎭" title={myTurn ? 'دورك! اسأل عن شخصيتك' : <span>دور <Who id={v.cur} size={26} /></span>} sub={`اللفّة ${v.round} من ${v.rounds}`}>
    <div class="wa-grid">{v.rids.map(id => <div key={id} class={`wa-card ${id === v.cur ? 'cur' : ''} ${v.done[id] ? 'done' : ''}`}>
      <Who id={id} size={34} />
      <b class="wa-name">{id === me ? (pv && pv.mine ? pv.mine : '❓❓❓') : (pv && pv.others ? pv.others[id] : '…')}</b>
      {v.done[id] ? <span class="wa-place">#{v.done[id]}</span> : null}
    </div>)}</div>
    {v.pending ? <div class="pending"><p>خمّن: <b>«{v.pending.g}»</b> — صح؟</p>
      {!myTurn && playing ? <div class="row"><Btn kind="ok" onClick={() => R.room.gact('judge', true)}>✅ صح</Btn><Btn kind="danger" onClick={() => R.room.gact('judge', false)}>❌ غلط</Btn></div> : <Note>الشلة يحكمون… ✅ {v.pending.ok} — ❌ {v.pending.no}</Note>}
    </div> : myTurn ? <div class="stack">
      <Note>اسأل بالديسكورد مثل: «أنا لاعب كرة؟» والشلة يجاوبون</Note>
      <AnsTally v={v} />
      <SendBox placeholder="عرفت؟ اكتب تخمينك" max={40} onSend={g => R.room.gact('guess', g)} btn="خمّن" />
      <Btn kind="ghost" onClick={() => R.room.gact('pass')}>خلصت دوري ⏭️</Btn>
    </div> : playing ? <div class="stack">
      <p class="muted">جاوب على سؤاله:</p>
      <div class="row ans3">{[['y', 'إيه ✅'], ['n', 'لا ❌'], ['m', 'يمكن 🤷']].map(([k, l]) => <Btn key={k} kind={v.ans[me] === k ? 'main' : 'ghost'} onClick={() => R.room.gact('ans', k)}>{l}</Btn>)}</div>
      <AnsTally v={v} />
    </div> : null}
    <Feed items={v.log} />
  </Phase>;
}
function AnsTally({ v }) {
  const R = useRoom(); const e = Object.entries(v.ans || {});
  if (!e.length) return null;
  return <div class="tally">{e.map(([k, a]) => <span key={k} class={`ta ta-${a}`}><Av p={R.P[k]} size={20} />{a === 'y' ? 'إيه' : a === 'n' ? 'لا' : 'يمكن'}</span>)}</div>;
}

// =====================================================================
// مافيا — Mafia (the site narrates)
// =====================================================================
const ROLE = { m: { n: 'مافيا', e: '🔪', c: '#ff4b4b', d: 'كل ليلة تختار مع جماعتك واحد تطلّعه من اللعبة. لا تنكشف!' }, d: { n: 'الطبيب', e: '💉', c: '#45f59a', d: 'كل ليلة تختار واحد تحميه من المافيا (تقدر تحمي نفسك)' }, p: { n: 'المحقق', e: '🔎', c: '#2ef2ff', d: 'كل ليلة تحقق مع واحد وتعرف إذا هو مافيا أو لا' }, c: { n: 'مواطن', e: '🧍', c: '#ffb02e', d: 'ما عندك قدرة بالليل، بس صوتك بالنهار يفرق. اكشفوا المافيا!' } };
export const mafia = {
  id: 'mafia', name: 'مافيا', e: '🔪', c: '#ff4b4b', min: 4, max: 12, tag: 'الليل للمافيا والنهار للتصويت', narr: true,
  how: ['كل واحد ياخذ دور سري: مافيا، طبيب، محقق، أو مواطن', 'بالليل المافيا يختارون ضحية، والطبيب يحمي، والمحقق يحقق', 'بالنهار تتناقشون بالديسكورد وتصوّتون مين تطلّعون'],
  options: [
    opt('talk', 'وقت النقاش بالنهار', nums([60, 90, 120, 180], ' ث'), 120),
    opt('maf', 'عدد المافيا', [['auto', 'تلقائي'], [1, '١'], [2, '٢'], [3, '٣']], 'auto'),
    opt('doc', 'فيه طبيب؟', yesno, true), opt('det', 'فيه محقق؟', yesno, true),
    opt('reveal', 'نكشف دور اللي يطلع؟', yesno, true),
  ],
  setup(ctx, G) {
    const ids = ctx.active(); G.rids = ids; const n = ids.length;
    let m = G.opts.maf === 'auto' ? (n <= 6 ? 1 : n <= 9 ? 2 : 3) : +G.opts.maf; m = Math.max(1, Math.min(m, Math.ceil(n / 2) - 1));
    const sh = ctx.shuffle(ids); G.role = {};
    sh.forEach((id, i) => { G.role[id] = i < m ? 'm' : 'c'; });
    let k = m; if (G.opts.doc && k < n) G.role[sh[k++]] = 'd'; if (G.opts.det && k < n) G.role[sh[k++]] = 'p';
    G.alive = Object.fromEntries(ids.map(id => [id, true])); G.dead = []; G.day = 0; G.seen = {}; G.ready = {};
    G.narr = 'أهلًا بكم في الحارة… كل واحد يشوف دوره بالسر 🤫';
    setPh(ctx, G, 'intro', 30);
  },
  act(ctx, G, pid, t, d) {
    if (!G.alive[pid]) return;
    if (t === 'ready' && G.ph === 'intro') { G.ready[pid] = true; if (allIn(ctx, G.ready)) mfNight(ctx, G); return; }
    if (G.ph === 'night') {
      const r = G.role[pid];
      if (t === 'kill' && r === 'm' && G.alive[d] && G.role[d] !== 'm') G.mk[pid] = d;
      else if (t === 'save' && r === 'd' && G.alive[d]) G.sv = d;
      else if (t === 'check' && r === 'p' && G.alive[d] && d !== pid && !G.chk) { G.chk = d; (G.seen[pid] = G.seen[pid] || []).push({ t: d, m: G.role[d] === 'm' }); }
      else if (t === 'sleep') G.slept[pid] = true;
      else return;
      G._v++; if (mfNightDone(ctx, G)) mfDawn(ctx, G);
      return;
    }
    if (t === 'rdy' && G.ph === 'day') { G.ready[pid] = true; const al = mfAlive(ctx, G); if (Object.keys(G.ready).filter(k => G.alive[k]).length * 2 > al.length) mfVote(ctx, G); else G._v++; return; }
    if (t === 'vote' && G.ph === 'vote' && (d === 'skip' || G.alive[d])) { G.votes[pid] = d; ctx.fx('vote'); if (mfAlive(ctx, G).filter(id => ctx.on(id)).every(id => G.votes[id])) mfVerdict(ctx, G); }
  },
  tick(ctx, G, force) {
    if (!expired(ctx, G, force)) return false;
    if (G.ph === 'intro') mfNight(ctx, G);
    else if (G.ph === 'night') mfDawn(ctx, G);
    else if (G.ph === 'dawn') { if (!mfWin(ctx, G)) { G.ready = {}; G.narr = 'تناقشوا بالديسكورد… مين تشكّون فيه؟ 🗣️'; setPh(ctx, G, 'day', G.opts.talk); } }
    else if (G.ph === 'day') mfVote(ctx, G);
    else if (G.ph === 'vote') mfVerdict(ctx, G);
    else if (G.ph === 'verdict') { if (!mfWin(ctx, G)) mfNight(ctx, G); }
    else return false;
    return true;
  },
  view(ctx, G) {
    const over = G.ph === 'over';
    return { ...basic(G), rids: G.rids, alive: G.alive, dead: G.dead.map(x => ({ id: x.id, how: x.how, role: (G.opts.reveal || over) ? G.role[x.id] : null })), day: G.day, narr: G.narr, news: G.news || null, ready: G.ready, votes: G.ph === 'vote' || G.ph === 'verdict' ? G.votes : null, out: G.out || null, roles: over ? G.role : null, win: G.win || null };
  },
  pv(ctx, G, pid) {
    const r = G.role[pid]; if (!r) return null;
    return { role: r, mates: r === 'm' ? G.rids.filter(x => G.role[x] === 'm' && x !== pid) : [], seen: G.seen[pid] || [], myKill: G.mk ? G.mk[pid] : null, mkAll: r === 'm' && G.mk ? G.mk : null, mySave: r === 'd' ? G.sv : null, myCheck: r === 'p' ? G.chk : null, slept: G.slept ? !!G.slept[pid] : false };
  },
  View: MafiaView,
};
const mfAlive = (ctx, G) => G.rids.filter(id => G.alive[id]);
function mfNight(ctx, G) {
  G.day++; G.mk = {}; G.sv = null; G.chk = null; G.slept = {}; G.news = null; G.out = null; G.votes = {}; G.ready = {};
  G.narr = 'نزل الليل على الحارة 🌙 المافيا صحوا… والطبيب والمحقق بعد';
  setPh(ctx, G, 'night', 50); ctx.fx('night');
}
function mfNightDone(ctx, G) {
  const al = mfAlive(ctx, G).filter(id => ctx.on(id));
  return al.every(id => { const r = G.role[id]; return r === 'm' ? G.mk[id] : r === 'd' ? G.sv : r === 'p' ? G.chk : G.slept[id]; });
}
function mfDawn(ctx, G) {
  const c = countVotes(G.mk); const { top } = topOf(c);
  const target = top.length ? ctx.pick(top) : null;
  if (target && target === G.sv) { G.news = { saved: true }; G.narr = 'المافيا حاولوا… بس الطبيب لحق عليه! ما مات أحد الليلة 💉'; ctx.fx('correct'); }
  else if (target) { G.alive[target] = false; G.dead.push({ id: target, how: 'kill', day: G.day }); G.news = { killed: target }; G.narr = `صحت الحارة على خبر شين… ${ctx.name(target)} طلع من اللعبة 💀`; ctx.fx('boom'); }
  else { G.news = { none: true }; G.narr = 'ليلة هادية… المافيا ما سووا شي 🤔'; }
  setPh(ctx, G, 'dawn', 9);
}
function mfVote(ctx, G) { G.votes = {}; G.narr = 'وقت التصويت 🗳️ مين تطلّعون؟'; setPh(ctx, G, 'vote', 50); ctx.fx('alarm'); }
function mfVerdict(ctx, G) {
  const c = countVotes(G.votes); const { top, max } = topOf(c);
  if (top.length === 1 && top[0] !== 'skip' && max >= 1) {
    const id = top[0]; G.alive[id] = false; G.dead.push({ id, how: 'vote', day: G.day }); G.out = id;
    G.narr = G.opts.reveal ? `الشلة طلّعوا ${ctx.name(id)}… وطلع ${ROLE[G.role[id]].n} ${ROLE[G.role[id]].e}` : `الشلة طلّعوا ${ctx.name(id)} 🚪`;
    ctx.fx(G.role[id] === 'm' ? 'correct' : 'sting');
  } else { G.out = null; G.narr = 'ما اتفقتوا… ما طلع أحد اليوم 🤷'; ctx.fx('whoosh'); }
  setPh(ctx, G, 'verdict', 9);
}
function mfWin(ctx, G) {
  const al = mfAlive(ctx, G); const m = al.filter(id => G.role[id] === 'm').length, others = al.length - m;
  let win = null;
  if (m === 0) win = 'town'; else if (m >= others) win = 'mafia';
  if (!win) return false;
  G.win = win;
  for (const id of G.rids) G.pts[id] = (win === 'mafia') === (G.role[id] === 'm') ? 3 : 0;
  G.narr = win === 'town' ? 'الحارة نظفت! المواطنين فازوا 🎉' : 'المافيا سيطروا على الحارة 😈';
  setPh(ctx, G, 'over', 0); ctx.fx(win === 'town' ? 'win' : 'sting');
  ctx.finish({ note: G.narr, list: G.rids.map(id => ({ pid: id, t: `${ROLE[G.role[id]].e} ${ROLE[G.role[id]].n}` })), listTitle: 'الأدوار' });
  return true;
}
function MafiaView({ v, pv }) {
  const R = useRoom(); const me = R.me; const alive = !!v.alive[me]; const role = pv && pv.role; const RO = role ? ROLE[role] : null;
  useFx(v.fx);
  const al = v.rids.filter(id => v.alive[id]);
  useEffect(() => { if (v.narr) say(v.narr); }, [v.narr]);
  const myCard = RO ? <div class="role" style={{ '--c': RO.c }}><span class="role-e">{RO.e}</span><Big c={RO.c}>{RO.n}</Big><p>{RO.d}</p>{pv.mates && pv.mates.length ? <p>جماعتك: {pv.mates.map(x => <Who key={x} id={x} size={22} />)}</p> : null}</div> : null;
  const grave = <div class="grave">{v.dead.map(d => <span key={d.id} class="dead"><Av p={R.P[d.id]} size={26} dim />{d.role ? ROLE[d.role].e : '💀'}</span>)}</div>;
  if (v.ph === 'intro') return <Phase icon="🌆" title="دورك السري" sub={v.narr}>
    {RO ? <Reveal id="intro">{myCard}</Reveal> : <Note>تتفرج 👀</Note>}
    {RO ? <Btn big disabled={v.ready[me]} onClick={() => R.room.gact('ready')}>{v.ready[me] ? 'ننتظر الباقين' : 'فهمت دوري ✅'}</Btn> : null}
    <Done ids={v.rids} done={v.ready} label="جاهزين" />
  </Phase>;
  if (v.ph === 'night') {
    let body;
    if (!alive) body = <Note>أنت طلعت من اللعبة 👻 تفرّج بصمت ولا تساعد أحد!</Note>;
    else if (role === 'm') body = <div class="stack"><p class="muted">اختار ضحية (جماعتك يشوفون اختيارك)</p>
      <PlayerGrid ids={al.filter(id => !pv.mates.includes(id) && id !== me)} picked={pv.myKill} onPick={id => R.room.gact('kill', id)} badge={id => pv.mkAll ? Object.entries(pv.mkAll).filter(([, t]) => t === id).map(([k]) => R.P[k] ? R.P[k].av : '').join('') : ''} /></div>;
    else if (role === 'd') body = <div class="stack"><p class="muted">مين تحمي الليلة؟</p><PlayerGrid ids={al} picked={pv.mySave} onPick={id => R.room.gact('save', id)} /></div>;
    else if (role === 'p') body = <div class="stack">{pv.myCheck ? <Note kind={pv.seen[pv.seen.length - 1].m ? 'bad' : 'ok'}><Who id={pv.myCheck} size={22} /> {pv.seen[pv.seen.length - 1].m ? 'مافيا 🔪!' : 'مو مافيا ✅'}</Note> : <><p class="muted">مين تحقق معه؟</p><PlayerGrid ids={al.filter(id => id !== me)} onPick={id => R.room.gact('check', id)} /></>}</div>;
    else body = <div class="stack sleep"><span class="zz">😴</span><p>أنت نايم… اضغط الزر عشان محد يعرف دورك</p><Btn disabled={pv && pv.slept} onClick={() => R.room.gact('sleep')}>{pv && pv.slept ? 'تصبح على خير 🌙' : 'نوم 🌙'}</Btn></div>;
    return <Phase icon="🌙" title={`الليلة ${v.day}`} sub={v.narr}>{body}{pv && pv.seen && pv.seen.length && role === 'p' ? <div class="seen">تحقيقاتك: {pv.seen.map((s, i) => <span key={i}><Av p={R.P[s.t]} size={20} />{s.m ? '🔪' : '✅'}</span>)}</div> : null}{grave}</Phase>;
  }
  if (v.ph === 'dawn' || v.ph === 'verdict') return <Phase icon={v.ph === 'dawn' ? '🌅' : '⚖️'} title={v.ph === 'dawn' ? 'صباح الخير يا حارة' : 'حكم الشلة'} sub="">
    <div class="narr">{v.narr}</div>
    {v.news && v.news.killed ? <div class="victim"><Who id={v.news.killed} size={60} /></div> : null}
    {v.out ? <div class="victim"><Who id={v.out} size={60} /></div> : null}
    {grave}
  </Phase>;
  if (v.ph === 'day') return <Phase icon="☀️" title={`النهار ${v.day}`} sub={v.narr}>
    {RO ? <Reveal id="d">{myCard}</Reveal> : null}
    {alive ? <Btn big disabled={v.ready[me]} onClick={() => R.room.gact('rdy')}>{v.ready[me] ? 'جاهز للتصويت ✔️' : 'نبي نصوّت 🗳️'}</Btn> : <Note>أنت طالع 👻</Note>}
    <Done ids={al} done={v.ready} label="يبون يصوّتون" />{grave}
  </Phase>;
  if (v.ph === 'vote') {
    const c = countVotes(v.votes || {});
    return <Phase icon="🗳️" title="مين تطلّعون؟" sub="التصويت مكشوف للكل">
      {alive ? <><PlayerGrid ids={al} showMe={false} picked={v.votes && v.votes[me]} onPick={id => R.room.gact('vote', id)} badge={id => (c[id] ? '🗳️'.repeat(c[id]) : '')} />
        <Btn kind={v.votes && v.votes[me] === 'skip' ? 'main' : 'ghost'} onClick={() => R.room.gact('vote', 'skip')}>ما نطلّع أحد {c.skip ? `(${c.skip})` : ''}</Btn></> : <Note>أنت طالع 👻</Note>}
      <Done ids={al} done={v.votes || {}} label="صوّتوا" />
    </Phase>;
  }
  return <Phase icon="🏁" title="انتهت" sub={v.narr} />;
}

// =====================================================================
// لو خيروك — Would You Rather
// =====================================================================
const qsFrom = (ctx, src, builtin, n, type) => {
  let list = builtin;
  if (src && src.startsWith('pack:')) { const p = ctx.packs.find(x => 'pack:' + x.id === src); if (p && p.items.length) list = p.items; }
  return ctx.sample(list, Math.min(n, list.length));
};
export const wyr = {
  id: 'wyr', name: 'لو خيروك', e: '🤔', c: '#ffb02e', min: 2, max: 12, tag: 'اختار… وشوف مين معك',
  how: ['يطلع لكم خيارين، كل واحد يختار بالسر', 'بعدها ينكشف مين اختار وش', 'اللي مع الأغلبية ياخذ نقطة'],
  options: packs => [opt('rounds', 'عدد الأسئلة', nums([6, 8, 10, 15]), 10), opt('time', 'الوقت', nums([15, 20, 30], ' ث'), 20), opt('src', 'الأسئلة', [['b', '📦 أسئلة فلها'], ...packChoices(packs, 'wyr')], 'b')],
  setup(ctx, G) { G.qs = qsFrom(ctx, G.opts.src, lines(WYR), G.opts.rounds).map(l => split(l.replace(/\s*\|\s*/, '|'))); G.round = 0; G.rounds = G.qs.length; wyNext(ctx, G); },
  act(ctx, G, pid, t, d) { if (t === 'pick' && G.ph === 'q' && (d === 0 || d === 1)) { G.pick[pid] = d; G._v++; if (allIn(ctx, G.pick)) wyReveal(ctx, G); } else if (t === 'next' && G.ph === 'r' && pid === ctx.host) wyNext(ctx, G); },
  tick(ctx, G, force) { if (!expired(ctx, G, force)) return false; if (G.ph === 'q') wyReveal(ctx, G); else wyNext(ctx, G); return true; },
  view(ctx, G) { const q = G.qs[G.round - 1] || []; return { ...basic(G), a: q[0], b: q[1], done: Object.fromEntries(Object.keys(G.pick).map(k => [k, true])), picks: G.ph === 'r' ? G.pick : null, gain: G.gain }; },
  pv(ctx, G, pid) { return { mine: G.pick[pid] != null ? G.pick[pid] : null }; },
  View: WyrView,
};
function wyNext(ctx, G) { if (G.round >= G.rounds) return ctx.finish({}); G.round++; G.pick = {}; G.gain = null; setPh(ctx, G, 'q', G.opts.time); ctx.fx('pop'); }
function wyReveal(ctx, G) {
  const a = Object.values(G.pick).filter(x => x === 0).length, b = Object.values(G.pick).filter(x => x === 1).length;
  G.gain = {}; if (a !== b) { const win = a > b ? 0 : 1; for (const [k, x] of Object.entries(G.pick)) if (x === win) { G.pts[k]++; G.gain[k] = 1; } }
  setPh(ctx, G, 'r', 9); ctx.fx('reveal');
}
function WyrView({ v, pv }) {
  const R = useRoom(); useFx(v.fx);
  const mine = pv ? pv.mine : null; const rev = v.ph === 'r' && v.picks;
  const side = (i, txt) => {
    const who = rev ? Object.keys(v.picks).filter(k => v.picks[k] === i) : [];
    const total = rev ? Object.keys(v.picks).length || 1 : 1;
    return <button type="button" class={`wyr-opt o${i} ${mine === i ? 'on' : ''}`} disabled={v.ph !== 'q'} onClick={() => R.room.gact('pick', i)}>
      <span class="wyr-t">{txt}</span>
      {rev ? <span class="wyr-res"><b>{Math.round(who.length * 100 / total)}%</b><span class="wyr-avs">{who.map(k => <Av key={k} p={R.P[k]} size={24} />)}</span></span> : null}
    </button>;
  };
  return <Phase icon="🤔" title="لو خيروك…" sub={`سؤال ${v.round} من ${v.rounds}`}>
    <div class="wyr">{side(0, v.a)}<span class="wyr-or">ولا</span>{side(1, v.b)}</div>
    {v.ph === 'q' ? <Done ids={v.ids} done={v.done} label="اختاروا" /> : <><Gains gain={v.gain} />{R.isHost ? <Btn onClick={() => R.room.gact('next')}>التالي ⏭️</Btn> : null}</>}
  </Phase>;
}

// =====================================================================
// مين الأكثر — Most Likely To
// =====================================================================
export const mlt = {
  id: 'mlt', name: 'مين الأكثر', e: '👀', c: '#2ef2ff', min: 3, max: 12, tag: 'صوّتوا على بعض… بمحبة 😅',
  how: ['يطلع سؤال مثل: مين أكثر واحد ينام بالاستراحة؟', 'كل واحد يصوّت على واحد من الشلة بالسر', 'اللي صوّت مع الأغلبية ياخذ نقطة، وصاحب الأصوات ياخذ اللقب'],
  options: packs => [opt('rounds', 'عدد الأسئلة', nums([6, 8, 10, 15]), 10), opt('time', 'الوقت', nums([15, 20, 30], ' ث'), 20), opt('self', 'تقدر تصوّت لنفسك؟', yesno, false), opt('src', 'الأسئلة', [['b', '📦 أسئلة فلها'], ...packChoices(packs, 'mlt')], 'b')],
  setup(ctx, G) { G.qs = qsFrom(ctx, G.opts.src, lines(MLT), G.opts.rounds); G.round = 0; G.rounds = G.qs.length; G.titles = {}; mlNext(ctx, G); },
  act(ctx, G, pid, t, d) {
    if (t === 'vote' && G.ph === 'q' && G.ids.includes(d) && (G.opts.self || d !== pid)) { G.vote[pid] = d; G._v++; if (allIn(ctx, G.vote)) mlReveal(ctx, G); }
    else if (t === 'next' && G.ph === 'r' && pid === ctx.host) mlNext(ctx, G);
  },
  tick(ctx, G, force) { if (!expired(ctx, G, force)) return false; if (G.ph === 'q') mlReveal(ctx, G); else mlNext(ctx, G); return true; },
  view(ctx, G) { return { ...basic(G), q: G.qs[G.round - 1], done: Object.fromEntries(Object.keys(G.vote).map(k => [k, true])), votes: G.ph === 'r' ? G.vote : null, top: G.top || [], gain: G.gain }; },
  pv(ctx, G, pid) { return { mine: G.vote[pid] || null }; },
  View: MltView,
};
function mlNext(ctx, G) {
  if (G.round >= G.rounds) {
    const list = G.ids.map(id => ({ pid: id, t: (G.titles[id] || []).length ? `${G.titles[id].length} لقب — آخرها: ${G.titles[id][G.titles[id].length - 1]}` : 'ما أخذ ولا لقب 😇' }));
    return ctx.finish({ list, listTitle: 'ألقاب الليلة' });
  }
  G.round++; G.vote = {}; G.top = []; G.gain = null; setPh(ctx, G, 'q', G.opts.time); ctx.fx('pop');
}
function mlReveal(ctx, G) {
  const c = countVotes(G.vote); const { top } = topOf(c); G.top = top; G.gain = {};
  for (const [k, t] of Object.entries(G.vote)) if (top.includes(t)) { G.pts[k]++; G.gain[k] = 1; }
  const q = G.qs[G.round - 1].replace(/^مين (أكثر واحد|أكثر وحدة|الأكثر)\s*/, '').replace(/[؟?]$/, '');
  for (const t of top) (G.titles[t] = G.titles[t] || []).push(q);
  setPh(ctx, G, 'r', 10); ctx.fx('reveal');
}
function MltView({ v, pv }) {
  const R = useRoom(); useFx(v.fx);
  const c = v.votes ? countVotes(v.votes) : {};
  return <Phase icon="👀" title={v.q} sub={`سؤال ${v.round} من ${v.rounds}`}>
    {v.ph === 'q' ? <><PlayerGrid ids={v.ids} showMe={!!(v.opts && v.opts.self)} picked={pv && pv.mine} onPick={id => R.room.gact('vote', id)} /><Done ids={v.ids} done={v.done} label="صوّتوا" /></>
      : <><div class="mlt-top">{v.top.length ? v.top.map(id => <div key={id} class="crowned"><span class="crown">👑</span><Who id={id} size={64} /></div>) : <Note>ما صوّت أحد 🤐</Note>}</div>
        <div class="votelist">{Object.entries(c).sort((a, b) => b[1] - a[1]).map(([t, n]) => <div key={t} class="vrow"><Who id={t} size={24} /><b>{n}</b><span class="vby">{Object.keys(v.votes).filter(k => v.votes[k] === t).map(k => <Av key={k} p={R.P[k]} size={18} />)}</span></div>)}</div>
        <Gains gain={v.gain} />{R.isHost ? <Btn onClick={() => R.room.gact('next')}>التالي ⏭️</Btn> : null}</>}
  </Phase>;
}

// =====================================================================
// صدّقني — Fake answers bluff
// =====================================================================
export const bluff = {
  id: 'bluff', name: 'صدّقني', e: '🤥', c: '#45f59a', min: 3, max: 10, tag: 'اكتب كذبة تقنع فيها الشلة',
  how: ['يطلع سؤال أو مثل ناقص', 'كل واحد يكتب جواب كذب يقنع فيه الباقين', 'بعدها اختاروا الجواب الصح من بين الأجوبة: الصح بنقطتين، وكل واحد ينخدع بكذبتك يعطيك نقطة'],
  options: [opt('rounds', 'عدد الأسئلة', nums([4, 6, 8, 10]), 6), opt('kind', 'نوع الأسئلة', [['mix', '🎲 خلطة'], ['p', '📜 أمثال ناقصة'], ['f', '🤯 معلومات غريبة'], ['w', '🔤 أصل الكلمات']], 'mix'), opt('wt', 'وقت الكتابة', nums([45, 60, 90], ' ث'), 60)],
  setup(ctx, G) {
    const all = lines(BLUFF).map(l => { const [k, q, a] = l.split('|'); return { k, q, a: a.split('/').map(s => s.trim()) }; }).filter(x => G.opts.kind === 'mix' || x.k === G.opts.kind);
    G.qs = ctx.sample(all, Math.min(G.opts.rounds, all.length)); G.round = 0; G.rounds = G.qs.length; blNext(ctx, G);
  },
  act(ctx, G, pid, t, d) {
    if (t === 'fake' && G.ph === 'write') {
      const x = String(d || '').trim().slice(0, 40); if (!x) return;
      const q = G.qs[G.round - 1];
      if (judge(x, q.a) === 'yes') { G.bad[pid] = (G.bad[pid] || 0) + 1; G._v++; return; }
      G.fake[pid] = x; G._v++; if (allIn(ctx, G.fake)) blPick(ctx, G);
    } else if (t === 'pick' && G.ph === 'pick' && G.optsL[d] && !G.optsL[d].by.includes(pid)) { G.pick[pid] = d; G._v++; if (allIn(ctx, G.pick)) blReveal(ctx, G); }
    else if (t === 'next' && G.ph === 'r' && pid === ctx.host) blNext(ctx, G);
  },
  tick(ctx, G, force) { if (!expired(ctx, G, force)) return false; if (G.ph === 'write') blPick(ctx, G); else if (G.ph === 'pick') blReveal(ctx, G); else blNext(ctx, G); return true; },
  view(ctx, G) {
    const q = G.qs[G.round - 1];
    return { ...basic(G), q: q.q, k: q.k, done: Object.fromEntries(Object.keys(G.ph === 'write' ? G.fake : G.pick || {}).map(k => [k, true])), choices: G.ph !== 'write' ? G.optsL.map(o => o.t) : null, reveal: G.ph === 'r' ? { truth: G.optsL.findIndex(o => o.truth), by: G.optsL.map(o => o.by), picks: G.pick } : null, gain: G.gain };
  },
  pv(ctx, G, pid) { return { mine: G.fake[pid] || null, bad: G.bad[pid] || 0, myOpt: G.optsL ? G.optsL.findIndex(o => o.by.includes(pid)) : -1, picked: G.pick ? G.pick[pid] : null }; },
  View: BluffView,
};
function blNext(ctx, G) { if (G.round >= G.rounds) return ctx.finish({}); G.round++; G.fake = {}; G.bad = {}; G.pick = {}; G.optsL = null; G.gain = null; setPh(ctx, G, 'write', G.opts.wt); ctx.fx('pop'); }
function blPick(ctx, G) {
  const q = G.qs[G.round - 1]; const map = new Map();
  map.set('__t', { t: q.a[0], by: [], truth: true });
  for (const [pid, x] of Object.entries(G.fake)) { const key = loose(x); if (map.has(key)) map.get(key).by.push(pid); else map.set(key, { t: x, by: [pid], truth: false }); }
  G.optsL = ctx.shuffle([...map.values()]);
  setPh(ctx, G, 'pick', 40); ctx.fx('whoosh');
}
function blReveal(ctx, G) {
  G.gain = {}; const add = (k, n) => { G.pts[k] = (G.pts[k] || 0) + n; G.gain[k] = (G.gain[k] || 0) + n; };
  for (const [pid, i] of Object.entries(G.pick)) { const o = G.optsL[i]; if (!o) continue; if (o.truth) add(pid, 2); else o.by.forEach(a => add(a, 1)); }
  setPh(ctx, G, 'r', 0); ctx.fx('reveal');
}
const KIND = { p: '📜 كمّل المثل', f: '🤯 معلومة غريبة', w: '🔤 أصل الكلمة' };
function BluffView({ v, pv }) {
  const R = useRoom(); useFx(v.fx); const me = R.me;
  const q = <div class="bl-q"><small>{KIND[v.k]}</small><p>{v.q.split('___').map((s, i, a) => <span key={i}>{s}{i < a.length - 1 ? <span class="blank">؟؟؟</span> : null}</span>)}</p></div>;
  if (v.ph === 'write') return <Phase icon="🤥" title="اكتب كذبتك" sub={`سؤال ${v.round} من ${v.rounds}`}>{q}
    {pv && pv.bad ? <Note kind="warn">كتبت الجواب الصح! 😅 اكتب كذبة ثانية</Note> : null}
    {pv && pv.mine ? <Note kind="ok">كذبتك: «{pv.mine}» — تقدر تغيّرها</Note> : null}
    <SendBox autoFocus placeholder="جواب يقنعهم…" max={40} onSend={x => R.room.gact('fake', x)} btn="تم" />
    <Done ids={v.ids} done={v.done} label="كتبوا" />
  </Phase>;
  if (v.ph === 'pick') return <Phase icon="🔍" title="وين الجواب الصح؟" sub="اختار اللي تحسه حقيقي">{q}
    <div class="choices col">{v.choices.map((c, i) => <Btn key={i} kind={pv && pv.picked === i ? 'main' : 'ghost'} disabled={pv && pv.myOpt === i} onClick={() => R.room.gact('pick', i)}>{c}{pv && pv.myOpt === i ? ' (كذبتك)' : ''}</Btn>)}</div>
    <Done ids={v.ids} done={v.done} label="اختاروا" />
  </Phase>;
  const r = v.reveal;
  return <Phase icon="🎬" title="الحقيقة" sub={`سؤال ${v.round} من ${v.rounds}`}>{q}
    <div class="choices col">{v.choices.map((c, i) => <div key={i} class={`bl-opt ${i === r.truth ? 'truth' : ''}`}><b>{c}</b>
      <span class="bl-meta">{i === r.truth ? '✅ الصح' : r.by[i].map(a => <Who key={a} id={a} size={20} me={false} />)}{Object.keys(r.picks).filter(k => r.picks[k] === i).length ? <span class="bl-fooled">اختاروه: {Object.keys(r.picks).filter(k => r.picks[k] === i).map(k => <Av key={k} p={R.P[k]} size={18} />)}</span> : null}</span></div>)}</div>
    <Gains gain={v.gain} />{R.isHost ? <Btn big onClick={() => R.room.gact('next')}>{v.round >= v.rounds ? 'النتيجة 🏁' : 'التالي ⏭️'}</Btn> : null}
  </Phase>;
}
