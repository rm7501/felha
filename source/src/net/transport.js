// Transports: Supabase Realtime (live), BroadcastChannel (local tabs, testing), Memory (node tests).
// Interface: connect({onMsg(t,d), onPeers(list), onStatus('up'|'down')}), send(t,d), track(meta), close()

export const SUPA = {
  url: 'https://lvsbboygaprblduztdhr.supabase.co',
  keys: ['sb_publishable_m5Y9BLHDQQuS6ZOhqysmSw_aJIingnT',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx2c2Jib3lnYXByYmxkdXp0ZGhyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTU2NDEyOTEsImV4cCI6MjExMTIxNzI5MX0.64eg9oJesh3TX4mgBefD_GU34xF_hrFXWtOP9hCS8XU'],
};

let supaMod = null;
async function supa() { if (!supaMod) supaMod = await import('@supabase/supabase-js'); return supaMod; }
let keyIdx = 0;
const clients = {};
async function sbClient(i) {
  if (!clients[i]) {
    const { createClient } = await supa();
    clients[i] = createClient(SUPA.url, SUPA.keys[i], { auth: { persistSession: false, autoRefreshToken: false }, realtime: { heartbeatIntervalMs: 15000 } });
  }
  return clients[i];
}
export async function logRoom(code) {
  try { const sb = await sbClient(keyIdx); await sb.from('felha_rooms').insert({ code }); } catch (e) { /* best effort */ }
}

export function supaTransport(code, myId) {
  let ch = null, sb = null, h = null, meta = null, closed = false, failures = 0, upOnce = false, ready = null;
  const peersOf = () => {
    const st = ch.presenceState();
    return Object.keys(st).map(k => ({ id: k, ...(st[k][0] || {}) }));
  };
  async function open() {
    sb = await sbClient(keyIdx);
    ch = sb.channel('felha-' + code, { config: { broadcast: { self: false, ack: false }, presence: { key: myId } } });
    ch.on('broadcast', { event: 'm' }, ({ payload }) => { if (payload && payload.t) h.onMsg(payload.t, payload.d); });
    ch.on('presence', { event: 'sync' }, () => h.onPeers(peersOf()));
    ch.subscribe(async (status) => {
      if (closed) return;
      if (status === 'SUBSCRIBED') {
        failures = 0; upOnce = true;
        if (meta) { try { await ch.track(meta); } catch (e) { } }
        h.onStatus('up');
        if (ready) { const r = ready; ready = null; r(); }
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        h.onStatus('down');
        failures++;
        // the publishable key might not be accepted yet: fall back to the legacy anon key once
        if (!upOnce && failures >= 2 && keyIdx === 0) { keyIdx = 1; try { await sb.removeChannel(ch); } catch (e) { } open(); }
      } else if (status === 'CLOSED') h.onStatus('down');
    });
  }
  const onVis = () => {
    if (document.visibilityState === 'visible' && sb && !closed) {
      try { if (!sb.realtime.isConnected()) sb.realtime.connect(); } catch (e) { }
    }
  };
  return {
    kind: 'supa',
    async connect(handlers) {
      h = handlers; if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onVis);
      // resolve once the channel is joined (or give up waiting after a while and let the room time out)
      await new Promise(res => { ready = res; open(); setTimeout(() => { if (ready) { ready = null; res(); } }, 10000); });
    },
    send(t, d) { if (ch) ch.send({ type: 'broadcast', event: 'm', payload: { t, d } }); },
    track(m) { meta = m; if (ch) ch.track(m).catch(() => { }); },
    close() { closed = true; if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVis); if (ch && sb) sb.removeChannel(ch); },
  };
}

// Same-browser tabs (for local testing): BroadcastChannel + heartbeat presence
export function localTransport(code, myId) {
  let bc, h, meta = {}, beat, closed = false;
  const peers = new Map();
  const emitPeers = () => h.onPeers([{ id: myId, ...meta }, ...[...peers.entries()].map(([id, p]) => ({ id, ...p.meta }))]);
  const prune = () => { const now = Date.now(); let ch = false; for (const [id, p] of peers) if (now - p.at > 2500) { peers.delete(id); ch = true; } if (ch) emitPeers(); };
  return {
    kind: 'local',
    async connect(handlers) {
      h = handlers; bc = new BroadcastChannel('felha:' + code);
      bc.onmessage = (e) => {
        const m = e.data; if (!m || m.f === myId) return;
        if (m.t === '_p') { const had = peers.has(m.f); peers.set(m.f, { meta: m.d, at: Date.now() }); if (!had) emitPeers(); return; }
        if (m.t === '_x') { peers.delete(m.f); emitPeers(); return; }
        h.onMsg(m.t, m.d);
      };
      beat = setInterval(() => { if (!closed) { bc.postMessage({ t: '_p', f: myId, d: meta }); prune(); } }, 600);
      bc.postMessage({ t: '_p', f: myId, d: meta });
      setTimeout(() => { h.onStatus('up'); emitPeers(); }, 30);
      addEventListener('pagehide', () => { try { bc.postMessage({ t: '_x', f: myId }); } catch (e) { } });
    },
    send(t, d) { if (!closed) bc.postMessage({ t, d: JSON.parse(JSON.stringify(d)), f: myId }); },
    track(m) { meta = m; if (bc) bc.postMessage({ t: '_p', f: myId, d: meta }); emitPeers && h && emitPeers(); },
    close() { closed = true; clearInterval(beat); try { bc.postMessage({ t: '_x', f: myId }); bc.close(); } catch (e) { } },
  };
}

// In-process hub for node simulations
export class MemoryHub {
  constructor() { this.rooms = new Map(); this.q = []; this.sent = 0; this.bytes = 0; }
  transport(code, myId) {
    const hub = this; let h, meta = {};
    const room = () => { if (!hub.rooms.has(code)) hub.rooms.set(code, new Map()); return hub.rooms.get(code); };
    const peers = () => [...room().entries()].map(([id, m]) => ({ id, ...m.meta }));
    const self = {
      kind: 'mem',
      async connect(handlers) { h = handlers; room().set(myId, { meta, h }); hub.later(() => { h.onStatus('up'); hub.syncPeers(code); }); },
      send(t, d) {
        const s = JSON.stringify(d); hub.sent++; hub.bytes += s.length;
        for (const [id, m] of room()) if (id !== myId) { const copy = JSON.parse(s); hub.later(() => m.h.onMsg(t, copy)); }
      },
      track(m) { meta = m; const r = room().get(myId); if (r) r.meta = m; hub.later(() => hub.syncPeers(code)); },
      close() { room().delete(myId); hub.later(() => hub.syncPeers(code)); },
    };
    return self;
  }
  syncPeers(code) { const r = this.rooms.get(code); if (!r) return; const list = [...r.entries()].map(([id, m]) => ({ id, ...m.meta })); for (const [, m] of r) m.h.onPeers(list); }
  later(fn) { this.q.push(fn); }
  async flush(max = 100000) {
    let n = 0;
    while (this.q.length && n < max) { const fn = this.q.shift(); n++; await fn(); await new Promise(r => setImmediate(r)); }
    return n;
  }
}
