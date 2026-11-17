// The hub: one Durable Object that every tablet and every open dashboard
// connects to over WebSockets. Uses the hibernation API so idle connections
// cost nothing (keep-alive "ping" is answered without waking the object).
//
// Tablets:    /ws/device?id=<id>&secret=<secret>&name=<name>
//   - first connection registers the tablet as "pending"; it does nothing until
//     you approve it in the dashboard. The secret (made on the tablet) is stored
//     only as a hash.
// Dashboards: /ws/admin?token=<login token>   (checked in index.js)
import { DurableObject } from 'cloudflare:workers';

const MAX_PENDING = 20;
const MAX_STATUS = 48 * 1024;       // status includes the tablet's app list
const MAX_FRAME = 900 * 1024;       // Cloudflare's WebSocket limit is 1 MiB per message
const PENDING_STATUS_EVERY_MS = 30 * 1000; // pending tablets: at most one status write per 30s
const SHOT_EVERY_MS = 20 * 1000;

const enc = new TextEncoder();
async function sha256hex(s) {
  const d = await crypto.subtle.digest('SHA-256', enc.encode(s));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
const clip = (s, n) => String(s ?? '').slice(0, n);
const isBase64 = (s) => /^[A-Za-z0-9+/]*={0,2}$/.test(s);

export class Hub extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.sql.exec(`CREATE TABLE IF NOT EXISTS devices (
      id TEXT PRIMARY KEY,
      secret_hash TEXT NOT NULL,
      name TEXT,
      approved INTEGER NOT NULL DEFAULT 0,
      created INTEGER,
      last_seen INTEGER,
      status TEXT,
      shot TEXT,
      shot_at INTEGER
    )`);
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
    this.lastShot = new Map(); // id -> ms (in memory only; fine if lost)
    this.pendingStatusAt = new Map(); // id -> ms of last status from a not-yet-approved tablet
  }

  // ------------------------------------------------------------ connections

  async fetch(req) {
    if (req.headers.get('Upgrade') !== 'websocket') return new Response('Expected WebSocket', { status: 426 });
    const url = new URL(req.url);
    const [client, server] = Object.values(new WebSocketPair());

    if (url.pathname === '/ws/admin') {
      this.ctx.acceptWebSocket(server, ['admin']);
      server.serializeAttachment({ role: 'admin', watching: null, mode: null });
      server.send(JSON.stringify({ type: 'devices', devices: this.list() }));
      return new Response(null, { status: 101, webSocket: client });
    }

    if (url.pathname === '/ws/device') {
      const id = url.searchParams.get('id') || '';
      const secret = url.searchParams.get('secret') || '';
      if (!/^[a-z0-9]{8,32}$/.test(id) || secret.length < 24) return new Response('Bad device', { status: 400 });
      const hash = await sha256hex(secret);
      const row = this.row(id);
      if (!row) {
        // The hub address is public, so strangers could fill the waiting list. Instead of
        // locking out your real tablets, drop the oldest offline request to make room.
        const pending = this.sql.exec('SELECT COUNT(*) AS n FROM devices WHERE approved = 0').one().n;
        if (pending >= MAX_PENDING) {
          const victim = this.sql.exec('SELECT id FROM devices WHERE approved = 0 ORDER BY last_seen ASC').toArray()
            .find((d) => !this.ctx.getWebSockets(`dev:${d.id}`).length);
          if (!victim) return new Response('Too many pending devices', { status: 429 });
          this.sql.exec('DELETE FROM devices WHERE id = ?', victim.id);
        }
        this.sql.exec('INSERT INTO devices (id, secret_hash, name, approved, created, last_seen) VALUES (?, ?, ?, 0, ?, ?)',
          id, hash, clip(url.searchParams.get('name') || 'New tablet', 60), Date.now(), Date.now());
      } else if (row.secret_hash !== hash) {
        return new Response('Wrong device secret', { status: 403 });
      }
      // Only one live connection per tablet.
      for (const old of this.ctx.getWebSockets(`dev:${id}`)) { try { old.close(4000, 'replaced'); } catch {} }
      this.ctx.acceptWebSocket(server, ['device', `dev:${id}`]);
      server.serializeAttachment({ role: 'device', id });
      this.touch(id);
      const r = this.row(id);
      server.send(JSON.stringify({ type: 'welcome', approved: !!r.approved, name: r.name }));
      this.broadcastDevices();
      this.updateStream(id);
      return new Response(null, { status: 101, webSocket: client });
    }
    return new Response('Not found', { status: 404 });
  }

  async webSocketMessage(ws, raw) {
    if (typeof raw !== 'string') return;
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }
    const a = ws.deserializeAttachment() || {};
    if (a.role === 'device') this.fromDevice(ws, a.id, msg);
    else if (a.role === 'admin') this.fromAdmin(ws, a, msg);
  }

  async webSocketClose(ws, code) {
    this.closed(ws);
    try { ws.close(code === 1005 ? 1000 : code, 'bye'); } catch {}
  }

  async webSocketError(ws) {
    this.closed(ws);
  }

  closed(ws) {
    const a = ws.deserializeAttachment() || {};
    if (a.role === 'device') {
      this.touch(a.id);
      // Give the socket list a moment to drop this connection before reporting.
      this.broadcastDevices([ws]);
    } else if (a.role === 'admin' && a.watching) {
      this.updateStream(a.watching, [ws]);
    }
  }

  // ------------------------------------------------------------ tablets → hub

  fromDevice(ws, id, msg) {
    const row = this.row(id);
    if (!row) { ws.close(4003, 'removed'); return; }

    if (msg.type === 'status') {
      const status = JSON.stringify(msg.status || {});
      if (status.length > MAX_STATUS) { this.dropped(id, 'status', status.length); return; }
      if (!row.approved) {
        const last = this.pendingStatusAt.get(id) || 0;
        if (Date.now() - last < PENDING_STATUS_EVERY_MS) return;
        this.pendingStatusAt.set(id, Date.now());
      }
      this.sql.exec('UPDATE devices SET status = ?, last_seen = ? WHERE id = ?', status, Date.now(), id);
      this.broadcast({ type: 'device', device: this.view(this.row(id)) });
      return;
    }
    if (!row.approved) return; // pending tablets may only report status

    if (msg.type === 'frame' || msg.type === 'shot') {
      const data = String(msg.data || '');
      if (data.length > MAX_FRAME) { this.dropped(id, msg.type === 'shot' ? 'HD screenshot' : 'picture', data.length); return; }
      if (!isBase64(data)) return; // only real image data reaches your dashboard
      const mode = msg.mode === 'control' ? 'control' : 'mirror';
      const frame = { type: 'frame', id, mode, data, mime: 'image/jpeg', w: msg.w | 0, h: msg.h | 0, hd: msg.type === 'shot' };
      for (const admin of this.admins()) {
        if (admin.deserializeAttachment()?.watching === id) this.send(admin, frame);
      }
      if (mode === 'control') return; // the list picture shows their real screen only
      // Keep a recent picture for the device list.
      const now = Date.now();
      if (msg.type === 'shot' || now - (this.lastShot.get(id) || 0) > SHOT_EVERY_MS) {
        this.lastShot.set(id, now);
        this.sql.exec('UPDATE devices SET shot = ?, shot_at = ? WHERE id = ?', `data:${frame.mime};base64,${data}`, now, id);
      }
      return;
    }
    if (msg.type === 'result') {
      this.broadcast({ type: 'result', id, cmd: clip(msg.cmd, 40), ok: !!msg.ok, message: clip(msg.message, 300) });
    }
  }

  // ------------------------------------------------------------ dashboard → hub

  fromAdmin(ws, a, msg) {
    const id = clip(msg.id, 32);
    switch (msg.type) {
      case 'list':
        this.send(ws, { type: 'devices', devices: this.list() });
        break;
      case 'watch': {
        // 'both' (the dashboard): drive a hidden copy + small live picture of their screen.
        // 'mirror' / 'control' alone are also accepted.
        const before = a.watching;
        a.watching = id || null;
        a.mode = ['control', 'both'].includes(msg.mode) ? msg.mode : 'mirror';
        ws.serializeAttachment(a);
        if (before && before !== id) this.updateStream(before);
        if (id) {
          this.updateStream(id);
          const r = this.row(id);
          if (r?.shot && a.mode !== 'control') this.send(ws, { type: 'frame', id, mode: 'mirror', data: r.shot.split(',')[1], mime: r.shot.slice(5, r.shot.indexOf(';')), stale: true });
        }
        break;
      }
      case 'cmd': {
        const r = this.row(id);
        const devs = this.ctx.getWebSockets(`dev:${id}`);
        const dev = devs[devs.length - 1]; // the newest connection (older ones are closing)
        if (!r || !r.approved) return this.send(ws, { type: 'result', id, cmd: msg.cmd, ok: false, message: 'Tablet not approved' });
        if (!dev) return this.send(ws, { type: 'result', id, cmd: msg.cmd, ok: false, message: 'Tablet is offline' });
        this.send(dev, { type: 'cmd', cmd: clip(msg.cmd, 40), args: msg.args || {} });
        break;
      }
      case 'approve':
        this.sql.exec('UPDATE devices SET approved = 1, name = COALESCE(?, name) WHERE id = ?', msg.name ? clip(msg.name, 60) : null, id);
        for (const dev of this.ctx.getWebSockets(`dev:${id}`)) this.send(dev, { type: 'welcome', approved: true });
        this.broadcastDevices();
        break;
      case 'rename':
        this.sql.exec('UPDATE devices SET name = ? WHERE id = ?', clip(msg.name, 60), id);
        this.broadcastDevices();
        break;
      case 'remove':
        this.sql.exec('DELETE FROM devices WHERE id = ?', id);
        for (const dev of this.ctx.getWebSockets(`dev:${id}`)) { try { dev.close(4003, 'removed'); } catch {} }
        this.broadcastDevices();
        break;
    }
  }

  // ------------------------------------------------------------ helpers

  dropped(id, what, size) {
    this.broadcast({ type: 'result', id, cmd: 'hub', ok: false,
      message: `The tablet's ${what} was too big to pass on (${Math.round(size / 1024)} KB)` });
  }

  row(id) {
    return this.sql.exec('SELECT * FROM devices WHERE id = ?', id).toArray()[0];
  }

  touch(id) {
    this.sql.exec('UPDATE devices SET last_seen = ? WHERE id = ?', Date.now(), id);
  }

  view(r, exclude = []) {
    let status = {};
    try { status = JSON.parse(r.status || '{}'); } catch {}
    const online = this.ctx.getWebSockets(`dev:${r.id}`).some((w) => !exclude.includes(w));
    return {
      id: r.id, name: r.name, approved: !!r.approved, created: r.created,
      lastSeen: r.last_seen, online, status, shot: r.shot || null, shotAt: r.shot_at || null,
    };
  }

  list(exclude = []) {
    return this.sql.exec('SELECT * FROM devices ORDER BY approved DESC, name').toArray().map((r) => this.view(r, exclude));
  }

  admins() {
    return this.ctx.getWebSockets('admin');
  }

  send(ws, obj) {
    try { ws.send(JSON.stringify(obj)); } catch {}
  }

  broadcast(obj) {
    const s = JSON.stringify(obj);
    for (const ws of this.admins()) { try { ws.send(s); } catch {} }
  }

  broadcastDevices(exclude = []) {
    this.broadcast({ type: 'devices', devices: this.list(exclude) });
  }

  /**
   * Tell a tablet what to send, depending on who's watching it:
   * 'control' if anyone is driving the hidden copy, else 'mirror' if anyone
   * is watching their screen, else 'off'.
   */
  updateStream(id, exclude = []) {
    const r = this.row(id);
    const modes = this.admins()
      .filter((w) => !exclude.includes(w))
      .map((w) => w.deserializeAttachment())
      .filter((a) => a?.watching === id)
      .map((a) => a.mode);
    const control = modes.includes('control') || modes.includes('both');
    const mirror = modes.includes('mirror') || modes.includes('both');
    for (const dev of this.ctx.getWebSockets(`dev:${id}`)) {
      this.send(dev, { type: 'stream', on: !!(r?.approved && modes.length), control: !!(r?.approved && control), mirror: !!(r?.approved && mirror) });
    }
  }
}
