// Room client: connects a transport, follows the host's state, and runs the Engine when hosting.
import { Engine } from './engine.js';
import { genKeys, derive, seal, open, keyTag } from '../net/crypto.js';

const wait = ms => new Promise(r => setTimeout(r, ms));

export class Room {
  constructor({ code, me, transport, games, storage, packs, dictLoader, sync, onChange, logRoom }) {
    Object.assign(this, { code, me, tr: transport, games, storage, sync: !!sync });
    this.packsFn = packs || (() => []);
    this.dictLoader = dictLoader; this.logRoom = logRoom;
    this.onChange = onChange || (() => { });
    this.st = 'connecting'; this.conn = 'down';
    this.pub = null; this.pv = null; this.v = 0; this.pvN = 0;
    this.E = null; this.offset = 0; this.offN = 0;
    this.peers = []; this.hostGoneAt = 0; this.claims = [];
    this.keysFor = {}; this.lastPv = new Map(); this.pvSeq = 0;
    this.listeners = {}; this.canvas = { did: null, strokes: [] };
    this.timers = []; this.flushing = false; this.again = false; this.flushTimer = null;
    this.joinedAt = Date.now(); this.lastSt = 0;
  }
  // ---------- small event bus for draw/live ----------
  on(t, fn) { (this.listeners[t] = this.listeners[t] || []).push(fn); return () => { this.listeners[t] = this.listeners[t].filter(f => f !== fn); }; }
  emit(t, d) { (this.listeners[t] || []).forEach(f => { try { f(d); } catch (e) { console.error(e); } }); }
  ui() { this.onChange(this); }
  setSt(s) { if (this.st !== s) { this.st = s; this.ui(); } }
  now() { return Date.now() + (this.E ? 0 : this.offset); }

  // ---------- connect ----------
  async connect() {
    if (!this.keys) this.keys = await genKeys();
    await this.tr.connect({ onMsg: (t, d) => this.onMsg(t, d), onPeers: l => this.onPeers(l), onStatus: s => this.onStatus(s) });
    this.tr.track({ name: this.me.name, av: this.me.av, col: this.me.col, at: this.joinedAt });
  }
  async create() {
    await this.connect();
    if (!this.sync) await wait(1300);
    if (this.peers.some(p => p.id !== this.me.id)) { this.tr.close(); this.st = 'taken'; return false; }
    const e = new Engine({ code: this.code, me: this.me, games: this.games, packs: this.packsFn(), dictLoader: this.dictLoader });
    this.becomeHost(e);
    if (this.logRoom) this.logRoom(this.code);
    return true;
  }
  async join() {
    await this.connect();
    const snap = this.storage.load(this.code);
    if (snap && snap.S && snap.S.hostId === this.me.id && Date.now() - (snap.at || 0) < 6 * 3600e3) {
      const e = new Engine({ code: this.code, me: this.me, games: this.games, packs: snap.packs, dictLoader: this.dictLoader });
      e.restore(snap); this.becomeHost(e); return;
    }
    this.hello();
    if (this.sync) return;
    for (let i = 0; i < 4 && !this.pub && this.st === 'connecting'; i++) { await wait(2000); if (!this.pub) this.hello(); }
    await wait(1500);
    if (!this.pub && this.st === 'connecting') { this.setSt('notfound'); this.tr.close(); }
  }
  hello() {
    const now = Date.now(); if (this.sync === false && now - (this.helloAt || 0) < 900) return; this.helloAt = now;
    this.tr.send('hello', { p: { id: this.me.id, name: this.me.name, av: this.me.av, col: this.me.col }, pub: this.keys.pub });
  }
  req() { const now = Date.now(); if (!this.sync && now - (this.reqAt || 0) < 1500) return; this.reqAt = now; this.tr.send('req', { f: this.me.id }); }
  close() {
    this.timers.forEach(clearInterval); this.timers = [];
    if (this.flushTimer) clearTimeout(this.flushTimer);
    try { this.tr.close(); } catch (e) { }
    if (this.st !== 'kicked' && this.st !== 'full') this.st = 'closed';
  }
  async leave() {
    // a leaving host hands the room to the next online player first
    if (this.E) {
      const next = this.pub && this.pub.players.find(p => p.id !== this.me.id && p.on && this.keysFor[p.id]);
      if (next) { await this.giveHost(next.id, true); await wait(400); }
      this.storage.clear(this.code);
    }
    this.close();
  }

