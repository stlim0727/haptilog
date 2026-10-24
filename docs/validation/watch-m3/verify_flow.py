import runpy,time,json,subprocess,pathlib
h=runpy.run_path(str(pathlib.Path(__file__).with_name('native_helpers.py')));globals().update({k:v for k,v in h.items() if not k.startswith('__')})
sh('svc','power','stayon','true');sh('svc','wifi','disable');sh('svc','data','disable');sh('am','force-stop',PKG);sh('wm','size','reset');sh('settings','put','system','font_scale','1');sh('cmd','locale','set-app-locales',PKG,'--locales','ko-KR');time.sleep(2);launch()
before=set(sh('run-as',PKG,'ls','files/recordings').splitlines())
fixtures=[('EXPENSE','점심 식사',{'amount':12000,'currency':'KRW','category':'식비'}),('MEMO','회의 아이디어',{'action_items':['검토 일정 정하기']}),('WORKOUT','아침 러닝',{'notes':'가볍게 달린 기록'}),('TRAVEL','기차표 예약',{'notes':'금요일 오후 기차표 예약'})]
created=[]
for i,(kind,title,data) in enumerate(fixtures):
 click('녹음 시작',False);time.sleep(18 if kind=='TRAVEL' else 2)
 if i==0:cap('recording-227-ko-1')
 click('녹음 중지',False);time.sleep(2)
 current=set(sh('run-as',PKG,'ls','files/recordings').splitlines());new=[n for n in current-before if n.startswith('meta_')]
 assert len(new)==1,new
 meta=json.loads(cmd('exec-out','run-as',PKG,'cat','files/recordings/'+new[0]));rid=meta['id'];created.append(rid)
 fixture={'intent_type':kind,'summary':title,'transcript':'합성 UI 검증용 전문입니다. '+('원본 음성과 메타데이터는 보존합니다. '*45),'structured_data':data}
 subprocess.run([ADB,'exec-in','run-as',PKG,'tee','files/recordings/enrich_'+rid+'.json'],input=json.dumps(fixture,ensure_ascii=False).encode(),stdout=subprocess.DEVNULL,check=True)
 before=current
(OUT/'fixture-ids.json').write_text(json.dumps(created))
hashes=sh('run-as',PKG,'sha256sum',*[f'files/recordings/{prefix}_{rid}.{ext}' for rid in created for prefix,ext in [('rec','m4a'),('meta','json')]])
(OUT/'source-hashes.txt').write_text(hashes)
sh('am','force-stop',PKG);launch();click('기록',False);cap('list-travel-workout-227-ko-1')
click('기차표 예약');cap('detail-travel-227-ko-1');click('재생');cap('playing-227-ko-1');click('재생 중지',False);click('전체 텍스트 보기');cap('transcript-227-ko-1')
click('워치에서 삭제');cap('delete-confirm-227-ko-1');click('취소');back();cap('list-back-227-ko-1')
assert hashes==sh('run-as',PKG,'sha256sum',*[f'files/recordings/{prefix}_{rid}.{ext}' for rid in created for prefix,ext in [('rec','m4a'),('meta','json')]])
swipe();cap('list-memo-expense-227-ko-1');click('점심 식사');cap('detail-expense-227-ko-1')
sh('input','keyevent','KEYCODE_HOME');launch();cap('external-home-227-ko-1');click('설정',False);cap('settings-227-ko-1');back();cap('settings-back-227-ko-1')
sh('am','force-stop',PKG);launch()
assert hashes==sh('run-as',PKG,'sha256sum',*[f'files/recordings/{prefix}_{rid}.{ext}' for rid in created for prefix,ext in [('rec','m4a'),('meta','json')]])
(OUT/'behavior.txt').write_text('Four new emulator captures; derived classification fixtures only. No cloud consent or uploads.\nPlayback start/stop, transcript, delete cancellation, list Back, settings Back, external Home entry checked.\nSource hashes identical after cancellation and offline force-stop/restart:\n'+hashes+'\n')
print('FLOW PASSED',flush=True)
