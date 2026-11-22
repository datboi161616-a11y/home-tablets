// Weather watches and warnings for the house, from the US National Weather Service
// (api.weather.gov: free, no key, readable from the tablet). Outside the US there
// are none, and that's fine: the service says so ("out of bounds") and we remember it,
// so the screen doesn't promise "no warnings" where nobody is watching. Cached for
// 10 minutes.
const CACHE_KEY = 'weather.alerts.v1';
const MAX_AGE = 10 * 60 * 1000;
const RANK = { Extreme: 0, Severe: 1, Moderate: 2, Minor: 3, Unknown: 4 };

// "* WHAT...Snow and gusty winds expected. Total snow…" -> the WHAT part, tidied.
function what(desc, headline) {
  const m = String(desc || '').match(/\*\s*WHAT\.\.\.([\s\S]*?)(?:\n\s*\n|\*\s*[A-Z ]+\.\.\.|$)/);
  let text = (m ? m[1] : String(desc || '').split(/\n\s*\n/)[0]).replace(/\s+/g, ' ').trim();
  if (!text) text = String(headline || '').replace(/\s+/g, ' ').trim();
  return text.length > 220 ? `${text.slice(0, 217)}…` : text;
}

// Still on? (ended ones go away, even from a saved copy)
const live = (list, now) => (list || []).filter((a) => !a.until || a.until > now);

/**
 * { list, covered, ok }:
 *   list     [{ event, severity, from (ms|null), until (ms|null), what, todo }] most serious first
 *   covered  true where the weather service issues warnings, false where it doesn't
 *            (outside the US), null when it couldn't be asked yet
 *   ok       the list is a real answer (fresh, or a recent saved one), not a guess
 */
export async function getAlertsInfo(loc) {
  if (!loc || typeof loc.lat !== 'number' || typeof loc.lon !== 'number') return { list: [], covered: null, ok: false };
  const key = `${loc.lat.toFixed(2)},${loc.lon.toFixed(2)}`;
  let cached = null;
  try { cached = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null'); } catch (e) { cached = null; }
  const now = Date.now();
  const mine = cached && cached.key === key ? cached : null;
  // Outside the US the answer doesn't change: ask again only once a day.
  if (mine && mine.covered === false && now - mine.at < 24 * 3600 * 1000) return { list: [], covered: false, ok: true };
  if (mine && now - mine.at < MAX_AGE) return { list: live(mine.list, now), covered: mine.covered !== false, ok: true };
  const save = (v) => { try { localStorage.setItem(CACHE_KEY, JSON.stringify(v)); } catch (e) { /* storage full */ } };
  try {
    const res = await fetch(`https://api.weather.gov/alerts/active?point=${key}`, {
      headers: { Accept: 'application/geo+json' }, signal: AbortSignal.timeout(10000),
    });
    if (res.status === 400) { // "out of bounds": not a place this service covers
      save({ at: now, key, list: [], covered: false });
      return { list: [], covered: false, ok: true };
    }
    if (!res.ok) throw new Error(`alerts ${res.status}`);
    const d = await res.json();
    const seen = {};
    const list = (d.features || []).map((f) => f.properties || {})
      .filter((p) => p.status === 'Actual' && p.messageType !== 'Cancel' && p.event)
      .map((p) => ({
        event: p.event,
        severity: p.severity || 'Unknown',
        from: Date.parse(p.onset || p.effective) || null,
        until: Date.parse(p.ends || p.expires) || null,
        what: what(p.description, p.headline),
        todo: String(p.instruction || '').replace(/\s+/g, ' ').trim().slice(0, 220),
      }))
      .filter((a) => !a.until || a.until > now)
      .sort((a, b) => (RANK[a.severity] ?? 4) - (RANK[b.severity] ?? 4))
      .filter((a) => (seen[a.event] ? false : (seen[a.event] = true))); // one per kind, the most serious
    save({ at: now, key, list, covered: true });
    return { list, covered: true, ok: true };
  } catch (e) {
    // Offline: a saved answer from the last few hours is still worth showing.
    if (mine && now - mine.at < 6 * 3600 * 1000) return { list: live(mine.list, now), covered: mine.covered !== false, ok: false };
    return { list: [], covered: mine ? mine.covered !== false : null, ok: false };
  }
}

/** [{ event, severity, from, until, what, todo }] most serious first; [] if none or offline. */
export async function getAlerts(loc) {
  return (await getAlertsInfo(loc)).list;
}

const dayAndTime = (ms) => {
  const d = new Date(ms);
  const now = new Date();
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: d.getMinutes() ? '2-digit' : undefined });
  if (d.toDateString() === now.toDateString()) return time;
  if (d.toDateString() === tomorrow.toDateString()) return `tomorrow ${time}`;
  return `${d.toLocaleDateString('en-US', { weekday: 'short' })} ${time}`;
};

/** "until Thu 7 PM" / "until 7 PM" */
export function untilText(ms) {
  if (!ms) return '';
  return `until ${dayAndTime(ms)}`;
}

/** "from tomorrow 6 AM until 7 PM", or just "until 7 PM" once it has started. */
export function whenText(a) {
  const starts = a && a.from && a.from > Date.now() + 5 * 60 * 1000;
  return [starts ? `from ${dayAndTime(a.from)}` : '', untilText(a && a.until)].filter(Boolean).join(' ');
}

/** What the kind of notice means, in plain words. */
export function kindText(a) {
  const e = String((a && a.event) || '');
  if (/warning/i.test(e)) return 'A warning: it is happening or about to. Take care now.';
  if (/watch/i.test(e)) return 'A watch: it could happen. Be ready.';
  if (/advisory/i.test(e)) return 'An advisory: not dangerous, but take care.';
  return '';
}

/**
 * Colour by how serious: the most dangerous a deep red, warnings red, watches amber,
 * advisories and statements a calm slate. (White text reads on all of them.)
 */
export const alertColor = (a) => {
  const e = String((a && a.event) || '');
  if (a && a.severity === 'Extreme') return '#7F1D1D';
  if (/warning/i.test(e) || (a && a.severity === 'Severe')) return '#B3261E';
  if (/watch/i.test(e)) return '#A25E12';
  if (/advisory|statement/i.test(e)) return '#4D5B70';
  return a && a.severity === 'Moderate' ? '#A25E12' : '#4D5B70';
};