  // ---------- inbound ----------
  async onMsg(t, d) {
    if (!d) return;
    switch (t) {
      case 'st': return this.onState(d);
      case 'pv': return this.onPriv(d);
      case 'hello': return this.E ? this.onHello(d) : undefined;
      case 'act': if (this.E && d.f) this.E.act(d.f, d.t, d.d); return;
      case 'req': if (this.E && d.f) { this.lastPv.delete(d.f); this.schedule(); if (this.canvas.did != null) this.tr.send('dsync', this.canvas); } return;
      case 'kick': if (d.pid === this.me.id) { this.st = 'kicked'; this.close(); this.ui(); } return;
      case 'full': if (d.pid === this.me.id && !this.pub) { this.st = 'full'; this.close(); this.ui(); } return;
      case 'xfer': if (d.to === this.me.id) return this.onXfer(d); return;
      case 'claim': this.claims.push(d); return;
      case 'draw': this.applyDraw(d); this.emit('draw', d); return;
      case 'dsync': if (d.did != null) { this.canvas = { did: d.did, strokes: d.strokes || [] }; this.emit('dsync', d); } return;
      case 'live': this.emit('live', d); return;
    }
  }
  async onState(d) {
    const s = d.s; if (!s || s.code !== this.code) return;
    const curEp = this.E ? this.E.S.ep : (this.pub ? this.pub.ep : 0);
    if (s.ep < curEp) return;
    if (this.E) {
      // someone else is hosting a newer (or tie-broken) epoch → step down
      if (s.ep > this.E.S.ep || (s.ep === this.E.S.ep && s.hostId !== this.me.id && s.hostId < this.me.id)) this.demote();
      else return;
    }
    // clock offset from the host (smoothed)
    const sample = d.now - Date.now();
    this.offset = this.offN++ === 0 ? sample : Math.round(this.offset * 0.7 + sample * 0.3);
    this.lastSt = Date.now();
    if (this.pub && s.ep === this.pub.ep && d.v <= this.v) return;
    const newHost = !this.pub || this.pub.hostId !== s.hostId || keyTag(this.pub.hostPub) !== keyTag(s.hostPub);
    this.v = d.v; this.pub = s;
    if (this.joinedAt && this.st === 'connecting') this.st = 'live';
    if (s.kicked && s.kicked.includes(this.me.id)) { this.st = 'kicked'; this.close(); this.ui(); return; }
    if (s.players.some(p => p.id === s.hostId) && !this.peers.some(p => p.id === s.hostId) && this.peers.length) { if (!this.hostGoneAt) this.hostGoneAt = Date.now(); } else this.hostGoneAt = 0;
    if (newHost && s.hostPub) {
      this.hostTag = keyTag(s.hostPub);
      try { this.hostKey = await derive(this.keys.priv, s.hostPub); } catch (e) { this.hostKey = null; }
      this.pv = null; this.pvN = 0;
      this.hello();
      if (this.pendingPv) { const p = this.pendingPv; this.pendingPv = null; await this.onPriv(p); }
    } else if (!s.players.some(p => p.id === this.me.id)) this.hello();
    if (s.screen === 'game' && s.game && this.canvas.did != null && s.game.did !== this.canvas.did) this.canvas = { did: null, strokes: [] };
    this.ui();
  }
  async onPriv(d) {
    if (this.E || !d.m) return;
    const box = d.m[this.me.id]; if (!box) return;
    if (!this.hostKey || d.hk !== this.hostTag) { this.pendingPv = d; return; }
    try {
      const val = await open(this.hostKey, box);
      if (val.n > this.pvN) { this.pvN = val.n; this.pv = val.p; this.ui(); }
    } catch (e) { this.req(); }
  }
  async onHello(d) {
    if (!d.p || !d.p.id || !d.pub) return;
    const r = this.E.join(d.p);
    if (r === 'kicked') { this.tr.send('kick', { pid: d.p.id }); return; }
    if (r === 'full') { this.tr.send('full', { pid: d.p.id }); return; }
    try { this.keysFor[d.p.id] = await derive(this.keys.priv, d.pub); } catch (e) { return; }
    this.lastPv.delete(d.p.id);
    if (this.E) this.E.setOnline(this.peers.map(p => p.id).concat(d.p.id));
    this.schedule();
    if (this.canvas.did != null) this.tr.send('dsync', this.canvas);
  }
  onPeers(list) {
    this.peers = list;
    const ids = list.map(p => p.id);
    if (this.E) this.E.setOnline(ids);
    else if (this.pub) {
      const here = ids.includes(this.pub.hostId);
      if (!here && !this.hostGoneAt) this.hostGoneAt = Date.now();
      if (here) this.hostGoneAt = 0;
    }
    this.ui();
  }
  onStatus(s) {
    const was = this.conn; this.conn = s;
    if (s === 'up' && was === 'down' && this.pub) {
      if (this.E) { this.lastPv.clear(); this.schedule(); } else { this.hello(); this.req(); }
    }
    this.ui();
  }

