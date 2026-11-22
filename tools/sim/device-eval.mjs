// node tools/sim/device-eval.mjs "<javascript>"          run it in the page on the tablet
// node tools/sim/device-eval.mjs --file some-script.js    (same, from a file)
//
// Looks into the page that is running on a REAL tablet plugged in over USB: evaluates the
// JavaScript there (promises are awaited) and prints the result as JSON. Console errors
// that arrive meanwhile are printed too.
//
// Needs launcher app 1.27 or later and USB debugging on (the app only allows this then).
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const args = process.argv.slice(2);
const expression = args[0] === '--file' ? readFileSync(args[1], 'utf8') : args[0];
if (!expression) { console.error('usage: node device-eval.mjs "<javascript>"'); process.exit(2); }
const PORT = 9333;

const sockets = execFileSync('adb', ['shell', 'cat /proc/net/unix'], { encoding: 'utf8' }).match(/webview_devtools_remote_\d+/g) || [];
if (!sockets.length) { console.error('No page to look into: is the app 1.27+, running, and USB debugging on?'); process.exit(1); }
execFileSync('adb', ['forward', `tcp:${PORT}`, `localabstract:${sockets[sockets.length - 1]}`]);

const pages = (await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()).filter((t) => t.type === 'page');
// The screen itself, not the hidden copy used for remote help.
const visible = (t) => { try { return JSON.parse(t.description || '{}').visible !== false; } catch { return true; } };
const page = pages.find(visible) || pages[0];
if (!page) { console.error('The app has no page open.'); process.exit(1); }

const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((ok, fail) => { ws.addEventListener('open', ok); ws.addEventListener('error', () => fail(new Error('could not connect to the page'))); });
let id = 0; const waiting = {};
ws.addEventListener('message', (m) => {
  const d = JSON.parse(m.data);
  if (d.id && waiting[d.id]) { waiting[d.id](d); delete waiting[d.id]; return; }
  if (d.method === 'Runtime.exceptionThrown') console.error('PAGE ERROR:', String((d.params.exceptionDetails.exception || {}).description || d.params.exceptionDetails.text).slice(0, 300));
  if (d.method === 'Runtime.consoleAPICalled' && d.params.type === 'error') console.error('console.error:', d.params.args.map((a) => a.value ?? a.description ?? '').join(' ').slice(0, 300));
});
const send = (method, params = {}) => new Promise((r) => { const i = ++id; waiting[i] = r; ws.send(JSON.stringify({ id: i, method, params })); });
await send('Runtime.enable');
const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
if (r.result && r.result.exceptionDetails) {
  console.error('It threw:', String((r.result.exceptionDetails.exception || {}).description || r.result.exceptionDetails.text).slice(0, 600));
  process.exitCode = 1;
} else {
  console.log(JSON.stringify(r.result && r.result.result ? r.result.result.value : null, null, 1));
}
ws.close();
