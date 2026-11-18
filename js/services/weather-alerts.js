// Weather watches and warnings for the house, from the US National Weather Service
// (api.weather.gov: free, no key, readable from the tablet). Outside the US there
// are none, and that's fine. Cached for 10 minutes.
const CACHE_KEY = 'weather.alerts.v1';
const MAX_AGE = 10 * 60 * 1000;
const RANK = { Extreme: 0, Severe: 1, Moderate: 2, Minor: 3, Unknown: 4 };

// "* WHAT...Snow and gusty winds expected. Total snow…" -> the WHAT part, tidied.
function what(desc) {
  const m = String(desc || '').match(/\*\s*WHAT\.\.\.([\s\S]*?)(?:\n\s*\n|\*\s*[A-Z ]+\.\.\.|$)/);
  const text = (m ? m[1] : String(desc || '').split(/\n\s*\n/)[0]).replace(/\s+/g, ' ').trim();
  return text.length > 220 ? `${text.slice(0, 217)}…` : text;
}

/** [{ event, severity, until (ms|null), what, todo }] most serious first; [] if none or offline. */
export async function getAlerts(loc) {
  if (!loc || loc.lat == null) return [];
  const key = `${loc.lat.toFixed(2)},${loc.lon.toFixed(2)}`;
  let cached = null;
  try { cached = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null'); } catch (e) { cached = null; }
  const now = Date.now();
  if (cached && cached.key === key && now - cached.at < MAX_AGE) return cached.list.filter((a) => !a.until || a.until > now);
  try {
    const res = await fetch(`https://api.weather.gov/alerts/active?point=${key}`, {
      headers: { Accept: 'application/geo+json' }, signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) throw new Error(`alerts ${res.status}`);
    const d = await res.json();
    const seen = {};
    const list = (d.features || []).map((f) => f.properties || {})
      .filter((p) => p.status === 'Actual' && p.messageType !== 'Cancel' && p.event)
      .map((p) => ({
        event: p.event,
        severity: p.severity || 'Unknown',
        until: Date.parse(p.ends || p.expires) || null,
        what: what(p.description),
        todo: String(p.instruction || '').replace(/\s+/g, ' ').trim().slice(0, 220),
      }))
      .filter((a) => (seen[a.event] ? false : (seen[a.event] = true))) // one per kind
      .sort((a, b) => (RANK[a.severity] ?? 4) - (RANK[b.severity] ?? 4));
    localStorage.setItem(CACHE_KEY, JSON.stringify({ at: now, key, list }));
    return list;
  } catch (e) {
    return cached && cached.key === key ? cached.list.filter((a) => !a.until || a.until > now) : [];
  }
}

/** "until Thu 7 PM" / "until 7 PM" */
export function untilText(ms) {
  if (!ms) return '';
  const d = new Date(ms);
  const sameDay = d.toDateString() === new Date().toDateString();
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: d.getMinutes() ? '2-digit' : undefined });
  return `until ${sameDay ? '' : `${d.toLocaleDateString('en-US', { weekday: 'short' })} `}${time}`;
}

/** Warnings are red; watches and advisories amber. */
export const alertColor = (a) => (/warning/i.test(a.event) || a.severity === 'Extreme' || a.severity === 'Severe' ? '#B3261E' : '#B5701A');
