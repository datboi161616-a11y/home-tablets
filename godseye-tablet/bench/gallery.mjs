// Driver for drive.mjs: pictures of the tablet edition at the tablet's full
// 1920x1200, for showing what it looks like. Also checks that the film's look
// is put back afterwards.
export default async function drive({ ev, shot, sleep, log }) {
  const out = {};
  const pic = (name) => shot(`gallery-${name}`, { format: 'jpeg', quality: 90, scale: 1 });
  const choose = (id) => ev(`window.__gevTablet.missions.choose(${JSON.stringify(id)}).then(() => 'ok')`, 150000);
  const run = (name, args = {}) => ev(`window.__godsEyeView.voiceCommands.runner(${JSON.stringify(name)}, ${JSON.stringify(args)}).catch((e) => ({ ok: false, error: String(e) }))`, 60000);
  await sleep(5000);
  out.device = await ev(`(() => { const sc = window.__godsEyeView.viewer.scene; return { tileCacheSize: sc.globe.tileCacheSize, preloadSiblings: sc.globe.preloadSiblings, msaa: sc.msaaSamples, oit: Boolean(sc.orderIndependentTranslucency), cards: document.querySelectorAll('.tm-card svg').length, edition: document.documentElement.className }; })()`);
  await pic('01-missions-menu');

  log('planes');
  await choose('planes');
  await sleep(16000);
  await pic('02-planes');

  log('cockpit');
  await choose('cockpit');
  await sleep(9000);
  out.cockpit = await ev(`document.querySelector('.tm-now-tip').textContent`);
  await pic('03-cockpit');

  log('station');
  await choose('station');
  await sleep(10000);
  await pic('04-space-station');

  log('quakes');
  await choose('quakes');
  await sleep(10000);
  await pic('05-earthquakes');

  log('weather');
  await choose('weather');
  await sleep(11000);
  await pic('06-storms');

  log('launches');
  await choose('launches');
  await sleep(9000);
  await pic('07-launches');

  // The film, cut short: the look must come back.
  log('film');
  out.lookBefore = (await run('get_current_view_state'))?.style;
  await choose('show');
  await sleep(7000);
  out.lookDuring = (await run('get_current_view_state'))?.style;
  await choose('radio');
  await sleep(9000);
  const after = await run('get_current_view_state');
  out.lookAfter = { style: after?.style, bloom: after?.controls?.bloom, sharpen: after?.controls?.sharpen, detection: after?.controls?.detection?.detectionMode };
  await pic('08-radio');

  await ev(`(document.querySelector('.tm-bar .tm-button-round').click(), 'ok')`);
  await sleep(800);
  await pic('09-plain-english');
  await ev(`(document.querySelector('.tm-help .tm-button-round').click(), 'ok')`);

  log('all controls');
  await choose('planes');
  await sleep(12000);
  await ev(`(window.__gevTablet.missions.setSimple(false), 'ok')`);
  await sleep(1500);
  await pic('10-all-controls');
  await ev(`(window.__gevTablet.missions.setSimple(true), 'ok')`);
  out.governor = await ev(`window.__gevTablet.governor.state()`);
  out.changes = await ev(`window.__gevTablet.changes.slice(-12)`);
  return out;
}
