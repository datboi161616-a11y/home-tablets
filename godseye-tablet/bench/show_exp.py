import json,sys
for f in sys.argv[1:]:
    d=json.load(open(f,encoding='utf-8'))
    print('==',f,d.get('mission'),d.get('hz'),'Hz cpu',d.get('cpuSlowdown'),'x errors',d.get('consoleErrors'))
    for s in d.get('steps',[]):
        w=s.get('perFrameMs') or {}
        print('%-12s fps %5s busy/frame %6s ms (%s%%) canvas %s lvl %s tiles %s sse %s | hero %s' % (s['name'],s.get('fps'),s.get('busyMsPerFrame'),s.get('busyPct'),s.get('canvas'),s.get('level'),s.get('tiles'),s.get('sse'),s.get('hero')))
        ren={'updateAndExecuteCommands':'execCmds','_syncRightPanelAdaptiveLayout':'syncRight','layoutRightPanelRail':'layRight','refreshSelectedSubject':'refreshSel','(garbage collector)':'gc','drawWorldOverlay':'overlay','layoutLeftPanelRail':'layLeft'}
        print('     ', '  '.join('%s %s' % (ren.get(k,k), v) for k,v in w.items() if v and k not in ('_drawOverlay','tick','refresh','host.update','_focusIcons')))