  // ---------- hosting ----------
  becomeHost(e) {
    this.E = e;
    e.changed = () => this.schedule();
    e.S.hostId = this.me.id; e.S.hostPub = this.keys.pub; e.S.code = this.code;
    e.join(this.me, true);
    e.setOnline(this.peers.map(p => p.id));
    this.hostGoneAt = 0; this.st = 'live';
    if (!this.sync) {
      this.timers.push(setInterval(() => { if (this.E) this.E.tick(); }, 250));
      this.timers.push(setInterval(() => { if (this.E && this.pub) this.tr.send('st', { s: this.pub, v: this.v, now: Date.now() }); }, 4000));
    }
    this.schedule();
  }
  demote() {
    this.timers.forEach(clearInterval); this.timers = [];
    this.E = null; this.keysFor = {}; this.lastPv.clear();
    this.storage.clear(this.code);
    this.pv = null; this.pvN = 0; this.pub = null; this.v = 0;
  }
  schedule() {
    if (!this.E) return;
    if (this.sync) { this.queueFlush(); return; }
    if (this.flushTimer) return;
    this.flushTimer = setTimeout(() => { this.flushTimer = null; this.queueFlush(); }, 130);
  }
  async queueFlush() {
    if (this.flushing) { this.again = true; return; }
    this.flushing = true;
    try { do { this.again = false; await this.flush(); } while (this.again && this.E); }
    finally { this.flushing = false; }
  }
  async flush() {
    const E = this.E; if (!E) return;
    const s = E.pub();
    this.v++; this.pub = s;
    this.tr.send('st', { s, v: this.v, now: Date.now() });
    const hk = keyTag(this.keys.pub);
    let out = {}, size = 0;
    for (const p of s.players) {
      const pv = E.priv(p.id);
      if (p.id === this.me.id) { this.pv = pv; continue; }
      if (!p.on) continue;
      const key = this.keysFor[p.id]; if (!key) continue;
      const j = JSON.stringify(pv);
      if (this.lastPv.get(p.id) === j) continue;
      this.lastPv.set(p.id, j);
      out[p.id] = await seal(key, { n: ++this.pvSeq, p: pv });
      size += j.length;
      if (size > 50000) { this.tr.send('pv', { hk, m: out }); out = {}; size = 0; }
    }
    if (Object.keys(out).length) this.tr.send('pv', { hk, m: out });
    this.persist();
    this.ui();
  }
  persist() {
    if (!this.E) return;
    const now = Date.now();
    if (!this.sync && now - (this.savedAt || 0) < 700) {
      if (!this.saveTimer) this.saveTimer = setTimeout(() => { this.saveTimer = null; this.persist(); }, 800);
      return;
    }
    this.savedAt = now;
    try { this.storage.save(this.code, { ...this.E.snapshot(), at: now }); } catch (e) { }
  }
  async giveHost(pid, leaving) {
    if (!this.E) return false;
    const key = this.keysFor[pid]; if (!key) return false;
    const snap = JSON.parse(JSON.stringify(this.E.snapshot()));
    snap.S.ep += 1; snap.S.hostId = pid;
    const box = await seal(key, snap);
    this.tr.send('xfer', { to: pid, box, ep: snap.S.ep });
    if (leaving) return true;
    // stay host until the new host announces itself; give up after a few seconds
    setTimeout(() => { if (this.E && this.E.S.ep < snap.S.ep) { this.E.toast('ما قدرنا ننقل المضيف', 'warn'); this.E.changed(); } }, 5000);
    return true;
  }
  async onXfer(d) {
    if (!this.hostKey || this.E) return;
    let snap; try { snap = await open(this.hostKey, d.box); } catch (e) { return; }
    const e = new Engine({ code: this.code, me: this.me, games: this.games, packs: snap.packs, dictLoader: this.dictLoader });
    e.restore(snap); e.S.ep = d.ep; e.toast('صرت المضيف 👑', 'host');
    this.keysFor = {};
    this.becomeHost(e);
  }
  takeover() {
    if (this.E || !this.pub) return;
    const c = { f: this.me.id, at: Date.now(), ep: this.pub.ep + 1 };
    this.claims = [c];
    this.tr.send('claim', c);
    const base = this.pub;
    setTimeout(() => {
      const best = this.claims.filter(x => x.ep === c.ep).sort((a, b) => a.at - b.at || (a.f < b.f ? -1 : 1))[0];
      if (!best || best.f !== this.me.id || this.E) return;
      const e = new Engine({ code: this.code, me: this.me, games: this.games, packs: this.packsFn(), dictLoader: this.dictLoader });
      Object.assign(e.S, { players: base.players.map(p => ({ ...p })), hist: base.hist || [], opts: base.opts || {}, sel: base.sel, kicked: base.kicked || [], ep: c.ep, screen: 'lobby' });
      e.toast('صرت المضيف 👑 رجعنا للوبي', 'host');
      this.becomeHost(e);
    }, this.sync ? 0 : 1500);
  }

