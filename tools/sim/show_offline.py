"""python show_offline.py offline-a.json [...]"""
import json, sys
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
for f in sys.argv[1:]:
    try:
        d = json.load(open(f, encoding='utf-8'))
    except Exception as e:
        print(f, 'unreadable', e); continue
    print('=' * 100)
    print(f, '| profile', d.get('profile'), '| second start first:', d.get('reloadFirst'), '| ok', d.get('ok'), d.get('error') or '')
    if 'keptCount' in d:
        print('  kept on the device before the Wi-Fi went: %s files, %s of them screens, %s data files; page: %s; fonts: %s' % (
            d.get('keptCount'), d.get('keptScreens'), d.get('keptData'), d.get('keptPage'), len(d.get('keptFonts') or [])))
        print('  targets cut:', d.get('sessionsCut'), '| started again with no Wi-Fi:', d.get('startedOffline'))
        a = d.get('afterStart') or {}
        print('  after that start:', {k: a.get(k) for k in ('route', 'text', 'nothing', 'title', 'body', 'fontFaces', 'outfitIsReal') if k in a})
        for s in d.get('screens') or []:
            state = 'CANT OPEN' if s.get('cantOpen') else 'COMING SOON' if s.get('comingSoon') else 'ok'
            real = ''.join(c for c, k in (('O', 'outfitIsReal'), ('X', 'oxaniumIsReal'), ('J', 'jetbrainsIsReal')) if s.get(k))
            print('   %-30s %-11s fonts %s/%s real[%s] %s | %s' % (str(s.get('route'))[:30], state, s.get('fontsLoaded'), s.get('fontFaces'), real, ('BROKEN IMG ' + ','.join(s['brokenImgs'])[:50]) if s.get('brokenImgs') else '', (s.get('text') or '')[:56]))
    else:
        keys = ('route', 'cantOpen', 'comingSoon', 'fontFaces', 'outfitIsReal', 'oxaniumIsReal', 'afterS')
        for label, key in (('while down', 'whileDown'), ('came back ', 'cameBack'), ('last seen ', 'lastSeen')):
            v = d.get(key)
            print('  %s: %s | %s' % (label, v and {k: v.get(k) for k in keys if k in v}, v and (v.get('text') or '')[:90]))
        print('  targets cut:', d.get('sessionsCut'))
        print('  requests after the network returned:', d.get('requestsAfterBack'))
    print('  console errors:', [e[:110] for e in d.get('consoleErrors') or []][:6])
