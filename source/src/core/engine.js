// Host-side authoritative engine. Pure logic: no DOM, no network.
import { rnd, pick, shuffle, sample, zeroPts, rank, clamp } from './util.js';

export const MAX_PLAYERS = 12;
const NIGHT = [3, 2, 1]; // night points for 1st/2nd/3rd

export class Engine {
  constructor({ code, me, games, clock, packs, dictLoader, changed }) {
    this.games = games; this.clock = clock || (() => Date.now());
    this.changed = changed || (() => { });
    this.packs = packs || [];
    this.dictLoader = dictLoader; this.dict = null;
    this.G = null;
    this.S = {
      code, hostId: me.id, hostPub: null, ep: 1,
      players: [], kicked: [], screen: 'lobby', sel: 'imposter', opts: {},
      packs: this.packMeta(), result: null, hist: [], toast: null, loading: false,
    };
    this.join(me, true);
  }
  // ---------- snapshot ----------
  snapshot() { return { S: this.S, G: this.G, packs: this.packs }; }
  restore(snap) { this.S = snap.S; this.G = snap.G; if (snap.packs) this.packs = snap.packs; this.S.packs = this.packMeta(); }
  packMeta() { return this.packs.map(p => ({ id: p.id, name: p.name, type: p.type, n: p.items.length })); }
  setPacks(packs) { this.packs = packs || []; this.S.packs = this.packMeta(); this.changed(); }

  // ---------- players ----------
  P(id) { return this.S.players.find(p => p.id === id); }
  join(p, silent) {
    if (this.S.kicked.includes(p.id)) return 'kicked';
    let x = this.P(p.id);
    if (!x) {
      if (this.S.players.length >= MAX_PLAYERS) return 'full';
      x = { id: p.id, name: '', av: '😎', col: '#ff3fa4', on: true, at: this.clock(), night: 0 };
      this.S.players.push(x);
      if (!silent) this.toast(`${clean(p.name)} دخل الروم`, 'join');
    }
    x.name = clean(p.name) || 'لاعب'; x.av = String(p.av || '😎').slice(0, 8); x.col = String(p.col || '#ff3fa4').slice(0, 9); x.on = true;
    if (!silent) this.changed();
    return 'ok';
  }
  setOnline(ids) {
    let ch = false;
    for (const p of this.S.players) { const on = p.id === this.S.hostId || ids.includes(p.id); if (p.on !== on) { p.on = on; ch = true; } }
    if (ch) { this.safeGame(g => g.leave && g.leave(this.ctx(), this.G)); this.changed(); }
  }
  toast(text, kind) { this.S.toast = { text, kind: kind || 'info', i: ((this.S.toast && this.S.toast.i) || 0) + 1 }; }

