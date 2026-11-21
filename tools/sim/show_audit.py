"""Summarise audit.mjs outputs: python show_audit.py a.json [b.json ...]"""
import json
import sys

for f in sys.argv[1:]:
    try:
        d = json.load(open(f, encoding='utf-8'))
    except Exception as e:  # noqa: BLE001
        print(f, 'unreadable:', e)
        continue
    print('=' * 110)
    print(f, '| profile', d.get('profile'), '| boot', d.get('bootMs'), 'ms | cpu', d.get('cpuSlowdown'), 'x | ok', d.get('ok'), d.get('error') or '')
    print('console errors:', d.get('consoleErrors'))
    print('failed requests:', d.get('failedRequests'))
    for s in d.get('screens', []):
        flags = []
        if s.get('placeholder'):
            flags.append('PLACEHOLDER')
        if s.get('errors'):
            flags.append('ERRORS ' + ' | '.join(s['errors'])[:160])
        if s.get('leftRunning'):
            flags.append('LEFT RUNNING ' + ' ;; '.join(s['leftRunning'])[:260])
        if s.get('listenersAfterLeaving') not in (None, 'same'):
            flags.append('LISTENERS CHANGED -> ' + str(s['listenersAfterLeaving'])[:160])
        if s.get('brokenImgs'):
            flags.append('BROKEN IMG ' + ', '.join(s['brokenImgs'])[:120])
        if s.get('clipped'):
            flags.append('OFF CANVAS ' + ' ; '.join(s['clipped'])[:200])
        if s.get('small'):
            flags.append('SMALL TARGETS ' + ' ; '.join('%sx%s %s' % (x['w'], x['h'], x['what']) for x in s['small'])[:240])
        print('\n%-26s nodes %4s  raf/s %5s  timeouts/s %5s  anims %3s  canvases %s imgs %s  targets %s' % (
            s['route'][:26], s.get('nodes'), s.get('rafPerSec'), s.get('timeoutsPerSec'), s.get('anims'), s.get('canvases'), s.get('imgs'), s.get('hitTargets')))
        if s.get('endless'):
            print('     endless:', ' ; '.join(s['endless'])[:230])
        if s.get('intervals'):
            print('     intervals:', ' ;; '.join(i[:120] for i in s['intervals'])[:400])
        for fl in flags:
            print('     !!', fl)
    print('\nstart', d.get('start'), '\nafter audit', d.get('afterAudit'))
    for r in d.get('soak', []):
        print('  soak round', r)
    print('intervals alive after audit:', d.get('intervalsAlive'))
    print('intervals alive after soak:', d.get('intervalsAliveAfterSoak'))
    print('memory', d.get('memory'))
