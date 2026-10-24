import runpy,time,json,pathlib,re
h=runpy.run_path(str(pathlib.Path(__file__).with_name('native_helpers.py')));globals().update({k:v for k,v in h.items() if not k.startswith('__')})
sh('am','force-stop',PKG);sh('cmd','locale','set-app-locales',PKG,'--locales','ko-KR');sh('wm','size','384x384');sh('settings','put','system','font_scale','2');time.sleep(2);launch();cap('final-home-192-ko-2');swipe();cap('final-home-scrolled-192-ko-2');click('기록');swipe();cap('final-list-scrolled-192-ko-2')
t=tree();n=next(n for n in t.iter('node') if n.get('clickable')=='true');x1,y1,x2,y2=map(int,re.findall(r'\d+',n.get('bounds')));sh('input','tap',str((x1+x2)//2),str((y1+y2)//2));time.sleep(2);cap('final-detail-top-192-ko-2');swipe();swipe();cap('final-detail-scrolled-192-ko-2')
created=json.loads((OUT/'fixture-ids.json').read_text());files=[f'files/recordings/{prefix}_{rid}.{ext}' for rid in created for prefix,ext in [('rec','m4a'),('meta','json')]]
assert (OUT/'source-hashes.txt').read_text().strip()==sh('run-as',PKG,'sha256sum',*files)
sh('am','force-stop',PKG);sh('wm','size','reset');sh('settings','put','system','font_scale','1');time.sleep(2);launch();cap('final-home-227-ko-1')
with (OUT/'behavior.txt').open('a') as f:f.write('Final explicit-clock-guard build: 192dp/font2 home, list, and detail scrolled captures; source fixture hashes unchanged.\n')
print('CLOCK CHECK PASSED',flush=True)
