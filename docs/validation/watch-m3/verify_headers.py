import runpy,time,json,pathlib,re
h=runpy.run_path(str(pathlib.Path(__file__).with_name('native_helpers.py')));globals().update({k:v for k,v in h.items() if not k.startswith('__')})
for size,font in [(192,2),(227,2),(192,1),(227,1)]:
 sh('am','force-stop',PKG);sh('cmd','locale','set-app-locales',PKG,'--locales','ko-KR');sh('wm','size','reset' if size==227 else '384x384');sh('settings','put','system','font_scale',str(font));time.sleep(2);launch();click('기록');click('기차표 예약')
 tag=f'{size}-ko-{font}';t=cap('detail-'+tag)
 node=next(n for n in t.iter('node') if n.get('text')=='여행');coords=list(map(int,re.findall(r'\d+',node.get('bounds'))));assert coords[1]>=60,coords
 if size==192 and font==2:
  click('재생');click('재생 중지',False);cap('playback-stopped-'+tag)
  click('워치에서 삭제');cap('delete-confirm-'+tag);click('취소');back();cap('list-back-'+tag)
 else:back()
 click('점심 식사');cap('detail-expense-'+tag)
 if font==2:
  # Amount lives after playback; capture it centered for readability inspection.
  swipe();swipe();cap('expense-data-'+tag)
sh('am','force-stop',PKG);sh('cmd','locale','set-app-locales',PKG,'--locales','en-US');sh('wm','size','384x384');sh('settings','put','system','font_scale','2');time.sleep(2);launch();click('Recordings');click('기차표 예약');cap('detail-192-en-2')
created=json.loads((OUT/'fixture-ids.json').read_text());files=[f'files/recordings/{prefix}_{rid}.{ext}' for rid in created for prefix,ext in [('rec','m4a'),('meta','json')]]
assert (OUT/'source-hashes.txt').read_text().strip()==sh('run-as',PKG,'sha256sum',*files)
with (OUT/'behavior.txt').open('a') as f:f.write('Final split-header build: category starts below reserved clock region at 192/227dp x font1/2. Playback stop/delete cancellation rechecked at 192dp font2; Expense detail/data captured at both sizes/font scales. Source hashes unchanged.\n')
print('FINAL DETAIL CHECK PASSED',flush=True)
