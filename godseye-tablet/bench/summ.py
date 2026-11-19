"""Summarise profile.mjs outputs: python summ.py a.json [b.json ...] [--top N]"""
import json
import sys

files = [a for a in sys.argv[1:] if not a.startswith('--')]
top_n = 22
for i, a in enumerate(sys.argv):
    if a == '--top':
        top_n = int(sys.argv[i + 1])
        files = [f for f in files if f != sys.argv[i + 1]]

for f in files:
    try:
        d = json.load(open(f, encoding='utf-8'))
    except Exception as e:  # noqa: BLE001
        print(f, 'unreadable:', e)
        continue
    p = d.get('paced') or {}
    print('=' * 100)
    print(f, '| label', d.get('label'), '| cpu', d.get('cpuSlowdown'), 'x | pace', d.get('hz'), 'Hz')
    print('  drawn fps %.1f (turns %s, frames %s) | frame ms median %s p90 %s max %s | gap ms median %s p90 %s' % (
        d.get('fps') or 0, p.get('turns'), p.get('frames'),
        (p.get('frameMs') or {}).get('median'), (p.get('frameMs') or {}).get('p90'), (p.get('frameMs') or {}).get('max'),
        (p.get('gapMs') or {}).get('median'), (p.get('gapMs') or {}).get('p90')))
    print('  busy %s%% of the time | busy ms per drawn frame %s | gc %s%% | canvas %s msaa %s sse %s tiles %s | draws %s tris %s | heap %s MB' % (
        d.get('busyPct'), d.get('busyMsPerFrame'), d.get('gcPctOfBusy'), p.get('canvas'), p.get('msaa'), p.get('sse'), p.get('tiles'),
        p.get('drawsPerFrame'), p.get('trianglesPerFrame'), p.get('heapMB')))
    print('  holds', p.get('holds'), '| layers', p.get('layers'))
    print('  load', json.dumps(d.get('load'))[:300])
    g = p.get('governor')
    if g:
        print('  governor level %s fps %s cpu %s sharp %s' % (g.get('level'), g.get('fps') and round(g['fps'], 1), g.get('cpuMs') and round(g['cpuMs'], 1), g.get('sharpStill')))
    print('  memory', d.get('memory'), '| errors', (d.get('consoleErrors') or [])[:3])
    print('  -- files (self time)')
    for r in (d.get('topFiles') or [])[:8]:
        print('     %6s ms %5s%%  %s' % (r['ms'], r['pctOfBusy'], r['key'][:90]))
    print('  -- functions (self time)')
    for r in (d.get('topSelf') or [])[:top_n]:
        print('     %6s ms %5s%%  %s' % (r['ms'], r['pctOfBusy'], r['key'][:100]))
    print('  -- functions (with everything they call)')
    for r in (d.get('topInclusive') or [])[2:top_n + 14]:
        print('     %6s ms %5s%%  %s' % (r['ms'], r['pctOfBusy'], r['key'][:100]))
