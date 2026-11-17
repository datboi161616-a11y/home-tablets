// End-to-end test of remote admin, run in CI against a local hub (wrangler dev)
// and the real app in an Android emulator. Acts like you in the dashboard:
// approve the tablet, watch its screen, control the hidden copy, send commands.
//
// usage: node e2e.mjs <hub http base> <admin password> <output dir>
import { writeFileSync, mkdirSync } from 'node:fs';

const [base, password, outDir = '.'] = process.argv.slice(2);
mkdirSync(outDir, { recursive: true });
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const fail = (msg) => { console.error('E2E FAILED:', msg); process.exit(1); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const res = await fetch(`${base}/api/login`, { method: 'POST', body: JSON.stringify({ password }) });
const { token } = await res.json();
if (!token) fail('login');
log('logged in');

const ws = new WebSocket(`${base.replace(/^http/, 'ws')}/ws/admin?token=${encodeURIComponent(token)}`);
const inbox = [];
let waiters = [];
ws.onmessage = (e) => {
  if (e.data === 'pong') return;
  const m = JSON.parse(e.data);
  inbox.push(m);
  waiters = waiters.filter((w) => !w(m));
};
await new Promise((ok, bad) => { ws.onopen = ok; ws.onerror = () => bad(new Error('admin ws failed')); });
const send = (o) => ws.send(JSON.stringify(o));

/** Wait for a message matching pred (checks already-received ones first). */
function waitFor(pred, ms, what) {
  const hit = inbox.find(pred);
  if (hit) { inbox.splice(inbox.indexOf(hit), 1); return Promise.resolve(hit); }
  return new Promise((resolve) => {
    const t = setTimeout(() => fail(`timed out waiting for ${what}`), ms);
    waiters.push((m) => { if (pred(m)) { clearTimeout(t); resolve(m); return true; } return false; });
  });
}
const clear = () => { inbox.length = 0; };

// 1. A new tablet shows up and waits for approval.
const list = await waitFor((m) => m.type === 'devices' && m.devices.some((d) => !d.approved && d.online), 120000, 'pending tablet');
const dev = list.devices.find((d) => !d.approved && d.online);
log('pending tablet:', dev.id, JSON.stringify(dev.status).slice(0, 200));
if (!dev.status.app) fail('pending tablet sent no status');

send({ type: 'approve', id: dev.id, name: 'CI tablet' });
await waitFor((m) => m.type === 'devices' && m.devices.some((d) => d.id === dev.id && d.approved), 15000, 'approval');
log('approved');

const saveFrame = (m, name) => {
  writeFileSync(`${outDir}/${name}.jpg`, Buffer.from(m.data, 'base64'));
  log(`saved ${name}.jpg (${Math.round(m.data.length * 0.75 / 1024)} KB)`);
};
const result = async (cmd, args = {}) => {
  send({ type: 'cmd', id: dev.id, cmd, args });
  const r = await waitFor((m) => m.type === 'result' && m.cmd === cmd, 20000, `result of ${cmd}`);
  log(`${cmd} ->`, r.ok, r.message);
  if (!r.ok) fail(`${cmd}: ${r.message}`);
  return r;
};

// 2. Watch their screen.
clear();
send({ type: 'watch', id: dev.id, mode: 'mirror' });
saveFrame(await waitFor((m) => m.type === 'frame' && m.mode === 'mirror' && !m.stale, 30000, 'mirror frame'), 'remote-1-their-screen');

// 3. Change what's on their screen.
await result('show', { screen: 'calendar' });
await waitFor((m) => m.type === 'device' && m.device.id === dev.id && m.device.status.screen === 'calendar', 20000, 'status screen=calendar');
log('their screen reports: calendar');
await sleep(4000);
clear();
saveFrame(await waitFor((m) => m.type === 'frame' && m.mode === 'mirror' && !m.stale, 15000, 'mirror frame'), 'remote-2-their-screen-calendar');

// 4. Control the hidden copy: navigate and tap, without touching their screen.
clear();
send({ type: 'watch', id: dev.id, mode: 'control' });
await sleep(12000); // hidden copy loads the app
clear();
saveFrame(await waitFor((m) => m.type === 'frame' && m.mode === 'control', 30000, 'control frame'), 'remote-3-hidden-session');
await result('nav', { screen: 'forecast' });
await sleep(6000);
clear();
saveFrame(await waitFor((m) => m.type === 'frame' && m.mode === 'control', 15000, 'control frame'), 'remote-4-hidden-forecast');
await result('tap', { x: 0.5, y: 0.5 });
await result('swipe', { x1: 0.5, y1: 0.8, x2: 0.5, y2: 0.3, ms: 300 });

// 5. Their screen must still be on the calendar.
await result('status');
const st = await waitFor((m) => m.type === 'device' && m.device.id === dev.id, 15000, 'status');
if (st.device.status.screen !== 'calendar') fail(`their screen changed to ${st.device.status.screen}`);
log('their screen untouched: still calendar');
clear();
send({ type: 'watch', id: dev.id, mode: 'mirror' });
saveFrame(await waitFor((m) => m.type === 'frame' && m.mode === 'mirror' && !m.stale, 30000, 'mirror frame'), 'remote-5-their-screen-after');

// 6. Settings.
await result('pin', { pin: '4321' });
await result('shot');
saveFrame(await waitFor((m) => m.type === 'frame' && m.hd, 30000, 'HD shot'), 'remote-6-hd');

writeFileSync(`${outDir}/remote-status.json`, JSON.stringify(st.device, null, 2));
log('E2E PASSED');
ws.close();
process.exit(0);
