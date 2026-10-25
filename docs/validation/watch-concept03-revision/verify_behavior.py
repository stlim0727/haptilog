"""Real capture/playback check, separate from the nonfunctional visual preview host."""
import runpy,pathlib,time,json,subprocess
h=runpy.run_path('docs/validation/watch-m3/native_helpers.py');globals().update({k:v for k,v in h.items() if not k.startswith('__')})
OUT=pathlib.Path('docs/validation/watch-concept03-revision');cap.__globals__['OUT']=OUT
sh('wm','size','reset');sh('settings','put','system','font_scale','1');sh('cmd','locale','set-app-locales',PKG,'--locales','ko-KR');time.sleep(2)
sh('svc','wifi','disable');sh('svc','data','disable');sh('am','force-stop',PKG);launch()
before=set(sh('run-as',PKG,'ls','files/recordings').splitlines())
originalPaths=['files/recordings/'+n for n in sorted(before) if n.startswith(('rec_','meta_'))]
originalHashes=sh('run-as',PKG,'sha256sum',*originalPaths) if originalPaths else ''
click('녹음 시작',False);time.sleep(20);cap('actual-recording');click('녹음 중지',False);time.sleep(2)
after=set(sh('run-as',PKG,'ls','files/recordings').splitlines());new=[n for n in after-before if n.startswith('meta_')];assert len(new)==1,new
meta=json.loads(cmd('exec-out','run-as',PKG,'cat','files/recordings/'+new[0]));rid=meta['id']
paths=[f'files/recordings/rec_{rid}.m4a',f'files/recordings/meta_{rid}.json']
hashes=sh('run-as',PKG,'sha256sum',*paths)
assert int(sh('run-as',PKG,'stat','-c','%s',paths[0]))>0
# Only the derived sidecar is synthetic; source audio/time/duration stay intact.
fixture={'intent_type':'MEMO','summary':'동작 검증 기록','transcript':'실제 녹음 위에 추가한 합성 검증 전문입니다.','structured_data':{}}
subprocess.run([ADB,'exec-in','run-as',PKG,'tee',f'files/recordings/enrich_{rid}.json'],input=json.dumps(fixture,ensure_ascii=False).encode(),stdout=subprocess.DEVNULL,check=True)
sh('am','force-stop',PKG);launch();click('기록',False);click('동작 검증 기록');click('재생');cap('actual-playing');click('재생 중지',False)
click('전문 보기');swipe();t=cap('actual-transcript');assert fixture['transcript'] in labels(t)
click('워치에서 삭제');cap('actual-delete-confirm');click('취소');back();t=cap('actual-list-back');assert '기록' in labels(t)
sh('input','keyevent','KEYCODE_HOME');launch();t=cap('actual-external-home');assert '녹음 시작' in labels(t)
click('설정',False);back();t=tree();assert '녹음 시작' in labels(t)
sh('am','force-stop',PKG);launch();assert hashes==sh('run-as',PKG,'sha256sum',*paths)
assert not originalPaths or originalHashes==sh('run-as',PKG,'sha256sum',*originalPaths)
(OUT/'behavior.txt').write_text(f'Existing source audio/metadata files preserved: {len(originalPaths)}.\n'+'Actual MainActivity: offline capture start/stop; saved nonempty audio; process restart; playback start/stop; full text expansion; delete cancellation; detail Back to list; external entry to capture; settings Back.\nDerived memo sidecar is synthetic. Debug preview callbacks are not behavior evidence.\nSource audio/metadata hashes unchanged after cancellation and offline restart:\n'+hashes+'\n')
print('BEHAVIOR PASSED',flush=True)
