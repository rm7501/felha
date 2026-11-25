// Headless simulation: one host + bots play every game over the in-memory transport.
import fs from 'fs';
import { MemoryHub } from '../src/net/transport.js';
import { Room, memStorage } from '../src/core/client.js';
import { GAMES, GAME_LIST } from '../src/games/index.js';
import { norm } from '../src/core/util.js';

let NOW = 1_700_000_000_000; const realNow = Date.now; Date.now = () => NOW;
const dictArr = fs.readFileSync('public/dict-ar.txt', 'utf8').split('\n');
const dict = new Set(dictArr);
const R = a => a[Math.floor(Math.random() * a.length)];
const N = Number(process.env.N || 5);
const ONLY = process.env.ONLY ? process.env.ONLY.split(',') : null;
const OPTS = process.env.OPTS ? JSON.parse(process.env.OPTS) : {};

function bot(gid, v, pv, me, rooms) {
  const host = rooms[0].pub.hostId === me;
  switch (gid) {
    case 'imposter':
      if (v.ph === 'see' && !v.ready[me]) return ['ready'];
      if (v.ph === 'ask') { const pr = v.pairs[v.turn]; if (pr && pr[0] === me) return ['next']; return null; }
      if (v.ph === 'clue' && v.order[v.turn] === me) return ['clue', R(['حار', 'بارد', 'كبير', 'ينأكل'])];
      if (v.ph === 'vote' && !v.voted[me] && v.rids.includes(me)) return ['vote', R(v.rids.filter(x => x !== me))];
      if (v.ph === 'guess' && v.caught === me) return ['guess', R(v.choices)];
      if (v.ph === 'end' && host) return ['nextround'];
      return null;
    case 'whoami':
      if (v.ph === 'pick' && pv && pv.pickFor && !pv.mine) return ['choose', R(['ميسي', 'لوفي', 'سبونج بوب', 'ماريو'])];
      if (v.ph === 'play') {
        if (v.pending && v.cur !== me) return Math.random() < 0.5 ? ['judge', Math.random() < 0.5] : null;
        if (v.cur === me && !v.pending) { const r = Math.random(); return r < 0.3 ? ['guess', R(['ميسي', 'لوفي', 'باتمان', 'جمل'])] : r < 0.6 ? ['pass'] : null; }
        if (v.cur !== me && !v.ans[me]) return ['ans', R(['y', 'n', 'm'])];
      }
      return null;
    case 'mafia': {
      if (!v.alive[me]) return null; const al = v.rids.filter(id => v.alive[id]);
      if (v.ph === 'intro' && !v.ready[me]) return ['ready'];
      if (v.ph === 'night' && pv) {
        if (pv.role === 'm' && !pv.myKill) return ['kill', R(al.filter(x => !pv.mates.includes(x) && x !== me))];
        if (pv.role === 'd' && !pv.mySave) return ['save', R(al)];
        if (pv.role === 'p' && !pv.myCheck) return ['check', R(al.filter(x => x !== me))];
        if (pv.role === 'c' && !pv.slept) return ['sleep'];
      }
      if (v.ph === 'day' && !v.ready[me]) return ['rdy'];
      if (v.ph === 'vote' && !(v.votes && v.votes[me])) return ['vote', Math.random() < 0.15 ? 'skip' : R(al.filter(x => x !== me))];
      return null;
    }
    case 'wyr': if (v.ph === 'q' && !v.done[me]) return ['pick', Math.random() < 0.5 ? 0 : 1]; if (v.ph === 'r' && host) return ['next']; return null;
    case 'mlt': if (v.ph === 'q' && !v.done[me]) return ['vote', R(v.ids.filter(x => x !== me))]; if (v.ph === 'r' && host) return ['next']; return null;
    case 'bluff':
      if (v.ph === 'write' && !v.done[me]) return ['fake', 'كذبة ' + me.slice(-2) + Math.floor(Math.random() * 99)];
      if (v.ph === 'pick' && !v.done[me]) { const ok = v.choices.map((_, i) => i).filter(i => !pv || i !== pv.myOpt); return ['pick', R(ok)]; }
      if (v.ph === 'r' && host) return ['next']; return null;
    case 'draw':
      if (v.ph === 'choose' && v.drawer === me) return ['choose', 0];
      if (v.ph === 'draw' && v.drawer !== me && !v.got[me]) { if (Math.random() < 0.25) { const dr = rooms.find(r => r.me.id === v.drawer); const w = dr && dr.pv && dr.pv.word; if (w && Math.random() < 0.5) return ['guess', w]; } return ['guess', R(['بيت', 'شمس', 'قطوة', 'سيارة'])]; }
      return null;
    case 'phone':
      if (v.ph === 'album') { if (host && Math.random() < 0.6) return ['next']; const it = v.alb.items[v.alb.items.length - 1]; if (it && it.by !== me && !it.likes.includes(me) && Math.random() < 0.5) return ['like', { c: v.alb.c, i: v.alb.items.length - 1 }]; return null; }
      if (pv && !pv.done) return pv.kind === 'draw' ? ['sub', [{ id: 'a' + me, c: '#ff3fa4', w: 8, p: [10, 10, 200, 200, 300, 120, 500, 400] }]] : ['sub', 'جملة ' + me];
      return null;
    case 'bomb':
      if (v.ph === 'play' && v.cur === me && Math.random() < 0.7) { const cands = dictArr.filter(w => w.includes(v.prompt) && w.length > 3); return ['word', Math.random() < 0.85 ? R(cands) : 'زززز']; }
      return null;
    case 'cats':
      if (v.ph === 'write') { const a = v.cats.map((c, i) => v.letter + R(['مل', 'رب', 'سن', 'كم'])); return Math.random() < 0.5 ? ['ans', a] : ['stop']; }
      if (v.ph === 'review') { if (Math.random() < 0.2) { const o = v.ids.filter(x => x !== me); return ['rej', { p: R(o), i: 0 }]; } return v.ok && v.ok[me] ? null : ['ok']; }
      if (v.ph === 'scores' && host) return ['next']; return null;
    case 'trivia': if (v.ph === 'q' && !v.done[me]) return ['ans', Math.floor(Math.random() * v.o.length)]; if (v.ph === 'a' && host) return ['next']; return null;
    case 'emoji': if (v.ph === 'q' && !(pv && pv.got) && Math.random() < 0.6) return ['g', R(['تايتانك', 'ماريو', 'ميسي', 'شي', 'الأسد الملك', 'ون بيس', 'جدة'])]; if (v.ph === 'a' && host) return ['next']; return null;
    case 'codenames': {
      const tm = v.team[me]; if (!tm) return null; const spy = v.spy[tm] === me;
      if (v.ph === 'clue' && tm === v.act && spy) return ['clue', { w: 'شي', n: 2 }];
      if (v.ph === 'guess' && tm === v.act && !spy) { const open = v.words.map((_, i) => i).filter(i => !v.rev[i]); if (Math.random() < 0.12) return ['pass']; return ['rev', R(open)]; }
      return null;
    }
    case 'wave': {
      if (v.ph === 'clue' && v.psy === me) return ['clue', 'تلميح'];
      if (v.ph === 'guess' && v.psy !== me) { if (v.mode === 'ffa') return pv && pv.locked ? null : ['lock', Math.floor(Math.random() * 100)]; if (v.team[me] === v.team[v.psy]) return Math.random() < 0.5 ? ['move', Math.floor(Math.random() * 100)] : ['lock', Math.floor(Math.random() * 100)]; }
      if (v.ph === 'lr' && v.team[me] !== v.team[v.psy]) return ['lr', Math.random() < 0.5 ? 'l' : 'r'];
      if (v.ph === 'reveal' && host) return ['next']; return null;
    }
    case 'feud': {
      if (v.ph === 'a') return host ? ['next'] : null;
      const tm = v.team[me];
      const can = v.teams ? ((v.ph === 'q' && tm === v.act) || (v.ph === 'steal' && tm && tm !== v.act)) : (v.ph === 'q' && (v.x[me] || 0) < 3);
      if (can && Math.random() < 0.6) return ['g', R(['كبسة', 'قهوة', 'الجوال', 'بلوت', 'زحمة', 'سفر', 'خرابيط', 'ماي', 'حطب', 'سناب'])];
      return null;
    }
  }
  return null;
}