  // ---------- outbound ----------
  act(t, d) { if (this.E) this.E.act(this.me.id, t, d); else this.tr.send('act', { f: this.me.id, t, d }); }
  gact(t, d) { this.act('g', { t, d }); }
  kick(pid) { if (!this.E) return; this.E.act(this.me.id, 'kick', pid); this.tr.send('kick', { pid }); }
  setPacks(packs) { if (this.E) this.E.setPacks(packs); }
  updateMe(me) { this.me = me; this.tr.track({ name: me.name, av: me.av, col: me.col, at: this.joinedAt }); this.act('prof', { name: me.name, av: me.av, col: me.col }); }
  live(d) { this.tr.send('live', { f: this.me.id, ...d }); }
  draw(d) { this.applyDraw(d); this.tr.send('draw', d); }
  drawSend(d) { this.tr.send('draw', d); }
  applyDraw(d) {
    if (d.did == null) return;
    if (this.canvas.did !== d.did) this.canvas = { did: d.did, strokes: [] };
    const S = this.canvas.strokes;
    if (d.x) { S.length = 0; return; }
    if (d.u) { const i = S.findIndex(s => s.id === d.u); if (i >= 0) S.splice(i, 1); return; }
    for (const st of d.s || []) {
      let s = S.find(z => z.id === st.id);
      if (!s) { s = { id: st.id, c: st.c, w: st.w, p: [] }; S.push(s); }
      s.p.push(...st.p);
    }
  }
}

export const browserStorage = {
  load(code) { try { return JSON.parse(localStorage.getItem('felha:host:' + code) || 'null'); } catch (e) { return null; } },
  save(code, snap) { localStorage.setItem('felha:host:' + code, JSON.stringify(snap)); },
  clear(code) { localStorage.removeItem('felha:host:' + code); },
};
export function memStorage() { const m = new Map(); return { load: c => m.get(c) || null, save: (c, s) => m.set(c, JSON.parse(JSON.stringify(s))), clear: c => m.delete(c) }; }