  // ---------- actions ----------
  act(pid, t, d) {
    const isHost = pid === this.S.hostId;
    const S = this.S;
    if (!this.P(pid) && t !== 'nudge') return;
    switch (t) {
      case 'nudge': this.tick(); return;
      case 'prof': { const p = this.P(pid); if (p && d) { p.name = clean(d.name) || p.name; p.av = String(d.av || p.av).slice(0, 8); p.col = String(d.col || p.col).slice(0, 9); this.changed(); } return; }
      case 'g': {
        if (S.screen !== 'game' || !this.G || !d) return;
        this.safeGame(g => g.act(this.ctx(), this.G, pid, String(d.t || ''), d.d));
        this.changed(); return;
      }
    }
    if (!isHost) return;
    switch (t) {
      case 'sel': if (this.games[d] && S.screen !== 'game') { S.sel = d; this.changed(); } return;
      case 'opt': { if (!d || !this.games[d.gid]) return; S.opts[d.gid] = { ...(S.opts[d.gid] || {}), [d.k]: d.v }; this.changed(); return; }
      case 'start': this.start(d || S.sel); return;
      case 'skip': if (this.G) { this.safeGame(g => g.tick(this.ctx(), this.G, true)); this.changed(); } return;
      case 'end': if (this.G) this.finish({ early: true }); return;
      case 'lobby': S.screen = 'lobby'; this.G = null; this.changed(); return;
      case 'kick': {
        if (d === S.hostId) return;
        S.players = S.players.filter(p => p.id !== d); if (!S.kicked.includes(d)) S.kicked.push(d);
        this.safeGame(g => g.leave && g.leave(this.ctx(), this.G)); this.changed(); return;
      }
      case 'resetNight': S.players.forEach(p => { p.night = 0; }); S.hist = []; this.changed(); return;
    }
  }
  optsFor(gid) {
    const g = this.games[gid], o = {};
    for (const op of gameOptions(g, this.S.packs)) o[op.k] = op.def;
    return { ...o, ...(this.S.opts[gid] || {}) };
  }
  async start(gid) {
    const S = this.S, g = this.games[gid];
    if (!g || S.loading) return;
    let ids = S.players.filter(p => p.on).map(p => p.id);
    if (ids.length < g.min) { this.toast(`${g.name} تحتاج ${g.min} لاعبين على الأقل`, 'warn'); this.changed(); return; }
    if (ids.length > g.max) ids = ids.slice(0, g.max);
    if (g.needs === 'dict' && !this.dict && this.dictLoader) {
      S.loading = true; this.changed();
      try { this.dict = await this.dictLoader(); } catch (e) { S.loading = false; this.toast('ما قدرنا نحمّل القاموس، جرّب مرة ثانية', 'warn'); this.changed(); return; }
      S.loading = false;
    }
    S.sel = gid;
    const opts = this.optsFor(gid);
    this.G = { gid, ids, opts, pts: zeroPts(ids), t0: this.clock() };
    S.screen = 'game'; S.result = null;
    const ctx = this.ctx();
    try { Object.assign(this.G, g.setup(ctx, this.G) || {}); }
    catch (e) { console.error(e); this.G = null; S.screen = 'lobby'; this.toast('صار خطأ في تشغيل اللعبة', 'warn'); }
    this.changed();
  }
  safeGame(fn) {
    if (!this.G) return;
    const g = this.games[this.G.gid];
    try { fn(g); } catch (e) { console.error('game error', e); this.toast('صار خطأ بسيط… كمّلوا', 'warn'); }
  }
  tick() {
    if (this.S.screen === 'game' && this.G) {
      let ch = false;
      this.safeGame(g => { ch = !!g.tick(this.ctx(), this.G, false); });
      if (ch && this.S.screen === 'game') this.changed();
    }
  }
  // ---------- finishing ----------
  finish(extra = {}) {
    const G = this.G, S = this.S, g = this.games[G.gid];
    const rows = rank(G.pts);
    const allSame = rows.length > 1 && rows.every(r => r.pts === rows[0].pts);
    for (const r of rows) {
      r.night = allSame ? 1 : (NIGHT[r.place - 1] || 0);
      const p = this.P(r.pid); if (p) p.night += r.night;
    }
    S.result = { gid: G.gid, rows, extra: extra || {}, at: this.clock() };
    S.hist.push({ gid: G.gid, win: rows.filter(r => r.place === 1).map(r => r.pid), at: this.clock() });
    if (S.hist.length > 40) S.hist.shift();
    S.screen = 'results'; this.G = null;
    this.changed();
  }
  // ---------- context for games ----------
  ctx() {
    const E = this, G = this.G;
    return {
      now: () => E.clock(),
      G, ids: G ? G.ids : [], host: E.S.hostId,
      on: pid => { const p = E.P(pid); return !!(p && p.on); },
      active: () => (G ? G.ids.filter(id => { const p = E.P(id); return p && p.on; }) : []),
      name: pid => (E.P(pid) || {}).name || '؟',
      rnd, pick, shuffle, sample, clamp,
      packs: E.packs, dict: E.dict,
      bump: () => { G._v = (G._v || 0) + 1; },
      fx: s => { G._fx = { i: ((G._fx && G._fx.i) || 0) + 1, s }; G._v = (G._v || 0) + 1; },
      finish: extra => E.finish(extra),
      toast: (t, k) => E.toast(t, k),
    };
  }
  // ---------- views ----------
  pub() {
    const S = this.S, out = { ...S };
    if (S.screen === 'game' && this.G) {
      const g = this.games[this.G.gid];
      let view = {};
      try { view = g.view(this.ctx(), this.G) || {}; } catch (e) { console.error(e); }
      out.game = { id: this.G.gid, ids: this.G.ids, pts: this.G.pts, fx: this.G._fx || null, opts: this.G.opts, ...view };
    } else out.game = null;
    return out;
  }
  priv(pid) {
    if (this.S.screen !== 'game' || !this.G) return null;
    const g = this.games[this.G.gid];
    try { return g.pv ? (g.pv(this.ctx(), this.G, pid) || null) : null; } catch (e) { console.error(e); return null; }
  }
}
export const gameOptions = (g, packs) => (typeof g.options === 'function' ? g.options(packs || []) : (g.options || []));
function clean(s) { return String(s || '').replace(/[<>]/g, '').trim().slice(0, 18); }