async function run() {
  const hub = new MemoryHub();
  const all = [];
  const settle = async () => { const t = realNow(); while (realNow() - t < 8000) { await hub.flush(); if (!hub.q.length && !all.some(r => r.flushing)) { await new Promise(r => setTimeout(r, 3)); if (!hub.q.length && !all.some(r => r.flushing)) return; } else await new Promise(r => setTimeout(r, 1)); } console.log('settle timeout'); };
  const mk = (id, name) => { const r = new Room({ code: '4242', me: { id, name, av: '😎', col: '#ff3fa4' }, transport: hub.transport('4242', id), games: GAMES, storage: memStorage(), packs: () => [], dictLoader: async () => dict, sync: true }); all.push(r); return r; };
  const rooms = [mk('phost', 'المضيف')]; await rooms[0].create(); await settle();
  for (let i = 1; i < N; i++) { const r = mk('p' + i, 'لاعب' + i); rooms.push(r); await r.join(); await settle(); }
  const host = rooms[0];
  { const f0 = host.flush.bind(host); host.nFlush = 0; host.flush = async () => { host.nFlush++; host.inFlush = (host.inFlush||0)+1; try { return await f0(); } finally { host.inFlush--; } }; }
  const okJoin = rooms.every(r => r.pub && r.pub.players.length === N && r.st === 'live');
  console.log('join ok:', okJoin, 'players', host.pub.players.length, rooms.map(r => r.st).join(','));
  if (!okJoin) process.exit(1);
  // private channel sanity: every non-host has the host key and could decrypt
  const results = [];
  for (const g of GAME_LIST) {
    if (ONLY && !ONLY.includes(g.id)) continue;
    if (N < g.min) { results.push([g.id, 'skip (min ' + g.min + ')']); continue; }
    for (const [k, val] of Object.entries(OPTS[g.id] || {})) { host.act('opt', { gid: g.id, k, v: val }); }
    host.act('start', g.id); await settle(); if (process.env.DBG) console.log('after start', g.id, host.pub.screen, host.E.S.screen, JSON.stringify(host.E.S.toast), host.pub.players.filter(p=>p.on).length);
    let steps = 0, idle = 0, err = null; const t0 = NOW;
    while (host.pub.screen === 'game' && steps < 4000) {
      steps++; let acted = false;
      for (const r of rooms) {
        if (!r.pub || !r.pub.game) continue;
        const a = bot(g.id, r.pub.game, r.pv, r.me.id, rooms);
        if (a) { r.gact(a[0], a[1]); acted = true; }
      }
      await settle();
      if (!acted || Math.random() < 0.15) { idle++; NOW += 3000; host.E.tick(); await settle(); }
      // consistency: all clients see the same version of the public game state
      const vs = new Set(rooms.map(r => r.pub && r.pub.screen)); if (vs.size > 1 && steps % 50 === 0) err = 'screens diverge ' + [...vs];
    }
    const ok = host.pub.screen === 'results';
    const res = host.pub.result;
    results.push([g.id, ok ? 'OK' : 'STUCK ph=' + (host.pub.game && host.pub.game.ph), steps + ' steps', Math.round((NOW - t0) / 1000) + 's', ok ? res.rows.map(r => r.pts).join('/') : '', err || '']);
    if (!ok) { console.log('STUCK', g.id, 'stage', host._stage, 'nFlush', host.nFlush, 'inFlush', host.inFlush, 'q', hub.q.length, 'flushing', host.flushing, 'again', host.again, 'engine ph', host.E && host.E.G && host.E.G.ph, 'pub ph', host.pub.game && host.pub.game.ph, 'screen', host.E && host.E.S.screen, 'toast', JSON.stringify(host.E && host.E.S.toast)); host.act('end'); await settle(); }
    // all clients agree on the result
    if (ok && !rooms.every(r => r.pub.screen === 'results' && r.pub.result && r.pub.result.gid === g.id)) results.push([g.id, 'clients did not get results']);
    host.act('lobby'); await settle();
  }
  console.table(results);
  console.log('messages', hub.sent, 'bytes', hub.bytes, 'night', host.pub.players.map(p => p.name + ':' + p.night).join(' '));
  // host transfer test
  await host.giveHost('p1'); await settle();
  console.log('xfer: new host', rooms[1].pub.hostId, 'p1 hosting', !!rooms[1].E, 'old host demoted', !rooms[0].E, 'ep', rooms[1].pub.ep);
  // kick test
  rooms[1].kick('p2'); await settle();
  console.log('kick: p2 state', rooms[2].st, 'players', rooms[1].pub.players.length);
}
run().catch(e => { console.error(e); process.exit(1); });
