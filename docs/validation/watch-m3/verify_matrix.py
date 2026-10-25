import runpy,time,json,pathlib
h=runpy.run_path(str(pathlib.Path(__file__).with_name('native_helpers.py')));globals().update({k:v for k,v in h.items() if not k.startswith('__')})
for size in [227,192]:
 for font in [1,2]:
  sh('am','force-stop',PKG);sh('wm','size','reset' if size==227 else '384x384');sh('settings','put','system','font_scale',str(font));time.sleep(2);launch()
  tag=f'{size}-ko-{font}';cap('home-'+tag)
  click('녹음 시작',False);time.sleep(2);cap('recording-'+tag);click('녹음 중지',False)
  click('기록');cap('list-'+tag);click('기차표 예약');cap('detail-'+tag)
  if size==192 and font==2:
   click('재생');click('재생 중지',False);cap('playback-stopped-'+tag)
   click('워치에서 삭제');cap('delete-confirm-'+tag);click('취소');back();cap('list-back-'+tag)
  else:back()
  back();click('설정');cap('settings-'+tag);back()
sh('am','force-stop',PKG);sh('cmd','locale','set-app-locales',PKG,'--locales','en-US');time.sleep(2);launch()
cap('home-192-en-2');click('Recordings');cap('list-192-en-2');click('기차표 예약');cap('detail-192-en-2')
created=json.loads((OUT/'fixture-ids.json').read_text());files=[f'files/recordings/{prefix}_{rid}.{ext}' for rid in created for prefix,ext in [('rec','m4a'),('meta','json')]]
assert (OUT/'source-hashes.txt').read_text().strip()==sh('run-as',PKG,'sha256sum',*files)
with (OUT/'behavior.txt').open('a') as f:f.write('Matrix: 192/227dp x font 1/2, Korean home/capture/list/detail/settings; English 192dp font2 home/list/detail. Worst-case 192dp font2 playback stop and delete cancel checked. Fixture source hashes still identical.\n')
print('MATRIX PASSED',flush=True)
